# History

MLS itself does not store messages — once an application message is decrypted, it is gone unless you keep it. Marmot makes message history an **optional, pluggable** concern: provide a `historyFactory` to the client and every group gets a history instance at `group.history` that records both self-sent and ingested rumors and lets you query and subscribe to them.

The library ships `GroupRumorHistory`, which stores decrypted [rumors](/getting-started#key-terms) behind a small backend interface.

## Wiring history into the client

`GroupRumorHistory.makeFactory` turns a per-group backend into the factory the client expects:

```typescript
import { GroupRumorHistory } from "@internet-privacy/marmot-ts";
import { KeyValueRumorHistoryBackend } from "@internet-privacy/marmot-ts/extra";

const historyFactory = GroupRumorHistory.makeFactory(
  (groupId) => new KeyValueRumorHistoryBackend(storeForGroup(groupId)),
);

const client = new MarmotClient({
  signer,
  network,
  groupStateStore,
  keyPackageStore,
  historyFactory,
});
```

`KeyValueRumorHistoryBackend` (from `./extra`) adapts any [`GenericKeyValueStore`](/client/storage) into a history backend, so you can persist messages with the same storage primitives you use for group state.

Once configured, you never call `saveMessage` yourself — the session writes to history automatically whenever a message is sent or ingested.

## Querying messages

`group.history` is a `GroupRumorHistory`. Query stored rumors with Nostr filters:

```typescript
const history = group.history;

// All chat messages (kind 9), newest first
const recent = await history.queryRumors({ kinds: [9], limit: 50 });
```

## Live timeline — `subscribe`

`subscribe(filters?)` is an async generator that yields the current timeline immediately, then re-yields it whenever a matching rumor is saved or the history is cleared. This is the natural source for a chat view:

```typescript
for await (const rumors of history.subscribe({ kinds: [9], limit: 100 })) {
  renderTimeline(rumors); // newest-first NostrEvent-shaped rumors
}
```

Both self-sent messages (via `client.groups.send`) and ingested messages (via `group.ingest`) flow through the same subscription, so the UI stays consistent without a separate "echo" path.

Two details of the current implementation: `limit` applies only to the initial snapshot, so the timeline grows as new rumors arrive; and a rumor saved while your loop body is still running (between iterations) is not added to that subscription's timeline. Re-query with `queryRumors` if you need an exact view.

## Pagination — `createPaginatedLoader`

For infinite scroll, `createPaginatedLoader(filter?)` yields one page per iteration (default 50 per page), walking backwards through history:

```typescript
const loader = history.createPaginatedLoader({ kinds: [9], limit: 30 });

async function loadOlder() {
  const { value: page, done } = await loader.next();
  if (!done && page) prependToTimeline(page);
}
```

## Other methods and events

- `saveRumor(rumor)` — manually persist an unsigned rumor.
- `purgeMessages()` — clear all stored rumors for the group.
- Emits `rumor` (a rumor was saved) and `cleared` (history purged).

## Fork-invalidated messages

History stores a message as soon as it decrypts. If a later convergence rewind abandons the branch that message arrived on, `group.ingest` yields `{ kind: "invalidated", payload }`, but **the message is not removed from history**. `GroupRumorHistory` has no remove method and does not react to invalidation, so an invalidated message stays in `queryRumors`, `subscribe`, and the paginated loader until you delete it.

The spec requires that a change which lost branch selection not remain visible to the application as completed ([`protocol-core/convergence.md`](https://github.com/marmot-protocol/marmot/blob/master/protocol-core/convergence.md)). Until the library handles this, retract invalidated messages yourself: run your own ingest loop (see [Fork invalidation](/client/marmot-group#fork-invalidation)), decode the rumor id with `deserializeApplicationData(payload).id`, and remove that key from your backend store. `KeyValueRumorHistoryBackend` keys rumors by id, so removing that key from the `GenericKeyValueStore` you passed it deletes the message. Note that `client.groups.connect()` / `connectAll()` do not surface `invalidated` results.

```typescript
import { deserializeApplicationData } from "@internet-privacy/marmot-ts";

// `verifiedEvents`: kind 445 events you fetched and signature-checked yourself
for await (const result of group.ingest(verifiedEvents)) {
  if (result.kind === "invalidated" && result.payload) {
    const { id } = deserializeApplicationData(result.payload);
    await storeForGroup(group.id).removeItem(id); // the store behind KeyValueRumorHistoryBackend
  }
}
```

Membership and metadata changes withdrawn the same way arrive as `stateInvalidated` / `stateRevalidated`; after applying them, call `group.session.acknowledgeConvergenceEffect(result)`. Open subscriptions do not see the removal until they re-query.

## Retention and backfill

History is independent of MLS epoch secrets. Relay **backfill** (re-ingesting old kind 445 events) can only decrypt epochs still within the engine's bounded rewind horizon; messages from pruned epochs surface as `unreadable` during `ingest` and cannot be recovered — but anything already written to history stays available. The `message-retention` group metadata field (see [Proposals](/client/proposals#updating-metadata)) is a group request for disappearing messages: a nonzero value asks members to delete each message's plaintext once its `created_at` plus the retention seconds pinned at that message's epoch has passed ([`app-components/message-retention-v1.md`](https://github.com/marmot-protocol/marmot/blob/master/app-components/message-retention-v1.md)). `GroupRumorHistory` does not enforce this. If `group.groupData?.messageRetention` is greater than `0n`, delete expired rumors from your backend yourself.

## Next steps

- **[Storage](/client/storage)** — the key/value backends history is built on
- **[MarmotGroup](/client/marmot-group)** — sending and ingesting the messages history records
- **[Messages](/core/messages)** — the rumor serialization format
