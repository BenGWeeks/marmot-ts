# Client Module

The Client module (`@internet-privacy/marmot-ts/client`) provides a high-level, production-ready implementation for building Marmot applications.

## What's in the Client Module

- **MarmotClient:** Multi-group orchestration with lifecycle management
- **MarmotGroup:** Group operations (messaging, proposals, commits) — a facade over the engine
- **GroupsManager:** Group creation, invite/send/commit, relay sync (`connect`/`connectAll`), loading, watching, leaving, and destruction via `client.groups`
- **KeyPackageManager:** Key package creation, publishing, watching, and rotation via `client.keyPackages`
- **InviteManager:** Gift-wrap ingestion, decryption, and unread tracking via `client.invites`
- **History Management:** Optional message storage with querying and pagination
- **Proposal System:** Type-safe builders for group operations (`Proposals`)
- **Network Abstraction:** Pluggable Nostr client integration
- **Storage Abstraction:** Pluggable persistence backends

## Architecture

```
MarmotClient (Orchestration Layer)
    ↓  client.groups / client.keyPackages / client.invites
MarmotGroup (Group Operations Facade)
    ↓  GroupSession + GroupRuntime
Engine Module (Protocol State Machine)
    ↓
Core Module (Protocol Layer)
    ↓
MLS (ts-mls) + Nostr
```

## Installation

```typescript
import {
  MarmotClient,
  MarmotGroup,
  Proposals,
} from "@internet-privacy/marmot-ts";
```

## Topics

### [MarmotClient](./marmot-client)

Multi-group management, creating/joining/loading groups, lifecycle events.

### [MarmotGroup](./marmot-group)

Single group operations, sending messages, processing events, proposals and commits.

### [Proposals](./proposals)

Type-safe proposal builders for inviting users, removing users, and updating metadata.

### [History](./history)

Message storage, querying, and pagination with GroupRumorHistory.

### [Network](./network)

NostrNetworkInterface abstraction for integrating with Nostr clients.

### [Storage](./storage)

Key/value stores for persisting serialized group state, key packages, and invites.

### [Best Practices](./best-practices)

Recommended patterns for commits, state persistence, relay selection, and more.

### [Fork History](./fork-history)

Inspecting the full-fork history tree and convergence decisions.

### [UI Frameworks](./ui-frameworks)

Consuming the manager async generators from React, Svelte, Solid, Vue and vanilla JS.

### [API Reference](pathname:///reference/index.html)

Complete API documentation for all Client module classes and functions.

## When to Use Client

Use the Client module for:

- **Production applications** with full group management
- **Chat applications** needing message history
- **Applications** requiring reactive updates (event-driven)
- **Most use cases** - it's the recommended starting point

For fine-grained control or protocol research, use the [Core module](/core/) directly.

## Quick Example

```typescript
import {
  MarmotClient,
  createApplicationMessageIntent,
  createChatRumor,
  deserializeApplicationData,
} from "@internet-privacy/marmot-ts";

// Create client (`clientId`: persisted random 32-byte hex key package slot id)
const client = new MarmotClient({
  signer, // must support nip44
  network,
  groupStateStore,
  keyPackageStore,
  clientId,
});
const myPubkey = await client.signer.getPublicKey();

// Backfill + live ingest for every loaded group (and groups created/joined later)
const sync = client.groups.connectAll();

// Create group (the creator is always an admin)
const group = await client.groups.create("My Group", {
  relays: ["wss://relay.example.com"],
});

// Send message
const rumor = createChatRumor({ pubkey: myPubkey, content: "Hello, Marmot!" });
await client.groups.send(group.id, createApplicationMessageIntent(rumor));

// Listen for messages
group.on("applicationMessage", (message) => {
  const rumor = deserializeApplicationData(message);
  console.log(`${rumor.pubkey}: ${rumor.content}`);
});
```

## Key Features

### Event-Driven Architecture

`GroupsManager`, `KeyPackageManager`, `InviteManager`, and `MarmotGroup` emit events for reactive UI updates.

### Type Safety

Generic type system ensures type consistency between client and groups.

### Pluggable Components

- Storage backends (any `GenericKeyValueStore`; in-memory and encrypted wrappers ship in `/extra`, IndexedDB/filesystem/SQLite are app-provided)
- Network interfaces (nostr-tools, NDK, etc.)
- History implementations (custom storage)
- Crypto providers

### Performance

- Group caching and deduplication
- Lazy loading
- Efficient batch processing
- Non-blocking history operations

### Protocol Compliance

Implements the [Marmot v2 specification](https://github.com/marmot-protocol/marmot) (encrypted media v1; v2 media not yet implemented) and is wire-compatible with the darkmatter reference implementation.
