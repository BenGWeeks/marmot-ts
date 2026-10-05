---
phase: 10-founding-group-creation-via-welcome
reviewed: 2026-09-28T00:00:00Z
depth: standard
review_kind: re-review (post gap-closure 10-05/10-06/10-07; prior review at commit fd3df86)
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
  critical: 0
  warning: 6
  info: 8
  total: 14
status: issues_found
---

# Phase 10: Code Review Report (Re-review after gap closure)

**Reviewed:** 2026-09-28T00:00:00Z
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

This re-review covers the phase-10 diff after gap-closure plans 10-05 (CR-01), 10-06 (CR-02) and 10-07 (CR-03) landed (`fd3df86..HEAD`). The prior report is preserved in git at `fd3df86`. `tsc -p tsconfig.json --noEmit` is clean. The six phase test files (72 tests) pass.

All three prior Critical findings are **RESOLVED**:

- **CR-01:** `assertFoundingInviteeRelays` fails closed before any key material, MLS state or store write exists. Test 13 was rewritten to prove the refusal and that nothing was persisted or published. The stale NIP-65 JSDoc and docs claims were corrected.
- **CR-02:** `deliverMany` now classifies an unacknowledged publish as `failed`, using the same `hasAck` rule that group events use. It is covered at the unit, `MarmotGroup.retryWelcome` and `GroupRuntime` levels. The runtime test now drives the production `deliverMany` instead of a hand-copied re-implementation.
- **CR-03:** The engine `foundingAdd` case now enforces epoch 0, a sole local leaf, no unapplied proposals, and a non-empty Add-only set, and each refusal has a test.

None of the prior Warnings or Info items was in gap-closure scope, and all are still **OPEN**. The gap closure introduced one new Warning: the CR-03 guard is checked against a state snapshot that the commit is not bound to (TOCTOU across the ProposalAction awaits). There are also three new Info items: a guard-vs-codec drift in relay validation, a narrowed never-throw guarantee in `deliverMany`, and stale D-09/R-05 test comments.

No new Critical issues were found.

## Prior Finding Status

