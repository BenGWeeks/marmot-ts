---
phase: 10-founding-group-creation-via-welcome
reviewed: 2026-09-28T00:00:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - docs/client/marmot-client.md
  - docs/client/marmot-group.md
  - src/__tests__/integration/founding-group-create-join-message.test.ts
  - src/client/__tests__/founding-create.test.ts
  - src/client/group-factory.ts
  - src/client/group/__tests__/marmot-group.test.ts
  - src/client/group/marmot-group.ts
  - src/client/groups-manager.ts
  - src/client/runtime/__tests__/group-runtime.test.ts
  - src/client/runtime/group-runtime.ts
  - src/client/session/group-effects.ts
  - src/client/session/group-session.ts
  - src/client/transport/nostr/__tests__/welcome-delivery.test.ts
  - src/client/transport/nostr/welcome-delivery.ts
  - src/engine/__tests__/founding-add-send.test.ts
  - src/engine/group-engine.ts
  - src/engine/types.ts
findings:
  critical: 3
  warning: 5
  info: 5
  total: 13
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-09-28T00:00:00Z
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

Reviewed the phase-10 diff (`d339d7d..HEAD`) for founding group creation via Welcome: the engine `foundingAdd` send case, `GroupFactory.create({ invitees })`, the shared `NostrWelcomeDelivery.deliverMany` fanout, the `MarmotGroup` per-invitee delivery report and retry API, the `GroupRuntime` Welcome-outcome reshaping, and the two docs pages. `tsc -p tsconfig.json --noEmit` is clean.

The happy path works and is well covered by tests. Three problems need fixing before this ships:

1. **Founding create without relays.** `create({ invitees })` with no `relays` still adds every invitee at epoch 1, persists the group, and then fails every Welcome, because `createWelcomeRumor()` requires a non-empty relays tag. The group cannot recover. It has no routing component, so it can never publish a commit that would add relays. The in-source JSDoc still describes the disproved "NIP-65 inbox fallback" behaviour. The docs page describes the failure correctly, but it also points to a recovery path that does not exist.
2. **Unacknowledged Welcomes reported as delivered.** `deliverMany` classifies a Welcome that no relay acknowledged as `succeeded`. `pendingWelcomes` then hides it, and `retryWelcome` refuses to retry it.
3. **Unguarded `foundingAdd` engine intent.** The engine accepts a `foundingAdd` intent at any epoch. This is a public `./engine` API. Calling it on a live group merges a commit locally that is never published, which silently forks the caller from every peer. That violates the spec's "limited to the epoch-0 creation" rule.

## Critical Issues

### CR-01: Relay-less founding create is accepted, adds members who can never be welcomed, and yields a permanently dead group; JSDoc describes behaviour that is false

**File:** `src/client/group-factory.ts:86-93, 176-255`; `src/client/group/marmot-group.ts:736-742`; `docs/client/marmot-client.md:86`
**Issue:**
`GroupFactory.create()` goes into `#createFounding` whenever `invitees.length > 0`, whatever `options.relays` contains. With no relays:

- `createSimpleGroup` adds no `transport.nostr.routing` component (`src/core/group.ts:146-151`).
- The founding Add is merged and persisted at epoch 1 with every invitee in the tree (`save(true)`).
- Every `deliver()` call rejects inside `createWelcomeRumor()` (`src/core/welcome-event.ts:57-60`, "Welcome rumor requires a non-empty relays tag"). This happens before any inbox-relay lookup, so all N Welcomes fail. Test 13 in `founding-create.test.ts` confirms this and pins it as expected behaviour.

`create()` still resolves successfully. The docs' claimed recovery ("re-inviting every member once the group has relays") is impossible. Adding relays requires a GroupContextExtensions commit, and `GroupRuntime.#publishToGroupRelays` throws "Group has no relays available to send messages." (`group-runtime.ts:328-330`). The engine's wrap also refuses to build any group event without the routing component. The result is a persisted group that can never be used, holding N phantom members.

Two in-source doc comments also contradict the verified behaviour:

- `group-factory.ts:86-91`: "Welcome delivery in that case depends entirely on each recipient's own published NIP-65 inbox relays"
- `marmot-group.ts:738-742`: "Passing an empty group-relay list is expected and supported (D-09) — delivery then depends entirely on each recipient's NIP-65 inbox relays"

Both are false. The failure is deterministic, so there is nothing to gain by accepting this input. Rejecting it up front costs nothing, and today it is a footgun documented as "supported".

