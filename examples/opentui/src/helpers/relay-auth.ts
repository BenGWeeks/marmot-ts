import type { AuthSigner, PublishResponse } from "applesauce-relay/types";

import createDebug from "debug";

/**
 * On-demand NIP-42 relay authentication for the shared applesauce pool.
 *
 * This answers a relay's AUTH challenge (`kind:22242`, see NIP-42) only after
 * that relay has actually refused a REQ or EVENT with `auth-required` — never
 * on a bare challenge. Many relays send a challenge string on connect as a
 * matter of course, whether or not they ever gate anything; authenticating
 * discloses the account pubkey to whichever relay receives the AUTH event, so
 * this module only spends that disclosure on relays that have demonstrated
 * they will withhold data or refuse a publish without it.
 *
 * Reproduced case this fixes: at startup the app opens a long-lived
 * subscription for kind-1059 gift-wraps on the account's kind-10050 inbox
 * relays, which can include an auth-gated relay (e.g. `wss://relay.ditto.pub`).
 * That relay answers with an AUTH challenge and closes the REQ
 * `auth-required`. applesauce-relay then flags that `Relay` instance's
 * `authRequiredForRead$` true. Because the subscription's socket stays open,
 * every later REQ on it (default `waitForAuth: true`) blocks waiting for an
 * authentication that never arrives — so neither our own gift-wrapped
 * welcomes nor anyone else's public content on that relay connection is ever
 * returned. Once this watcher authenticates, applesauce's own `Relay.req`
 * retry (which waits on `authenticated$` when `waitForAuth` is true) resumes
 * every stalled REQ on that connection automatically; no other code needs to
 * change.
 *
 * This lives in the example rather than the library because upcoming
 * applesauce-relay versions are expected to add granular, built-in auth
 * controls; until then this stays small and local to `examples/opentui`.
 */

/** Minimal `{ unsubscribe(): void }` handle, matching RxJS `Subscription`. */
export interface Unsubscribable {
  unsubscribe(): void;
}

/**
 * Minimal subscribable of `T`, matching the subset of RxJS `Observable<T>`
 * this module needs. `BehaviorSubject`-backed observables (like `challenge$`
 * and the `authRequiredFor*$` streams) emit their current value synchronously
 * on `subscribe`, so watcher state must be declared before subscribing.
 */
export interface Subscribable<T> {
  subscribe(next: (value: T) => void): Unsubscribable;
}

/** Structural shape of an `applesauce-relay` `Relay` this module watches. */
export interface AuthWatchableRelay {
  readonly url: string;
  challenge$: Subscribable<string | null>;
  authRequiredForRead$: Subscribable<boolean>;
  authRequiredForPublish$: Subscribable<boolean>;
  authenticate(signer: AuthSigner): Promise<PublishResponse>;
}

/** Structural shape of an `applesauce-relay` `RelayPool` this module watches. */
export interface AuthWatchablePool {
  readonly relays: ReadonlyMap<string, AuthWatchableRelay>;
  add$: Subscribable<AuthWatchableRelay>;
  remove$: Subscribable<AuthWatchableRelay>;
}

type LogFn = (formatter: string, ...args: unknown[]) => void;

const relayAuthLog: LogFn = createDebug("opentui:relay-auth");

/** Live per-relay subscriptions, detachable as a unit. */
interface RelayWatcher {
  unsubscribe(): void;
}

/**
 * Watches every relay in `pool` (present now and added later via `add$`) and
 * answers a NIP-42 AUTH challenge with `signer` as soon as that relay has
 * both received a challenge and flagged itself `auth-required` for read or
 * publish. At most one authenticate attempt is made per (relay, challenge
 * string); a fresh challenge after reconnect (applesauce resets state on
 * disconnect) is authenticated again if auth is still required. Failures
 * (thrown, rejected, or `ok: false`) are logged via `log` and never thrown or
 * left as unhandled rejections.
 *
 * Call `unsubscribe()` on the returned handle to stop watching — this detaches
 * every relay watcher and the pool's `add$`/`remove$` subscriptions, and is
 * idempotent.
 */
export function autoAuthenticateRelays(
  pool: AuthWatchablePool,
  signer: AuthSigner,
  log: LogFn = relayAuthLog,
): Unsubscribable {
  let closed = false;
  const watched = new Map<AuthWatchableRelay, RelayWatcher>();

  function attach(relay: AuthWatchableRelay): void {
    if (closed || watched.has(relay)) return;

    // Declared before subscribing: the BehaviorSubject-backed streams emit
    // their current value synchronously on subscribe.
    let challenge: string | null = null;
    let readRequired = false;
    let publishRequired = false;
    let lastAttempted: string | null = null;

    function maybeAuthenticate(): void {
      if (closed) return;
      if (challenge === null) return;
      if (!(readRequired || publishRequired)) return;
      if (challenge === lastAttempted) return;
      // One attempt per challenge, set before calling, so a thrown/rejected/
      // ok:false outcome is never retried for the same challenge.
      lastAttempted = challenge;
      Promise.resolve()
        .then(() => relay.authenticate(signer))
        .then((response: PublishResponse) => {
          if (response.ok) {
            log("authenticated to %s", relay.url);
          } else {
            log("auth rejected by %s: %s", relay.url, response.message);
          }
        })
        .catch((error: unknown) => {
          log("auth failed for %s: %O", relay.url, error);
        });
    }

    const challengeSub = relay.challenge$.subscribe((value) => {
      challenge = value;
      maybeAuthenticate();
    });
    const readSub = relay.authRequiredForRead$.subscribe((value) => {
      readRequired = value;
      maybeAuthenticate();
    });
    const publishSub = relay.authRequiredForPublish$.subscribe((value) => {
      publishRequired = value;
      maybeAuthenticate();
    });

    watched.set(relay, {
      unsubscribe(): void {
        challengeSub.unsubscribe();
        readSub.unsubscribe();
        publishSub.unsubscribe();
      },
    });
  }

  function detach(relay: AuthWatchableRelay): void {
    const watcher = watched.get(relay);
    if (!watcher) return;
    watcher.unsubscribe();
    watched.delete(relay);
  }

  for (const relay of pool.relays.values()) attach(relay);

  const addSub = pool.add$.subscribe((relay) => attach(relay));
  const removeSub = pool.remove$.subscribe((relay) => detach(relay));

  return {
    unsubscribe(): void {
      if (closed) return;
      closed = true;
      addSub.unsubscribe();
      removeSub.unsubscribe();
      for (const watcher of watched.values()) watcher.unsubscribe();
      watched.clear();
    },
  };
}