| ID    | Title (abridged)                                                               | Status       | Evidence                                                                                                                                                                                                                                                                                                                        |
| ----- | ------------------------------------------------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CR-01 | Relay-less founding create yields a dead group; JSDoc false                    | **RESOLVED** | `group-factory.ts:186` calls `assertFoundingInviteeRelays` (`:399-415`) before `#getCiphersuiteImpl`/`generateKeyPackage`; JSDoc `:87-93`, `marmot-group.ts:736-744, 770-776`, `marmot-client.md:86` corrected; Test 13 asserts no `signEvent`, no store keys, no `created`, no gift wraps. Caveat: see new IN-06.                  |
| CR-02 | `deliverMany` reports unacknowledged Welcome as `succeeded`                    | **RESOLVED** | `welcome-delivery.ts:154-165` gates `succeeded` on `hasAck`; all-`ok:false` and empty `{}` responses map to `failed`; covered by `welcome-delivery.test.ts` (3 new cases), `marmot-group.test.ts` CR-02 retry test, `group-runtime.test.ts` CR-02 runtime test; docs `marmot-group.md:147`. Caveat: see new IN-07.             |
| CR-03 | Engine `foundingAdd` has no epoch-0 / sole-member / Add-only guard             | **RESOLVED** | `group-engine.ts:1227-1248` (epoch, sole local leaf, no unapplied proposals) and `:1274-1287` (non-empty, Add-only on resolved proposals); `types.ts:144-151` documents the preconditions; five new refusal tests in `founding-add-send.test.ts`. Caveat: see new WR-06.                                                        |
| WR-01 | `case "foundingAdd"` duplicates ~100 lines of `case "commit"`                  | **OPEN**     | Unchanged; the duplicated block has grown by the CR-03 guard (`group-engine.ts:1189-1365` vs `1079-1187`).                                                                                                                                                                                                                     |
| WR-02 | `deliverFoundingWelcomes` public mutator; `retryWelcome` not reentrancy-safe   | **OPEN**     | `marmot-group.ts:745-800` unchanged: still public, still overwrites retained Welcome/report, `retryWelcome` still writes back through a stale `index` after the await.                                                                                                                                                          |
| WR-03 | Breaking public-type changes shipped with no changeset                         | **OPEN**     | `.changeset/` still has no phase-10 entry. The gap closure adds another behaviour change to document: `create({ invitees })` now **throws** without valid relays (CR-01), and ordinary-invite Welcome outcomes can now be `failed` for unacked publishes (CR-02).                                                               |
| WR-04 | "Re-invite with fresh KeyPackage" recovery omits the double-leaf consequence   | **OPEN**     | `marmot-group.md:161`, `marmot-client.md:87`, `marmot-group.ts:696-707` unchanged.                                                                                                                                                                                                                                              |
| WR-05 | `create()` blocks on Welcome fanout after persist, before track/emit           | **OPEN**     | `group-factory.ts:247-260` still awaits `deliverFoundingWelcomes` after `save(true)`; `groups-manager.ts:812-815` still tracks/emits only afterwards.                                                                                                                                                                           |
| IN-01 | Creator's own KeyPackage not rejected as a founding invitee                    | **OPEN**     | `group-factory.ts:283` still seeds `seenPubkeys` empty.                                                                                                                                                                                                                                                                         |
| IN-02 | Ephemeral founding engine audits a confirmed epoch for a never-persisted group | **OPEN**     | `group-factory.ts:354` `confirmPublished` still precedes `assertOneWelcomeSecretPerInvitee` at `:361`.                                                                                                                                                                                                                          |
| IN-03 | `GroupsManager.invite()` discards per-invitee Welcome outcome                  | **OPEN**     | `groups-manager.ts:366-380` still returns only `result.response`. This matters more now that CR-02 makes `failed` reachable for unacked invites.                                                                                                                                                                             |
| IN-04 | "Only one durable write" claim inaccurate with stores configured               | **OPEN**     | `group-factory.ts:175-176` unchanged.                                                                                                                                                                                                                                                                                           |
| IN-05 | Supplied `historyTree` not bound by `GroupSession`; factory patches it         | **OPEN**     | `group-factory.ts:242-246` workaround and `group-session.ts:295-296` unchanged.                                                                                                                                                                                                                                                 |

The full text and fixes for the OPEN items are unchanged from the prior report at `fd3df86` and are restated below so that this file stands alone.

## Warnings

### WR-01: `case "foundingAdd"` duplicates about 100 lines of `case "commit"`, so legality changes can drift (OPEN, carried)

**File:** `src/engine/group-engine.ts:1189-1365` (vs `1079-1187`)
**Issue:** Proposal resolution, `#prepareOutboundCommitProposals`, the commit options, `createCommit`, `#assertStagedCommitLegal`, the lifecycle transition, the `#stagedCommitParentEpoch` pin, `#sentContentIds` and `ownCommitStamp` are copied almost verbatim. The in-code claim that the shared gate "cannot drift from ordinary commit legality" holds only until one copy is edited. For example, the `proposalRefs` WR-05 validation in `case "commit"` has no counterpart here, and a future pre-commit check added there will not reach `foundingAdd`. CR-03 made the case longer without factoring anything out.
**Fix:** Extract `#stageCommit(parentState, newProposals)`, which returns `{ commit, newState, welcome, prepared }` and performs prepare → `createCommit` → `#assertStagedCommitLegal`. Both cases call it; only `commit` then calls `peeler.wrapGroupMessage`. The CR-03 guard stays in `foundingAdd` as a precondition block before the call.

### WR-02: `deliverFoundingWelcomes` is a public mutator, and `retryWelcome` is not reentrancy-safe (OPEN, carried)

