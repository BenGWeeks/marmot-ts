import { describe, expect, mock, test } from "bun:test";

import type { AuthSigner, PublishResponse } from "applesauce-relay/types";

import {
  autoAuthenticateRelays,
  type AuthWatchablePool,
  type AuthWatchableRelay,
  type Unsubscribable,
} from "./relay-auth.js";

/** Waits out every pending microtask (auth attempts are promise chains). */
async function flush(): Promise<void> {
  await Bun.sleep(0);
}

const SIGNER: AuthSigner = {
  signEvent: () => {
    throw new Error("not used by these tests");
  },
};

/**
 * `BehaviorSubject`-like fake: has a current value, emits it synchronously on
 * `subscribe`, and tracks live listener count for teardown assertions.
 */
class FakeState<T> {
  #value: T;
  #listeners = new Set<(value: T) => void>();

  constructor(initial: T) {
    this.#value = initial;
  }

  get listenerCount(): number {
    return this.#listeners.size;
  }

  subscribe(next: (value: T) => void): Unsubscribable {
    this.#listeners.add(next);
    next(this.#value);
    return {
      unsubscribe: () => {
        this.#listeners.delete(next);
      },
    };
  }

  next(value: T): void {
    this.#value = value;
    for (const listener of [...this.#listeners]) listener(value);
  }
}

/** `Subject`-like fake: no replay, tracks live listener count. */
class FakeSignal<T> {
  #listeners = new Set<(value: T) => void>();

  get listenerCount(): number {
    return this.#listeners.size;
  }

  subscribe(next: (value: T) => void): Unsubscribable {
    this.#listeners.add(next);
    return {
      unsubscribe: () => {
        this.#listeners.delete(next);
      },
    };
  }

  emit(value: T): void {
    for (const listener of [...this.#listeners]) listener(value);
  }
}

interface FakeRelay extends AuthWatchableRelay {
  challenge$: FakeState<string | null>;
  authRequiredForRead$: FakeState<boolean>;
  authRequiredForPublish$: FakeState<boolean>;
  authenticate: ReturnType<typeof mock<(signer: AuthSigner) => Promise<PublishResponse>>>;
}

function createFakeRelay(url: string): FakeRelay {
  return {
    url,
    challenge$: new FakeState<string | null>(null),
    authRequiredForRead$: new FakeState<boolean>(false),
    authRequiredForPublish$: new FakeState<boolean>(false),
    authenticate: mock(async () => ({ ok: true, from: url }) as PublishResponse),
  };
}

interface FakePool extends AuthWatchablePool {
  relays: Map<string, AuthWatchableRelay>;
  add$: FakeSignal<AuthWatchableRelay>;
  remove$: FakeSignal<AuthWatchableRelay>;
}

function createFakePool(relays: AuthWatchableRelay[] = []): FakePool {
  return {
    relays: new Map(relays.map((relay) => [relay.url, relay])),
    add$: new FakeSignal<AuthWatchableRelay>(),
    remove$: new FakeSignal<AuthWatchableRelay>(),
  };
}

describe("autoAuthenticateRelays", () => {
  test("Test 1: a challenge alone never authenticates (privacy / on-demand)", async () => {
    const relay = createFakeRelay("wss://relay.example/");
    const pool = createFakePool([relay]);
    const handle = autoAuthenticateRelays(pool, SIGNER);

    relay.challenge$.next("c1");
    await flush();

    expect(relay.authenticate).not.toHaveBeenCalled();
    handle.unsubscribe();
  });

  test("Test 2: read auth-required + challenge authenticates exactly once, in either order", async () => {
    const relay = createFakeRelay("wss://relay.example/");
    const pool = createFakePool([relay]);
    const handle = autoAuthenticateRelays(pool, SIGNER);

    relay.authRequiredForRead$.next(true);
    relay.challenge$.next("c1");
    await flush();

    expect(relay.authenticate).toHaveBeenCalledTimes(1);
    expect(relay.authenticate).toHaveBeenCalledWith(SIGNER);
    handle.unsubscribe();

    const relay2 = createFakeRelay("wss://relay2.example/");
    const pool2 = createFakePool([relay2]);
    const handle2 = autoAuthenticateRelays(pool2, SIGNER);

    relay2.challenge$.next("c1");
    relay2.authRequiredForRead$.next(true);
    await flush();

    expect(relay2.authenticate).toHaveBeenCalledTimes(1);
    expect(relay2.authenticate).toHaveBeenCalledWith(SIGNER);
    handle2.unsubscribe();
  });

  test("Test 3: publish auth-required + challenge authenticates once", async () => {
    const relay = createFakeRelay("wss://relay.example/");
    const pool = createFakePool([relay]);
    const handle = autoAuthenticateRelays(pool, SIGNER);

    relay.authRequiredForPublish$.next(true);
    relay.challenge$.next("c1");
    await flush();

    expect(relay.authenticate).toHaveBeenCalledTimes(1);
    handle.unsubscribe();
  });

  test("Test 4: re-emitting the same challenge and flags never re-authenticates", async () => {
    const relay = createFakeRelay("wss://relay.example/");
    const pool = createFakePool([relay]);
    const handle = autoAuthenticateRelays(pool, SIGNER);

    relay.authRequiredForRead$.next(true);
    relay.challenge$.next("c1");
    await flush();
    expect(relay.authenticate).toHaveBeenCalledTimes(1);

    relay.challenge$.next("c1");
    relay.authRequiredForRead$.next(false);
    relay.authRequiredForRead$.next(true);
    relay.authRequiredForPublish$.next(true);
    await flush();

    expect(relay.authenticate).toHaveBeenCalledTimes(1);
    handle.unsubscribe();
  });

  test("Test 5: a fresh challenge after reconnect authenticates again while required", async () => {
    const relay = createFakeRelay("wss://relay.example/");
    const pool = createFakePool([relay]);
    const handle = autoAuthenticateRelays(pool, SIGNER);

    relay.authRequiredForRead$.next(true);
    relay.challenge$.next("c1");
    await flush();
    expect(relay.authenticate).toHaveBeenCalledTimes(1);

    relay.challenge$.next(null);
    relay.challenge$.next("c2");
    await flush();
    expect(relay.authenticate).toHaveBeenCalledTimes(2);
    handle.unsubscribe();

    const relay2 = createFakeRelay("wss://relay2.example/");
    const pool2 = createFakePool([relay2]);
    const handle2 = autoAuthenticateRelays(pool2, SIGNER);

    relay2.authRequiredForRead$.next(false);
    relay2.authRequiredForPublish$.next(false);
    relay2.challenge$.next("c2");
    await flush();
    expect(relay2.authenticate).not.toHaveBeenCalled();
    handle2.unsubscribe();
  });

  test("Test 6: watches relays present at attach time and relays added later via add$", async () => {
    const existing = createFakeRelay("wss://existing.example/");
    const pool = createFakePool([existing]);
    const handle = autoAuthenticateRelays(pool, SIGNER);

    existing.authRequiredForRead$.next(true);
    existing.challenge$.next("c1");
    await flush();
    expect(existing.authenticate).toHaveBeenCalledTimes(1);

    const added = createFakeRelay("wss://added.example/");
    pool.add$.emit(added);
    added.authRequiredForRead$.next(true);
    added.challenge$.next("c1");
    await flush();
    expect(added.authenticate).toHaveBeenCalledTimes(1);

    handle.unsubscribe();
  });

  test("Test 7: authenticate failures are logged quietly and never retried for the same challenge", async () => {
    const rejecting = createFakeRelay("wss://rejecting.example/");
    rejecting.authenticate = mock(async () => {
      throw new Error("network down");
    });
    const throwing = createFakeRelay("wss://throwing.example/");
    throwing.authenticate = mock(() => {
      throw new Error("sync boom");
    });
    const refused = createFakeRelay("wss://refused.example/");
    refused.authenticate = mock(
      async () => ({ ok: false, message: "auth-required: nope", from: refused.url }) as PublishResponse,
    );

    const pool = createFakePool([rejecting, throwing, refused]);
    const log = mock((_formatter: string, ..._args: unknown[]) => {});
    const handle = autoAuthenticateRelays(pool, SIGNER, log);

    for (const relay of [rejecting, throwing, refused]) {
      relay.authRequiredForRead$.next(true);
      relay.challenge$.next("c1");
    }
    await flush();

    expect(rejecting.authenticate).toHaveBeenCalledTimes(1);
    expect(throwing.authenticate).toHaveBeenCalledTimes(1);
    expect(refused.authenticate).toHaveBeenCalledTimes(1);

    const loggedUrls = log.mock.calls.map((call) => call.join(" "));
    expect(loggedUrls.some((line) => line.includes(rejecting.url))).toBe(true);
    expect(loggedUrls.some((line) => line.includes(throwing.url))).toBe(true);
    expect(loggedUrls.some((line) => line.includes(refused.url))).toBe(true);

    // Re-emitting the same challenge must not retry any of the failed relays.
    for (const relay of [rejecting, throwing, refused]) {
      relay.challenge$.next("c1");
    }
    await flush();
    expect(rejecting.authenticate).toHaveBeenCalledTimes(1);
    expect(throwing.authenticate).toHaveBeenCalledTimes(1);
    expect(refused.authenticate).toHaveBeenCalledTimes(1);

    handle.unsubscribe();
  });

  test("Test 8: unsubscribe detaches every watcher; nothing authenticates afterward", async () => {
    const relay = createFakeRelay("wss://relay.example/");
    const pool = createFakePool([relay]);
    const handle = autoAuthenticateRelays(pool, SIGNER);

    handle.unsubscribe();
    handle.unsubscribe(); // idempotent

    expect(relay.challenge$.listenerCount).toBe(0);
    expect(relay.authRequiredForRead$.listenerCount).toBe(0);
    expect(relay.authRequiredForPublish$.listenerCount).toBe(0);
    expect(pool.add$.listenerCount).toBe(0);
    expect(pool.remove$.listenerCount).toBe(0);

    relay.authRequiredForRead$.next(true);
    relay.challenge$.next("c1");
    const added = createFakeRelay("wss://added.example/");
    pool.add$.emit(added);
    added.authRequiredForRead$.next(true);
    added.challenge$.next("c1");
    await flush();

    expect(relay.authenticate).not.toHaveBeenCalled();
    expect(added.authenticate).not.toHaveBeenCalled();
  });

  test("Test 9: removing one relay detaches only that relay's watchers", async () => {
    const kept = createFakeRelay("wss://kept.example/");
    const removed = createFakeRelay("wss://removed.example/");
    const pool = createFakePool([kept, removed]);
    const handle = autoAuthenticateRelays(pool, SIGNER);

    pool.remove$.emit(removed);

    expect(removed.challenge$.listenerCount).toBe(0);
    expect(removed.authRequiredForRead$.listenerCount).toBe(0);
    expect(removed.authRequiredForPublish$.listenerCount).toBe(0);
    expect(kept.challenge$.listenerCount).toBe(1);
    expect(kept.authRequiredForRead$.listenerCount).toBe(1);
    expect(kept.authRequiredForPublish$.listenerCount).toBe(1);

    removed.authRequiredForRead$.next(true);
    removed.challenge$.next("c1");
    kept.authRequiredForRead$.next(true);
    kept.challenge$.next("c1");
    await flush();

    expect(removed.authenticate).not.toHaveBeenCalled();
    expect(kept.authenticate).toHaveBeenCalledTimes(1);

    handle.unsubscribe();
  });
});
