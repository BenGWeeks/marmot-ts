# Network interface

Marmot does not connect to relays itself. You pass a `NostrNetworkInterface` into `MarmotClient`; that same object is used by `KeyPackageManager`, `GroupsManager`, and each `MarmotGroup`. Event and filter types are applesauce's `NostrEvent` and `Filter`; nostr-tools' `Event` and `Filter` are structurally compatible.

## Contract

```typescript
interface NostrNetworkInterface {
  publish(
    relays: string[],
    event: Event,
  ): Promise<Record<string, PublishResponse>>;

  request(relays: string[], filters: Filter | Filter[]): Promise<Event[]>;

  subscription(
    relays: string[],
    filters: Filter | Filter[],
  ): Subscribable<Event>;

  getUserInboxRelays(pubkey: string): Promise<string[]>;
}
```

`Subscribable` is `{ subscribe(observer) → { unsubscribe() } }`; RxJS observables fit if they expose that shape.

- **`publish`** — Publish signed events to the listed relays. Return per-relay `ok` / `message` so failures surface after commits and welcomes. Used by `KeyPackageManager` (key packages, deletes), each group's `GroupRuntime` (MLS traffic, app messages), and Welcome delivery (gift wraps).

- **`request`** — One-shot REQ until EOSE; dedupe by `id` if you merge multiple filters. Used by `client.groups.connect()` / `connectAll()` to backfill a group's kind 445 history.

- **`subscription`** — Live updates; emit one event per `next`. Used by `client.groups.connect()` / `connectAll()` for live kind 445 traffic and by `client.invites.listen()`.

- **`getUserInboxRelays`** — Where `pubkey` receives gift-wrapped Welcomes (kind 1059), read from their kind 10050 `relay` tags. Welcome delivery calls it for each invitee. If it **throws**, delivery falls back to the group's relays. If it returns an **empty list**, delivery for that invitee fails and is reported as a failed Welcome outcome. Return `[]` only when the user really has no inbox list.

## Wiring `nostr-tools`

Minimal `SimplePool` adapter sketch:

```typescript
import type { Event } from "nostr-tools";
import type { Filter } from "nostr-tools/filter";
import type {
  NostrNetworkInterface,
  PublishResponse,
  Subscribable,
  Unsubscribable,
} from "@internet-privacy/marmot-ts/client";
import { getInboxRelays } from "@internet-privacy/marmot-ts";
import { SimplePool } from "nostr-tools/pool";

const pool = new SimplePool();
const METADATA_RELAYS = ["wss://relay.damus.io"];

function dedupeById(events: Event[]): Event[] {
  const seen = new Set<string>();
  return events.filter((e) =>
    seen.has(e.id) ? false : (seen.add(e.id), true),
  );
}

export function nostrToolsNetwork(): NostrNetworkInterface {
  return {
    async publish(relays, event) {
      const out: Record<string, PublishResponse> = {};
      const pending = pool.publish(relays, event);
      await Promise.all(
        relays.map(async (url, i) => {
          try {
            const reason = await pending[i];
            const msg = String(reason);
            const softFail = msg.startsWith("connection failure:");
            out[url] = {
              from: url,
              ok: !softFail,
              message: softFail ? msg : msg || undefined,
            };
          } catch (err) {
            out[url] = {
              from: url,
              ok: false,
              message: err instanceof Error ? err.message : String(err),
            };
          }
        }),
      );
      return out;
    },

    async request(relays, filters) {
      const list = Array.isArray(filters) ? filters : [filters];
      const all: Event[] = [];
      for (const f of list) {
        all.push(...(await pool.querySync(relays, f)));
      }
      return dedupeById(all);
    },

    subscription(relays, filters): Subscribable<Event> {
      const list = Array.isArray(filters) ? filters : [filters];
      return {
        subscribe(observer): Unsubscribable {
          const subs = list.map((f) =>
            pool.subscribe(relays, f, {
              onevent(ev) {
                observer.next?.(ev);
              },
            }),
          );
          return { unsubscribe: () => subs.forEach((s) => void s.close()) };
        },
      };
    },

    async getUserInboxRelays(pubkey) {
      const ev = await pool.get(METADATA_RELAYS, {
        kinds: [10050],
        authors: [pubkey],
        limit: 1,
      });
      if (!ev) return [];
      return getInboxRelays(ev);
    },
  };
}
```

KeyPackage discovery uses the account's kind 10002 NIP-65 write relays (`getNip65Relays(event, "write")`); Welcome delivery uses kind 10050 inbox relays (`getInboxRelays(event)`). See [`transports/nostr.md`](https://github.com/marmot-protocol/marmot/blob/master/transports/nostr.md).