**File:** `src/client/group/marmot-group.ts:745-800`
**Issue:**
- Any caller, on any group, can call `deliverFoundingWelcomes` and overwrite `#foundingWelcome`, `#foundingWelcomeAuthor` and `#welcomeDeliveries`, which replaces the real founding report.
- `retryWelcome` resolves `index` before the `await deliverMany(...)` and writes `this.#welcomeDeliveries[index] = outcome!` after it:
  - Two concurrent `retryWelcome(pk)` calls both observe `failed`, and both publish a new gift wrap.
  - An interleaved `deliverFoundingWelcomes` swaps the array, so the stale `index` overwrites an unrelated recipient's outcome.

  CR-02 makes this worse: `failed` is now reachable on every unacked publish, so app-level "retry all pending" loops will hit this path more often.

**Fix:**
- Make the entry point internal (a module-private symbol or a factory-only function), or throw if a founding Welcome is already retained.
- Keep an in-flight `Map<pubkey, Promise<WelcomeDeliveryOutcome>>` and return the existing promise to a second caller.
- After the await, re-locate the entry with `findIndex(o => o.recipient.pubkey === pubkey)` on the current array instead of reusing `index`.

### WR-03: Breaking public-type and behaviour changes shipped with no changeset (OPEN, carried and widened)

**File:** `src/client/session/group-effects.ts:38-59`; `src/engine/types.ts:135-195`; `src/client/group-factory.ts:186`; `src/client/transport/nostr/welcome-delivery.ts:154-165`
**Issue:**
- **Type change:** `GroupPublishResult.welcomeDelivery` changed from `notRequired | succeeded | failed` to `notRequired | attempted`.
- **Type change:** `SendResult` gained an envelope-less `foundingGroupCreated` member, and `SendIntent` gained `foundingAdd`. Both are public on `./client` and `./engine`.
- **Behaviour change (gap closure):** `GroupsManager.create()` now throws for `invitees` without valid `relays`.
- **Behaviour change (gap closure):** Welcome outcomes that were previously `succeeded` for fulfilled-but-unacked publishes are now `failed`.

`.changeset/` still contains no phase-10 entry.
**Fix:** Add a changeset (`minor` pre-1.0) that covers all four changes and the migration (`welcomeDelivery.kind === "attempted" && outcomes.some(o => o.kind === "failed")`).

### WR-04: The documented "re-invite with a fresh KeyPackage" recovery omits that the invitee already occupies a leaf (OPEN, carried)

**File:** `docs/client/marmot-group.md:161`; `docs/client/marmot-client.md:87`; `src/client/group/marmot-group.ts:696-707`
**Issue:** An un-welcomed founding invitee is already a member at epoch 1. A plain `groups.invite(groupId, freshKeyPackage)` adds a second leaf for the same identity:
- The original leaf can never be updated, which weakens post-compromise security.
- The invitee shows up twice in member views.
- `evaluateKeyPackageEligibility` flags them as already a member, so an app that gates invites on eligibility cannot follow the documented path.

**Fix:** Document the recovery as a single commit that removes the stale leaf and adds the fresh KeyPackage (Remove + Add in `extraProposals`), or ship a helper such as `group.reinviteFoundingMember(pubkey, keyPackageEvent)`. Also state explicitly what happens with a plain `invite()`.

### WR-05: `create()` blocks on network Welcome fanout after the group is persisted but before it is tracked or emitted (OPEN, carried)

**File:** `src/client/group-factory.ts:247-260`; `src/client/groups-manager.ts:812-815`
**Issue:** `GroupFactory.create()` awaits `deliverFoundingWelcomes` (N inbox lookups plus publishes) after `save(true)`, and `GroupsManager.create()` only tracks the group and emits `created` after that. If an inbox lookup or publish hangs, `create()` never resolves, and the group is left persisted but untracked, unsubscribed and unannounced. That contradicts "Welcome delivery … does not affect canonical group state".
**Fix:** Return the group (so the manager can track it and emit `created`) before the fanout. Expose the fanout as `group.foundingWelcomesSettled: Promise<…>` and fill `welcomeDeliveries` as outcomes settle. Alternatively, bound each `deliver` with a timeout that maps to `failed`.

