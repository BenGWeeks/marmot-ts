# Best Practices

Patterns for building reliable Marmot applications. They follow from how the [engine](/guide/architecture#engine-module) handles convergence, commit lifecycle, and key material.

## Keep a key package published

Others can only add you to a group if you have a current key package published. KeyPackages are last-resort by default, so one published package in this device's `clientId` slot can accept several invites. Kind 30443 is addressable, so creating more packages in the same slot only replaces the previous one on relays.

```typescript
import { getNip65Relays } from "@internet-privacy/marmot-ts";

const myNip65WriteRelays = getNip65Relays(myRelayListEvent, "write");

// On startup: make sure one current, unused KeyPackage is published.
await client.keyPackages.ensurePublished({ relays: myNip65WriteRelays });
```

This requires a `clientId` on the client (32 random bytes as lowercase hex, generated once and persisted; see [Initialization](/client/marmot-client#initialization)); without it, `create()` and `ensurePublished()` throw `MissingSlotIdentifierError`. Publish to the write relays from your kind 10002 NIP-65 list (`r` tags marked `write` or unmarked), which is where inviters look. Rotate with `client.keyPackages.rotate(ref, options)` after a package is used and periodically for post-compromise hygiene.

::: warning Spec deviation
When you pass `relays`, marmot-ts also writes a `relays` tag on the kind 30443 event. That tag is not part of the spec's KeyPackage tag set ([`transports/nostr.md`](https://github.com/marmot-protocol/marmot/blob/master/transports/nostr.md)).
:::

## After joining a group

The library leaves two post-join steps to you (see [Joining an Existing Group](/client/marmot-client#joining-an-existing-group)):

- **Catch up, then self-update.** Connect the group so it ingests outstanding commits, then call `group.selfUpdate()`. The spec says to do this promptly, within 24 hours, and before sending application messages when feasible ([`protocol-core/joining.md`](https://github.com/marmot-protocol/marmot/blob/master/protocol-core/joining.md)).
- **Rotate the consumed KeyPackage** with `client.keyPackages.rotate(ref)`. `joinGroupFromWelcome` only marks it `used`, and the spec requires deleting consumed private material ([`foundation/key-packages.md`](https://github.com/marmot-protocol/marmot/blob/master/foundation/key-packages.md)).

## Let convergence settle before relying on state

Outbound sends are **convergence-gated**: an intent submitted while `group.convergenceStatus` is not `Settled` is queued and flushed once concurrent commits resolve. Don't fight this with retries — submit the intent and let the engine order it. When you need to read settled state (e.g. before showing the member list as authoritative), check `convergenceStatus === "Settled"`.

## Receive through `connectAll()`

Use `client.groups.connectAll()` (or `connect(groupId)`) for group traffic. It backfills and subscribes on each group's relays, checks signatures and the `h` tag, drops duplicates, and drains ingest for you. A hand-rolled subscription skips those checks unless you add them yourself. See [Receiving group traffic](/client/marmot-client#receiving-group-traffic).

## Handle ingest results

If you call `group.ingest` yourself, it yields a result per event. Handle the non-`processed` cases instead of assuming success:

- **`deferred`** / **`refused`** — not malformed. The engine holds the event and retries it automatically as state arrives.
- **`unreadable`** — terminal; the event can't be decrypted (e.g. an epoch past the retained horizon). Log and drop.
- **`invalidated`** — an app message that was delivered on a branch convergence later abandoned. Remove it from your UI and history; the library does not (see [Fork invalidation](/client/marmot-group#fork-invalidation)).
- **`stateInvalidated`** / **`stateRevalidated`** — a rewind withdrew or restored membership and metadata changes. Update the UI, then call `group.session.acknowledgeConvergenceEffect(result)`.
- **`rejected`** / **`skipped`** — the event was refused or not applicable. Log it if useful.
- **`removed`** — an inbound commit removed this member. Stop sending; decide when to `destroy` the tombstone.

## Drive the UI from history, not from ingest

Render chat from `group.history.subscribe(...)`, which delivers both self-sent and ingested messages through one stream. Listening to the `applicationMessage` event works too, but the history subscription gives you the full timeline and, with a durable backend that keys rumors by id (such as `KeyValueRumorHistoryBackend`), survives reloads and is idempotent across relay backfill. History is not fork-aware: handle `invalidated` results to retract messages (see [History](/client/history#fork-invalidated-messages)). Avoid building a separate "optimistic echo" path — the session already records self-sent rumors.

## Publish before apply: let the client drive commits

The engine uses publish-before-apply for commits: a commit is published, then confirmed or rolled back. Let the client manage this — use `client.groups.commit` / `send` rather than manually advancing state — so a failed publish doesn't leave your local state ahead of the group. The client also orders Welcome delivery for you: a Welcome is sent only after its commit is acknowledged.

## Isolate storage per account

Every account must use completely separate `groupStateStore`, `keyPackageStore`, `inviteStore`, `ingestStateStore`, `rewindStore`, `removedMarkerStore`, and `lifecycleStore` instances. In production, provide durable `ingestStateStore`, `rewindStore`, and `removedMarkerStore` backends too; without them, replay protection, fork recovery, and removal markers do not survive a restart (see [Storage](/client/storage#all-stores)). Key package stores hold private keys; sharing a backend across accounts leaks key material. Namespace stores by pubkey and rebuild the client on account switch — see [Multi-Account Support](/client/marmot-client#multi-account-support).

## Choose relays deliberately

- Publish your KeyPackages (kind 30443) to the **write** relays in your kind 10002 NIP-65 list (`r` tags marked `write` or unmarked). Inviters fetch them from there.
- Publish a kind 10050 inbox relay list and listen on it. Inviters send gift-wrapped Welcomes (kind 1059) there, and `getUserInboxRelays` resolves a peer's list.
- A group carries its own relay set in `group.groupData.relays`; publish and subscribe to group traffic there, and update it with [`proposeUpdateMetadata({ relays })`](/client/proposals#updating-metadata).
- Use several relays for redundancy — Marmot's privacy and availability come from relay diversity, not from any single relay.

## Clean up subscriptions

`watch()`, `watchKeyPackages()`, `watchUnread()`, and `history.subscribe()` are long-lived async generators. Break out of their loops (or abort them) when a component unmounts or the user switches accounts, call `.unsubscribe()` on `connect()` / `connectAll()` handles, and call `client.groups.unload(id)` when you are done with a group (it disposes the group's timers and queued outbound work).

## Migrating to account identity proof v2 (0x8009)

### Signer

The client's own signer signs the `0x8009` account identity proof — NIP-07 and NIP-46 signers work the same as a local key signer. There is no separate `accountProofSigner` option anywhere in the library; every `generateKeyPackage` call always emits a current, verifiable proof.

### Republish key packages

A KeyPackage published by a pre-v2 release (or one built with the removed `accountProofSigner` option) carries the legacy proof shape, and v2 peers reject it when they try to invite you with it. Call `client.keyPackages.ensurePublished({ relays })` to publish a fresh current KeyPackage — it ignores legacy entries when checking whether a current one already exists.

That alone does not retire the legacy KeyPackage. Nothing is deleted automatically, so its kind-30443 event stays discoverable on relays, and any peer whose invite picks it will fail. Only the local `ensurePublished` check skips legacy entries: `selectForWelcome` still offers them as Welcome candidates, and `rotate()`, `remove()`, and `clear()` act on them like any other entry. To finish the migration, list stored entries with `client.keyPackages.list()` — non-current ones carry `nonCurrent: true` — and pass their refs to `client.keyPackages.purge(refs)`, which publishes the NIP-09 deletion and removes the local key material:

```ts
await client.keyPackages.ensurePublished({ relays });
const legacy = (await client.keyPackages.list()).filter(
  (pkg) => pkg.nonCurrent,
);
if (legacy.length > 0)
  await client.keyPackages.purge(legacy.map((pkg) => pkg.keyPackageRef));
```

### Legacy groups

Groups whose `GroupContext` still requires the legacy `0xf2f1` proof extension, or that never required `0x8009` at all, are outside the current profile: they cannot be joined, they do not interoperate with v2 peers, and they must be recreated.

A group you already had stored before this cut still **loads**: `client.groups.loadAll()` and `client.groups.get(...)` never throw for it, and it stays listed alongside your current-profile groups. Check `group.profileSupport` to find one — it reports `{ kind: "unsupported", proofReason }`, with `proofReason` one of `legacy-group`, `mixed-profile`, or `missing-requirement`. Every send on such a group throws `UnsupportedGroupProfileError` (`reason: "unsupported-profile"`, exported from `@internet-privacy/marmot-ts/engine`), and every inbound event for it is yielded from `group.ingest()` as skipped with reason `unsupported-profile` (a `stale` disposition, category `unsupported_required_feature`) — nothing is decrypted or applied. That refusal covers the commit-producing lifecycle calls too: `group.disband()` and `group.enableDisbanding()` return a `rejected` result and publish nothing, and a disband request persisted before the upgrade is never resumed. Nothing is deleted or published automatically, so it is up to you to find and remove these groups; call `group.destroy()` on each one you no longer need:

```ts
const groups = await client.groups.loadAll();
for (const group of groups) {
  if (group.profileSupport.kind === "unsupported") {
    await group.destroy();
  }
}
```

## Next steps

- **[MarmotClient](/client/marmot-client)** — lifecycle, managers, multi-account
- **[Proposals](/client/proposals)** — commits, membership, metadata
- **[Architecture](/guide/architecture)** — the convergence and lifecycle model these practices follow