**Fix:** Fail closed before any MLS state is created. Use the same relay rules the Welcome rumor enforces, so a malformed list (empty strings or duplicates) cannot cause the same all-Welcomes-fail outcome:

```ts
// GroupFactory.create(), before createSimpleGroup
const invitees = options?.invitees;
if (invitees && invitees.length > 0) {
  const relays = options?.relays ?? [];
  if (
    relays.length === 0 ||
    relays.some((r) => r.length === 0) ||
    new Set(relays).size !== relays.length
  ) {
    throw new Error(
      "GroupFactory.create: founding invitees require a non-empty list of distinct group relays " +
        "(every Welcome rumor must carry a relays tag, and a relay-less group can never publish)",
    );
  }
}
```

Then:

- Rewrite Test 13 to expect the rejection, and to check that no state was persisted and no gift wrap was published.
- Delete the stale NIP-65 sentences at `group-factory.ts:86-91` and `marmot-group.ts:738-742`.
- Replace the `marmot-client.md:86` bullet with "`create()` throws when `invitees` is supplied without `relays`", and drop the non-existent recovery path.

If D-09 must stay "supported", at minimum correct both JSDoc blocks and the docs recovery claim, and flag the choice as a recorded divergence. Even then the group remains unrecoverable.

### CR-02: `deliverMany` reports a Welcome that no relay accepted as `succeeded`, so `pendingWelcomes` and `retryWelcome` silently lose the invitee

**File:** `src/client/transport/nostr/welcome-delivery.ts:109, 140-149`; consumed by `src/client/group/marmot-group.ts:722-726, 788-789`
**Issue:**
`deliver()` returns `this.network.publish(inboxRelays, giftWrapEvent)`, which resolves with a per-relay `Record<string, PublishResponse>` where each entry carries `ok: boolean`. `deliverMany` maps every fulfilled promise to `{ kind: "succeeded" }`, including one where every relay returned `ok: false` (auth-required, rate-limited, blocked, and so on). The group-event path treats that case as failure (`group-runtime.ts:350`, `if (!hasAck(response))`). The Welcome path does not.

This defeats FOUND-04, the whole point of the per-invitee report:

- `pendingWelcomes` omits the invitee.
- `retryWelcome(pubkey)` returns the stale `succeeded` outcome "without re-publishing" (`marmot-group.ts:789`).

The invitee is a member at epoch 1 who was never told, and nothing records it. The same misclassification now also flows into `GroupRuntime`'s `welcomeDelivery.outcomes`. No test covers an `ok: false` Welcome publish.

**Fix:**

```ts
import { hasAck } from "../../../utils/index.js";

return settled.map((result, index) => {
  const recipient = options.recipients[index]!;
  if (result.status === "fulfilled") {
    if (hasAck(result.value))
      return { kind: "succeeded", recipient, response: result.value };
    const detail = Object.values(result.value)
      .filter((r) => !r.ok)
      .map((r) => `${r.from}: ${r.message ?? "rejected"}`)
      .join("; ");
    return {
      kind: "failed",
      recipient,
      error: `No relay accepted the Welcome${detail ? ` (${detail})` : ""}`,
    };
  }
  ...
});
```

Also add a `deliverMany` test where `publish` resolves with all `ok: false`, and a `retryWelcome` test that such an entry is retried.

### CR-03: Engine `foundingAdd` intent has no epoch-0 / sole-member / Add-only guard; on a live group it merges an unpublished commit locally (silent fork)

**File:** `src/engine/group-engine.ts:1189-1305`; `src/engine/types.ts:135-152`
**Issue:**
`SendIntent` is part of the public `./engine` surface, so any caller of `MarmotGroupEngine.send()` can submit `{ kind: "foundingAdd" }`. The case checks only `groupData` presence and `mayPrepareLocalCommit`. It does not check any of the following:

- `parentState.groupContext.epoch === 0n`
- that the creator is the sole leaf
- that `extraProposals` is non-empty and contains only Add proposals
- that there are no `unappliedProposals`, which `createCommit` would bundle by reference at epoch N

The caller is also told to `confirmPublished()` immediately, with no publish. Invoked on a group at epoch N with peers, the engine advances locally to N+1 through a commit that no peer ever sees: a guaranteed, silent fork. That directly violates `refs/marmot/protocol-core/publish-lifecycle.md`: "The empty-obligation exception is limited to the epoch-0 creation and, when applicable, its immediately following founding Add Commit. Every subsequent Commit follows the normal publish-before-apply rule." The only thing that keeps this safe today is the single in-tree caller (`GroupFactory.#createFounding`), and the types doc admits the related D-01 invariant is "convention, not enforced".