### WR-06 (NEW): The CR-03 legality guard checks one state snapshot, but the commit is built from a later re-read of `this.state` (TOCTOU across the ProposalAction awaits)

**File:** `src/engine/group-engine.ts:1227-1248` (guard on `this.state`), `1257-1263` (awaited ProposalActions), `1289-1313` (`#prepareOutboundCommitProposals(this.state, …)`, `const parentState = this.state`)
**Issue:** The CR-03 checks (epoch 0, sole local leaf, no unapplied proposals) all read `this.state` before the loop that `await`s each caller-supplied `ProposalAction`. After those awaits, the case re-reads `this.state` to build `prepared.commitState` and `parentState`. The engine has no send/ingest serialization, and it exposes a public `state` setter (`group-engine.ts:592`). So during a ProposalAction await, a concurrent call can move canonical state, and the guard will not see it:

- a concurrent `send({ kind: "selfUpdate" })` followed by `confirmPublished`
- an `ingest()` batch
- a direct `engine.state = …` assignment

`foundingAdd` would then build and locally merge an unpublished commit on top of an epoch ≥ 1 state, which is exactly what CR-03 exists to prevent. The in-code comment "Every check below runs before any await" is literally true, but it misleads: the guarded state is not the state that gets committed. `case "commit"` shares the same re-read pattern, but that case publishes its commit. `foundingAdd` is the one case whose safety depends entirely on these preconditions holding at `createCommit` time.
**Fix:** Bind the guard to the state that is committed:

```ts
case "foundingAdd": {
  const guardedState = this.state;
  // ... CR-03 checks against guardedState ...
  for (const item of intent.extraProposals.flat()) { /* await resolution */ }
  if (this.state !== guardedState) {
    throw new Error("foundingAdd: group state changed while resolving proposals; refusing");
  }
  const prepared = this.#prepareOutboundCommitProposals(guardedState, groupData.adminPubkeys, newProposals);
  const parentState = guardedState;
  ...
```

Add a test that passes an async `ProposalAction` which sets `engine.state` to an epoch-1 state before resolving, and asserts the refusal.

## Info

### IN-01: The creator's own KeyPackage is not rejected as a founding invitee (OPEN, carried)

**File:** `src/client/group-factory.ts:283-293`
**Issue:** `seenPubkeys` starts empty, so a KeyPackage authored by the creator passes the duplicate check. It becomes a second leaf for the creator, and a Welcome is gift-wrapped to self. Multi-device is out of scope for this milestone.
**Fix:** Seed the set with the creator: `new Set<string>([pubkey])`. Alternatively, throw a dedicated "cannot invite yourself" error.

### IN-02: The ephemeral founding engine writes audit records for a group that may never exist (OPEN, carried)

**File:** `src/client/group-factory.ts:344-361`
**Issue:** `confirmPublished` (`:354`, which emits `epoch_confirmed`) runs before `assertOneWelcomeSecretPerInvitee` (`:361`). A D-13 throw therefore leaves an audit record of a confirmed epoch 0→1 for a group id that was never persisted.
**Fix:** Move the D-13 assertion before `confirmPublished`, since it only reads `result.welcome`. Alternatively, emit an explicit abort audit record on the throw path.

### IN-03: `GroupsManager.invite()` still discards the per-invitee Welcome outcome (OPEN, carried)

**File:** `src/client/groups-manager.ts:366-380`; `src/client/runtime/group-runtime.ts:294-304`
**Issue:** `invite()` returns only `result.response`. After CR-02, an unacked invite Welcome is correctly classified `failed`, but the caller of `invite()` still never sees it.
**Fix:** Return `result.welcomeDelivery` (or `{ response, welcomeDelivery }`) from `invite()`/`commit()`, or at least emit it.

### IN-04: The "only one durable write" claim is inaccurate when stores are configured (OPEN, carried)

**File:** `src/client/group-factory.ts:175-176`
**Issue:** With a `rewindStore`, `save(true)` also flushes history-tree keys, and lifecycle and ingest-state stores may be written too. Test 4 only counts writes to the client-state store.
**Fix:** Reword to "exactly one client-state write, and none at epoch 0".

