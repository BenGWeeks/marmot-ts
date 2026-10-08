# Marmot Group

`MarmotGroup` represents a single encrypted group. It is a thin **facade** over the protocol state machine: it owns a [`GroupSession`](#session-and-runtime) (which wraps the engine's MLS `ClientState`) and a `GroupRuntime` (which publishes outbound effects to Nostr). You obtain instances from the client — `client.groups.get(id)`, `client.groups.create(...)`, `client.groups.loadAll()`, or the `client.groups.watch()` stream — never by constructing one directly.

::: tip Prefer the manager for actions
Most operations have a convenience method on [`client.groups`](/client/marmot-client) that resolves the group, drives the session, and publishes for you: `send`, `commit`, `invite`, `leave`, `ingest`. Reach into the `MarmotGroup` instance for its **read** surface (state, members, metadata) and its **events**.
:::

## Identity and state

```typescript
group.id; // Uint8Array — the MLS group_id
group.idStr; // hex string of group.id
group.state; // the underlying MLS ClientState (advanced API)
group.relays; // string[] | undefined — the group's Nostr relays
```

### Group metadata — `group.groupData`

`groupData` is a `MarmotGroupView | null` projected from the group's app components:

```typescript
const data = group.groupData;
data?.name;
data?.description;
data?.adminPubkeys; // string[]
data?.relays; // string[]
data?.nostrGroupId; // Uint8Array | undefined — the kind 445 routing tag (#h)
data?.avatarUrl;
data?.messageRetention; // bigint seconds; 0n = disappearing messages disabled
```

### Membership and details — `group.info`

`info` is a richer `MarmotGroupInfo` projection:

```typescript
group.info.members.pubkeys; // string[] of member Nostr pubkeys
group.info.app.components; // decoded app-component dictionary
```

### Convergence and lifecycle

The engine surfaces two read-only status values used to reason about concurrent commits and the publish-before-apply window:

```typescript
group.lifecycle; // "Stable" | "PendingPublish" | "Merging" | ...
group.convergenceStatus; // "Syncing" | "Resolving" | "Settled" | "Blocked"
group.unappliedProposals; // proposals seen but not yet committed
group.dirty; // unsaved state changes pending
```

Outbound sends are **convergence-gated** — an intent submitted while the group is not `Settled` is queued until convergence resolves. See [Architecture](/guide/architecture#engine-module).

## Sending messages

Build an application-message intent and submit it. The manager helper is the usual path:

```typescript
import {
  createApplicationMessageIntent,
  createChatRumor,
} from "@internet-privacy/marmot-ts";

const rumor = createChatRumor({ pubkey: myPubkey, content: "Hello!" });
await client.groups.send(group.id, createApplicationMessageIntent(rumor));
```

Equivalent on the instance:

```typescript
await group.submitIntent(createApplicationMessageIntent(rumor));
```

`createChatRumor` emits a kind 9 rumor (a chat convention). Any unsigned rumor can be serialized as an application message — see [Messages](/core/messages).

## Receiving messages

Decrypted application messages are emitted as the `applicationMessage` event carrying the serialized rumor bytes:

```typescript
import { deserializeApplicationData } from "@internet-privacy/marmot-ts";

group.on("applicationMessage", (data) => {
  const rumor = deserializeApplicationData(data);
  console.log(`${rumor.pubkey}: ${rumor.content}`);
});
```

To feed inbound traffic, connect the group through the client. `client.groups.connect()` fetches the group's kind 445 backlog, opens a live subscription, checks each event's signature and `h` tag, and drains everything through `group.ingest()` (see [Receiving group traffic](/client/marmot-client#receiving-group-traffic)):

```typescript
const connection = await client.groups.connect(group.id);
client.groups.on("unreadable", (groupId, event) =>
  console.warn("unreadable", event.id),
);
// later: connection.unsubscribe();
```

### Ingesting events manually

If you run your own subscription, verify each event before ingesting it (`group.ingest` does not check signatures or the `h` tag) and fully drain one `ingest()` generator before starting the next. The generator advances MLS processing and yields a **disposition** per event:

```typescript
import { verifyEvent } from "applesauce-core/helpers/event";
import type { NostrEvent } from "applesauce-core/helpers/event";

async function ingestBatch(events: NostrEvent[]) {
  const trusted = events.filter((event) => verifyEvent(event));
  for await (const result of group.ingest(trusted)) {
    switch (result.kind) {
      case "processed":
        break; // commits/proposals applied; app messages arrive via the event above
      case "deferred":
        break; // held in the ingestion pool and retried automatically
      case "invalidated":
        break; // see "Fork invalidation" below
      case "unreadable":
        console.warn("dropped an unreadable event");
        break;
    }
  }
}
```

Other kinds: `skipped`, `rejected`, `refused` (ingestion pool at capacity), `autoCommit`, `removed`, `appliedNotifications`, and `stateInvalidated` / `stateRevalidated` (a rewind withdrew or restored the state notifications of a commit). See [`DispositionedIngestResult`](https://github.com/marmot-protocol/marmot-ts/blob/master/src/client/session/group-session.ts).

### Fork invalidation

Marmot delivers messages eagerly. If convergence later abandons the branch a message arrived on, `ingest` yields `{ kind: "invalidated", payload }`, where `payload` holds the message's app payload bytes when they are available. The message was already emitted through `applicationMessage` and written to [history](/client/history#fork-invalidated-messages), and the library does not remove it. Retract it from your UI and history yourself.

In the same way, `stateInvalidated` and `stateRevalidated` withdraw or restore the membership and metadata changes of a commit. After your app has applied one, record it with `group.session.acknowledgeConvergenceEffect(result)`.

```typescript
// inside ingestBatch() from the example above
for await (const result of group.ingest(trusted)) {
  if (result.kind === "invalidated" && result.payload) {
    const rumor = deserializeApplicationData(result.payload);
    removeFromTimeline(rumor.id);
  } else if (
    result.kind === "stateInvalidated" ||
    result.kind === "stateRevalidated"
  ) {
    refreshGroupDetails(group);
    await group.session.acknowledgeConvergenceEffect(result);
  }
}
```

The spec requires that a change which lost branch selection not remain visible as completed ([`protocol-core/convergence.md`](https://github.com/marmot-protocol/marmot/blob/master/protocol-core/convergence.md)). These results are only visible when you call `ingest` yourself; `connect()` / `connectAll()` do not surface them.

## Proposals and commits

Use the [`Proposals`](/client/proposals) builders with `client.groups.commit`, or the high-level `client.groups.invite` / `client.groups.leave` shortcuts:

```typescript
import { Proposals } from "@internet-privacy/marmot-ts";

// Builders that return several proposals are resolved against the current
// state first, then committed.
const context = group.session.proposalContext();

// Remove a member (admins only)
const removals = await Proposals.proposeRemoveUser(memberPubkey)(context);
await client.groups.commit(group.id, { extraProposals: removals });

// Update metadata
const updates = await Proposals.proposeUpdateMetadata({ name: "New name" })(
  group.session.proposalContext(),
);
await client.groups.commit(group.id, { extraProposals: updates });
```

A standalone (uncommitted) proposal can be broadcast with `group.propose(action)` / `group.sendProposal(proposal)`, and a key rotation with `group.selfUpdate()`.

## Founding Welcome delivery and retry

When a group is founding-created with `invitees` (see [`client.groups.create`](/client/marmot-client#founding-creation-with-initial-invitees)), each invitee's Welcome is delivered independently and the outcome is exposed as discoverable state on the group — `create()` itself never throws on a failed delivery:

```typescript
group.welcomeDeliveries; // every attempted delivery, in order: { kind: "succeeded" | "failed", recipient, ... }[]
group.pendingWelcomes; // the failed subset still needing delivery
```

A delivery counts as `succeeded` only when **at least one relay acknowledged** the gift-wrapped Welcome (`ok: true`). A publish that every relay rejected — auth-required, rate-limited, blocked, or otherwise — is reported as `failed`, appears in `pendingWelcomes`, and is re-published by `retryWelcome`, even though the underlying publish call itself did not throw. The same rule applies to the per-recipient Welcome outcomes of an ordinary invite (`GroupRuntime`'s `welcomeDelivery.outcomes`).

Check `pendingWelcomes` after a founding create and retry each entry:

```typescript
for (const outcome of group.pendingWelcomes) {
  await group.retryWelcome(outcome.recipient.pubkey);
}
```

`retryWelcome(pubkey)` semantics:

- An unknown `pubkey` (never an invitee of this founding create) throws — it fails loudly rather than silently no-opping.
- A `pubkey` whose Welcome already succeeded returns the existing outcome unchanged, without re-publishing.
- The report is **not persisted**: `welcomeDeliveries` / `pendingWelcomes` are in-memory only and empty again after a restart or a fresh load of the group, even though the invitee remains a member who was never told.

The only recovery for a Welcome that was never delivered (before or after a restart) is to re-invite that member with a **fresh KeyPackage** against the now-canonical group (`refs/marmot/protocol-core/publish-lifecycle.md`) — the original KeyPackage material a founding create consumed is not restorable.

## Events

`MarmotGroup` extends `EventEmitter`. Available events:

| Event                | Payload                              | Fires when                                                                   |
| -------------------- | ------------------------------------ | ---------------------------------------------------------------------------- |
| `applicationMessage` | `Uint8Array`                         | A decrypted application message is received                                  |
| `stateChanged`       | `ClientState`                        | Group state advances (commit, proposal, message)                             |
| `stateSaved`         | `MarmotGroup`                        | State was persisted to the store                                             |
| `removed`            | `MarmotGroup`                        | An inbound commit removed **this** member (admin or self-removal)            |
| `destroyed`          | `MarmotGroup`                        | The group's local state was destroyed                                        |
| `disbanded`          | `(MarmotGroup, GroupDisbandedEvent)` | The group was disbanded (terminal; emitted once)                             |
| `historyError`       | `Error`                              | Best-effort history persistence failed (non-blocking)                        |
| `historyChanged`     | `MarmotGroup`                        | Ingest grew the fork-history tree (see [Fork History](/client/fork-history)) |

```typescript
group.on("removed", (g) => {
  // Local state is kept as a tombstone — decide when to purge it
  void client.groups.destroy(g.id);
});
```

## Session and runtime

For advanced integrations, `group.session` (a [`GroupSession`](https://github.com/marmot-protocol/marmot-ts/blob/master/src/client/session/group-session.ts)) is the protocol-state owner and `group.runtime` is the transport publisher. The facade methods delegate to these. Prefer the facade and manager APIs unless you are building a custom transport or persistence layer — in which case see the [Engine module](/guide/architecture#engine-module).

## Next steps

- **[Proposals](/client/proposals)** — building add/remove/metadata proposals
- **[History](/client/history)** — persisting and querying messages
- **[MarmotClient](/client/marmot-client)** — lifecycle and the manager APIs
