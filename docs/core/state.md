# Client State

ClientState contains all the information needed to operate an MLS group.

## What is ClientState?

ClientState is the MLS group state object containing:

- Current encryption keys
- Member list and their credentials
- Group context (including the app-component dictionary)
- Epoch number
- Pending proposals
- Tree structure

Think of it as a snapshot of the group at a specific point in time.

## Extracting Group Information

### Get the Marmot Group View

```typescript
import { getMarmotGroupView } from "@internet-privacy/marmot-ts";

const view = getMarmotGroupView(clientState);

console.log(view?.name); // "Developer Chat"
console.log(view?.adminPubkeys); // ["admin-hex"]
console.log(view?.relays); // ["wss://..."]
```

### Get Group Identifiers

```typescript
import { getGroupIdHex, getNostrGroupIdHex } from "@internet-privacy/marmot-ts";

// MLS group ID
const mlsGroupId = getGroupIdHex(clientState);

// Nostr group ID (from the transport.nostr.routing.v1 component)
const nostrGroupId = getNostrGroupIdHex(clientState);
```

### Get Group Metadata

```typescript
import { getEpoch, getMemberCount } from "@internet-privacy/marmot-ts";

const epoch = getEpoch(clientState); // Current epoch number
const memberCount = getMemberCount(clientState); // Number of members
```

## Serialization

ClientState must be serialized for storage and deserialized when loading.

### Serialize for Storage

```typescript
import { serializeClientState } from "@internet-privacy/marmot-ts";

const serialized = serializeClientState(clientState);
// serialized is Uint8Array (TLS binary format)

// Store in your preferred storage
await storage.save(groupId, serialized);
```

### Deserialize from Storage

```typescript
import { deserializeClientState } from "@internet-privacy/marmot-ts";

const serialized = await storage.load(groupId);

const clientState = deserializeClientState(serialized);
```

### Default Configuration

```typescript
import { defaultMarmotClientConfig } from "@internet-privacy/marmot-ts";

// Default ts-mls configuration used by Marmot helpers.
console.log(defaultMarmotClientConfig);
```

## State Updates

ClientState is immutable. Operations return a new state and leave the old one unchanged. Applications don't normally advance ClientState by hand: [`MarmotGroup`](/client/marmot-group) feeds kind 445 events through `group.ingest()`, which validates them and updates `group.state` for you.

::: warning Low-level only
`processMessage` from `@internet-privacy/marmot-ts/mls` applies MLS rules but none of Marmot's admin-policy, identity-proof, commit-legality or convergence checks. The Marmot credential policy it needs as `authService` is not part of the public API either. Applications should feed events to `MarmotGroup.ingest()` (see [MarmotGroup](/client/marmot-group)) or use `MarmotGroupEngine` from `@internet-privacy/marmot-ts/engine`.
:::

## Epoch Advancement

The epoch advances with each commit:

```typescript
import { getEpoch } from "@internet-privacy/marmot-ts";

console.log("Before commit:", getEpoch(group.state)); // 5

// Ingest a batch containing a commit; fully drain the generator
for await (const result of group.ingest(events)) {
  // result.kind: "processed" | "deferred" | "unreadable" | "rejected" | ...
}

console.log("After commit:", getEpoch(group.state)); // 6
```

Each epoch has its own keys (the MLS secrets and the kind 445 group-event key). A client can decrypt epoch N messages only while it holds epoch N state. Recent prior epochs are retained for late messages (see ts-mls `keyRetentionConfig` and [retained history](/client/fork-history)).

## Storage Considerations

### Security

- ClientState contains secret key material
- Store encrypted and access-controlled
- Never transmit over unencrypted channels

### Size

- Size scales with member count (ratchet tree) plus a bounded window of retained prior-epoch receiver keys

### Backup

- Always back up ClientState after changes
- Loss means inability to decrypt future messages
- Cannot recover old states (forward secrecy)

## Example: Full State Lifecycle

```typescript
import {
  createSimpleGroup,
  getGroupIdHex,
  serializeClientState,
  deserializeClientState,
  getMarmotGroupView,
} from "@internet-privacy/marmot-ts";

// 1. Create group (seeds the default app components)
const { clientState } = await createSimpleGroup(
  creatorKeyPackage,
  ciphersuiteImpl,
  "Developer Chat",
  { adminPubkeys: [creatorPubkey], relays: ["wss://relay.example.com"] },
);

// 2. Serialize and store
const groupId = getGroupIdHex(clientState);
const serialized = serializeClientState(clientState);
await storage.save(groupId, serialized);

// 3. Later: load from storage
const loaded = await storage.load(groupId);
const restoredState = deserializeClientState(loaded);

// 4. Use the restored state
const view = getMarmotGroupView(restoredState);
console.log("Restored group:", view?.name);
```

## Related

- [Groups](./groups) - Creating initial ClientState
- [Messages](./messages) - Using ClientState for encryption
- [Members](./members) - Querying members from ClientState