**Fix:** Enforce the spec boundary inside the case, before any proposal resolution:

```ts
case "foundingAdd": {
  if (this.state.groupContext.epoch !== 0n)
    throw new Error("foundingAdd is only legal at epoch 0 (founding-creation exception)");
  if (getGroupMembers(this.state).length !== 1)   // or a leaf-count check on the ratchet tree
    throw new Error("foundingAdd requires a one-member group");
  if (Object.keys(this.state.unappliedProposals).length > 0)
    throw new Error("foundingAdd requires no staged proposals");
  if (intent.extraProposals.flat().length === 0)
    throw new Error("foundingAdd requires at least one Add proposal");
  ...
  // after resolving proposals:
  if (newProposals.some((p) => p.proposalType !== defaultProposalTypes.add))
    throw new Error("foundingAdd may only carry Add proposals");
```

Add engine tests that `foundingAdd` is refused at epoch >= 1 and when a non-Add proposal is supplied.

## Warnings

### WR-01: `case "foundingAdd"` duplicates about 100 lines of `case "commit"`, so legality changes can drift

**File:** `src/engine/group-engine.ts:1189-1305` (vs `1075-1187`)
**Issue:** Proposal resolution, `#prepareOutboundCommitProposals`, the commit options, `createCommit`, `#assertStagedCommitLegal`, the lifecycle transition, `#stagedCommitParentEpoch`, `#sentContentIds` and `ownCommitStamp` are all copied almost verbatim. The comments claim that because the gate is "identical", it "cannot drift from ordinary commit legality". That is only true until someone edits one copy. For example, the `proposalRefs` WR-05 validation or a future pre-commit check added to `case "commit"` will not reach `foundingAdd`.
**Fix:** Extract a private `#stageCommit(newProposals, { wrap: boolean })` helper that returns `{ commit, newState, welcome, parentState, prepared }`. Both cases call it, and only `commit` calls `peeler.wrapGroupMessage`.

### WR-02: `deliverFoundingWelcomes` is a public mutator, and `retryWelcome` is not reentrancy-safe

**File:** `src/client/group/marmot-group.ts:743-798`
**Issue:**
- `deliverFoundingWelcomes` is public on `MarmotGroup`. Any caller, on any group (including a non-founding or loaded one), can overwrite `#foundingWelcome`, `#foundingWelcomeAuthor` and `#welcomeDeliveries` with an arbitrary Welcome, and so replace the real delivery report.
- `retryWelcome` resolves `index` before the `await` and writes `this.#welcomeDeliveries[index] = outcome!` after it. Two concurrent `retryWelcome(pk)` calls both see `failed`, and both publish a gift-wrapped Welcome. An interleaved `deliverFoundingWelcomes` replaces the array, so the stale `index` then overwrites an unrelated recipient's entry.

**Fix:**
- Make the entry point non-public, for example a module-private symbol or a factory-only friend function, or mark it `@internal` and throw if a founding Welcome is already retained.
- In `retryWelcome`, keep a `Map<pubkey, Promise<WelcomeDeliveryOutcome>>` of in-flight retries and return the existing promise.
- After the await, re-locate the entry by `recipient.pubkey` instead of reusing `index`.

### WR-03: Breaking public-type changes shipped with no changeset

**File:** `src/client/session/group-effects.ts:38-59`; `src/engine/types.ts:156-187`
**Issue:**
- `GroupPublishResult.welcomeDelivery` changed from `AncillaryEffectOutcome` (`notRequired | succeeded | failed`) to `WelcomeFanoutOutcome` (`notRequired | attempted`). Downstream code checking `welcomeDelivery.kind === "failed"` now compiles to always-false, or fails to typecheck.
- `SendResult<TEnvelope>` gained a member without `envelope`, so external `./engine` consumers that read `result.envelope` after `send()`, or switch exhaustively over `result.kind`, break.

Both are exported through `./client` and `./engine`, and `.changeset/` has no entry for phase 10.
**Fix:** Add a changeset (`minor` pre-1.0, or `major`) that documents both shape changes and the migration (`outcomes.some(o => o.kind === "failed")`).

### WR-04: The documented "re-invite with a fresh KeyPackage" recovery omits that the invitee already occupies a leaf

