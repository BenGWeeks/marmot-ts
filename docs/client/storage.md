# Storage

Marmot persists its data through pluggable key/value stores: serialized MLS **group state**, local **key package** material, received **invites**, and the durable records behind ingest replay protection, fork recovery, removal, and disband. All of them share one interface, so any backend that matches its shape works — in-memory for tests, IndexedDB or LocalForage in the browser, the filesystem or SQLite on the server.

## The `GenericKeyValueStore` interface

```typescript
interface GenericKeyValueStore<T> {
  getItem(key: string): Promise<T | null>;
  setItem(key: string, value: T): Promise<T>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
}
```

The interface is exported from both the root and the `./utils` subpath:

```typescript
import type { GenericKeyValueStore } from "@internet-privacy/marmot-ts";
```

## All stores

| Constructor option   | Value type                                    | Holds                                                                                                   | If omitted                                                            |
| -------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `groupStateStore`    | `GenericKeyValueStore<SerializedClientState>` | Serialized MLS group state (one entry per group)                                                        | Required                                                              |
| `keyPackageStore`    | `GenericKeyValueStore<StoredKeyPackage>`      | Local key package public + private material and publish tracking                                        | Required                                                              |
| `inviteStore`        | `GenericKeyValueStore<StoredInviteEntry>`     | Received gift wraps and decrypted Welcome rumors                                                        | In-memory                                                             |
| `ingestStateStore`   | `GenericKeyValueStore<Uint8Array>`            | Terminal-wrapper and convergence-effect evidence (replay suppression, acknowledged state invalidations) | In-memory; `client.ingestPersistence` reports `{ kind: "ephemeral" }` |
| `rewindStore`        | `GenericKeyValueStore<Uint8Array>`            | The per-group [fork-history tree](/client/fork-history) used for fork recovery                          | In-memory; rebuilt from the current tip after a restart               |
| `removedMarkerStore` | `GenericKeyValueStore<boolean>`               | Marker that a removal from a group was already realized, so `removed` fires once across restarts        | In-memory                                                             |
| `lifecycleStore`     | `GenericKeyValueStore<Uint8Array>`            | Disband and lifecycle intent and terminal records                                                       | Stored in `groupStateStore` under scoped keys                         |

The spec requires replay evidence, fork-recovery state, and terminal records to survive a restart ([`protocol-core/durability.md`](https://github.com/marmot-protocol/marmot/blob/master/protocol-core/durability.md)). For production, back `ingestStateStore`, `rewindStore`, and `removedMarkerStore` with the same durable (ideally encrypted) storage as `groupStateStore`, and check `client.ingestPersistence.kind === "durable"` at startup.

- **`SerializedClientState`** is a `Uint8Array` — the encoded MLS client state.
- **`StoredKeyPackage`** carries a key package's public package plus its private key material and publish tracking. Treat it as **secret**.

::: warning Key package material is sensitive
`keyPackageStore` holds private keys. Use a store with the same protection you would give any signing key, and never share an instance across user accounts.
:::

## In-memory store

For tests and short-lived processes, the `./extra` subpath ships an in-memory implementation:

```typescript
import { InMemoryKeyValueStore } from "@internet-privacy/marmot-ts/extra";

import type { SerializedClientState } from "@internet-privacy/marmot-ts";
import type {
  StoredInviteEntry,
  StoredKeyPackage,
} from "@internet-privacy/marmot-ts/client";

const groupStateStore = new InMemoryKeyValueStore<SerializedClientState>();
const keyPackageStore = new InMemoryKeyValueStore<StoredKeyPackage>();
const inviteStore = new InMemoryKeyValueStore<StoredInviteEntry>();
```

## LocalForage (browser)

[LocalForage](https://github.com/localForage/localForage) instances satisfy `GenericKeyValueStore` directly (IndexedDB/WebSQL/localStorage under the hood):

```typescript
import localforage from "localforage";

const groupStateStore = localforage.createInstance({ name: "marmot-groups" });
const keyPackageStore = localforage.createInstance({ name: "marmot-keys" });
```

## Custom backend

Any object with the five methods works. A minimal adapter over a load/persist pair (for example a file):

```typescript
import type { GenericKeyValueStore } from "@internet-privacy/marmot-ts";

function fileStore<T>(
  load: () => Promise<Record<string, T>>,
  persist: (all: Record<string, T>) => Promise<void>,
): GenericKeyValueStore<T> {
  return {
    async getItem(key) {
      return (await load())[key] ?? null;
    },
    async setItem(key, value) {
      const all = await load();
      all[key] = value;
      await persist(all);
      return value;
    },
    async removeItem(key) {
      const all = await load();
      delete all[key];
      await persist(all);
    },
    async clear() {
      await persist({});
    },
    async keys() {
      return Object.keys(await load());
    },
  };
}
```

Stored values include `Uint8Array`s (`SerializedClientState`, `StoredKeyPackage`, and the `Uint8Array` stores above). Use a binary-safe encoding such as structured clone, CBOR, or base64 per field. Plain `JSON.stringify` silently corrupts them.

## Per-account isolation

Each user account **must** use completely isolated stores (all of the stores above) — mixing key package material between accounts would leak private keys. Namespace your stores by the account's public key:

```typescript
const store = localforage.createInstance({ name: `marmot-${pubkey}` });
```

See [Multi-Account Support](/client/marmot-client#multi-account-support) for the full pattern.

## Encrypted store (demo only)

The `./extra` subpath also exports `EncryptedKeyValueStore`, a password-encrypting wrapper.

::: danger Not for production
`EncryptedKeyValueStore` is a demonstration of the wrapping pattern only. It is **not** a secure at-rest encryption scheme — use platform key storage (Keychain, DPAPI, libsecret, WebCrypto + a hardware-backed key) for real deployments.
:::

## Next steps

- **[MarmotClient](/client/marmot-client)** — wiring stores into the client
- **[History](/client/history)** — message history is a separate, optional backend
- **[Client State](/core/state)** — what gets serialized into `groupStateStore`