### IN-05: A supplied `historyTree` is not bound to `rewindStore` by `GroupSession`; the binding is patched in the factory (OPEN, carried)

**File:** `src/client/group-factory.ts:242-246`; `src/client/session/group-session.ts:295-296`
**Issue:** `GroupSession` only binds a tree it creates itself. Any other caller that supplies an unbound tree together with a `rewindStore` will throw on the first `save()`.
**Fix:** In `GroupSession`, bind whenever `rewindStore` is set and the supplied tree is unbound (`bindStore` is idempotent for the same store). Then drop the factory workaround.

### IN-06 (NEW): The CR-01 guard validates relays with a weaker rule than the routing codec, so some invalid relays are refused only after the creator KeyPackage is generated; the docs overstate the guarantee

**File:** `src/client/group-factory.ts:399-415`; `src/core/components/nostr-routing.ts:35-52`; `docs/client/marmot-client.md:86`; `src/client/group-factory.ts:87-93`
**Issue:** `assertFoundingInviteeRelays` checks only `isValidRelayUrl` (parseable ws/wss). The routing codec's `validateRelay` also rejects:
- URLs over 512 bytes
- embedded credentials (`wss://u:p@host`)
- fragments (`wss://host#x`)
- a missing host

For those inputs the guard passes, `generateKeyPackage` runs (and signs the 0x8009 proof via `signEvent`), and only then does `createSimpleGroup` → `encodeNostrRoutingV1` throw. Nothing is persisted or published, so this is not a safety issue. But the documented claims that the refusal happens "before any key material is generated" and covers "an invalid relay URL" are only true for the subset that `isValidRelayUrl` checks. The two validators can also drift apart. Test 13's `relayShapes` covers none of these codec-only cases.
**Fix:** Export the routing validator (for example `assertValidNostrRoutingRelay`) and call it from `assertFoundingInviteeRelays`, so one rule governs both. Add `"wss://u:p@relay.test"` and `"wss://relay.test#x"` to Test 13's `relayShapes`.

### IN-07 (NEW): `deliverMany`'s "never throws" contract now depends on the adapter's publish result being an object

**File:** `src/client/transport/nostr/welcome-delivery.ts:152-165`
**Issue:** Before CR-02, a fulfilled publish value was passed through untouched. Now `hasAck(result.value)` and `Object.values(result.value)` run inside the `settled.map` callback, outside the `allSettled` boundary. A non-conforming BYO `NostrNetworkInterface` whose `publish` resolves `undefined`/`null` makes `deliverMany` throw a `TypeError`. On the founding path that throw propagates out of `GroupFactory.create()` after `save(true)`, leaving a persisted group that is untracked and has an empty report. `GroupRuntime` has a defensive catch for this; `MarmotGroup.deliverFoundingWelcomes` and `retryWelcome` do not. The types forbid the input, but the class documents itself as "never throws".
**Fix:** Guard the classification, for example `const value = result.value ?? {};`, or wrap the per-entry mapping in `try`/`catch` that yields `{ kind: "failed", recipient, error }`.

### IN-08 (NEW): Stale D-09/R-05 references in test headers after the CR-01 supersession

**File:** `src/client/__tests__/founding-create.test.ts:38-39, 97`; `src/__tests__/integration/founding-group-create-join-message.test.ts:16-20, 116-117`
**Issue:**
- The `founding-create.test.ts` header still lists "D-09 relay-less delivery" as part of the plan 10-04 matrix, and the `describe` title still cites D-09/R-05 as if they were live decisions.
- The integration test still justifies supplying relays "per R-05" and calls Test 13 "the relay-less counterpart". Test 13 is now a refusal test, and relays are mandatory, not a deliberate choice.

**Fix:** Update both headers to cite CR-01 (relays are required for a founding create) and describe Test 13 as the refusal test.

---

_Reviewed: 2026-09-28T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