**File:** `docs/client/marmot-group.md:161`; `docs/client/marmot-client.md:87`; `src/client/group/marmot-group.ts:696-707`
**Issue:** After a founding create, an un-welcomed invitee is already a member at epoch 1: their original KeyPackage leaf is in the tree. A plain `groups.invite(groupId, freshKeyPackage)` adds a *second* leaf for the same identity. That stale leaf can never update, which weakens post-compromise security, and it shows up twice in member views. `evaluateKeyPackageEligibility` (`src/core/key-package-eligibility.ts:118-121`) will also flag the invitee as "already a member", so an app that gates invites on eligibility cannot follow the documented path at all. The spec permits "a new Add commit", but the docs present the recovery as a simple re-invite without these caveats.
**Fix:** Document the recovery as one commit that removes the stale leaf and adds the fresh KeyPackage (remove + add in `extraProposals`), or provide a `group.reinviteFoundingMember(pubkey, keyPackageEvent)` helper that does it. State the double-leaf consequence of a plain `invite()` explicitly.

### WR-05: `create()` blocks on network Welcome fanout after the group is persisted but before it is tracked or emitted

**File:** `src/client/group-factory.ts:239-252`; `src/client/groups-manager.ts:812-815`
**Issue:** `GroupFactory.create()` awaits `deliverFoundingWelcomes` (N inbox-relay lookups plus publishes) after `save(true)`. `GroupsManager.create()` only calls `registry.track()` and emits `created` after that returns. If a relay publish or `getUserInboxRelays` hangs, `create()` never resolves: the group is persisted but untracked, unsubscribed and never announced. That contradicts the stated design that Welcome delivery "does not affect canonical group state" and is "discoverable state, not a return value".
**Fix:** Return the group (and let the manager track it and emit `created`) before starting the fanout. Expose the fanout as a promise on the group (for example `group.foundingWelcomesSettled`) and fill `welcomeDeliveries` as outcomes settle. Alternatively, bound each delivery with a timeout that maps to a `failed` outcome.

## Info

### IN-01: The creator's own KeyPackage is not rejected as a founding invitee

**File:** `src/client/group-factory.ts:275-285`
**Issue:** The D-13 duplicate check seeds `seenPubkeys` empty, so an invitee event authored by the creator's own pubkey passes. It is added as a second leaf for the creator, and a Welcome is gift-wrapped to self. Multi-device is explicitly out of scope for this milestone, so this is almost certainly a caller mistake.
**Fix:** Seed `seenPubkeys` with `pubkey`, or throw a dedicated "cannot invite yourself" error.

### IN-02: The ephemeral founding engine writes audit records for a group that may never exist

**File:** `src/client/group-factory.ts:320-353`
**Issue:** The short-lived engine emits `send_entry`, `send_outcome` and `epoch_confirmed` to the shared audit sink. If `assertOneWelcomeSecretPerInvitee` then throws, the audit log records a confirmed epoch 0→1 for a group id that was never persisted.
**Fix:** Run the D-13 assertion before `confirmPublished` (it only reads `result.welcome`). Otherwise, emit an explicit abort audit record on the throw path.

### IN-03: `GroupsManager.invite()` still discards the per-invitee Welcome outcome

**File:** `src/client/groups-manager.ts:366-380`; `src/client/runtime/group-runtime.ts:295-304`
**Issue:** The new per-recipient `WelcomeFanoutOutcome` is computed for ordinary invites, but `invite()` returns only `result.response`. An ordinary invite whose Welcome fails is therefore invisible to the caller, which is the same silent-loss mode FOUND-04 set out to fix for founding creates.
**Fix:** Return, or at least log or emit, `result.welcomeDelivery` from `invite()`/`commit()`.

### IN-04: The "only one durable write" claim is inaccurate when stores are configured

**File:** `src/client/group-factory.ts:173-174`
**Issue:** The doc says "Only one durable write occurs either way (D-03)". With a `rewindStore`, `save(true)` also flushes several history-tree keys, and lifecycle/ingest-state stores may be written too. Test 4 only counts writes to the client-state store.
**Fix:** Reword this to "exactly one client-state write, and none at epoch 0".

### IN-05: A supplied `historyTree` is not bound to `rewindStore` by `GroupSession`; the binding is patched in the factory

**File:** `src/client/group-factory.ts:234-238`; `src/client/session/group-session.ts:295-296`
**Issue:** `GroupSession` only binds a tree it creates itself. Any other caller that constructs `MarmotGroup` with an unbound `historyTree` plus a `rewindStore` gets a throw from `history.flush()` on the first `save()`. The factory works around this with `bindStore` after construction, which is fragile.
**Fix:** In `GroupSession`'s constructor, bind whenever `rewindStore` is set and the supplied tree is unbound (`bindStore` is already idempotent for the same store). Then remove the factory workaround.

---

_Reviewed: 2026-09-28T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
