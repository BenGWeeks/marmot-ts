---
phase: 10-founding-group-creation-via-welcome
verified: 2026-09-28T00:00:00Z
status: passed
score: 5/5 truths verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 3/5
  gaps_closed:
    - "Truth 4 (FOUND-04): NostrWelcomeDelivery.deliverMany() now classifies an unacknowledged (all-relay-ok:false or empty-response) publish as failed via the shared hasAck() helper, so pendingWelcomes and retryWelcome see and re-attempt it (CR-02, plan 10-06)"
    - "Truth 1/5 safety hole (CR-01): GroupFactory.create() now fails closed — throws assertFoundingInviteeRelays() before any key material, MLS state, or store write — when invitees is non-empty and relays is absent/empty/invalid; stale in-source JSDoc (group-factory.ts, marmot-group.ts) and docs/client/marmot-client.md corrected to describe the fail-closed behaviour; D-09/R-05 annotated SUPERSEDED in 10-CONTEXT.md with original text retained (plan 10-05)"
    - "Truth 2 (FOUND-02) CR-03 gap: the engine's public ./engine foundingAdd SendIntent now has an invocation-legality guard (epoch 0, sole local leaf, no unapplied proposals, non-empty all-Add proposal set) enforced before createCommit, closing the public-surface silent-fork hazard noted as 'PARTIAL' in the prior verification (plan 10-07)"
  gaps_remaining: []
  regressions: []
---

# Phase 10: Founding Group Creation via Welcome Verification Report

**Phase Goal:** Creating a Current-profile group with initial invitees publishes no founding commit; the founding Add is merged locally to epoch 1, the group reaches `Stable` immediately, and each invitee joins via an independently-retryable Welcome.
**Verified:** 2026-09-28
**Status:** passed
**Re-verification:** Yes — after gap-closure plans 10-05 (CR-01), 10-06 (CR-02), 10-07 (CR-03)

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Creating a group with initial invitees merges the founding Add locally to epoch 1 and publishes no kind-445 group event for it | ✓ VERIFIED | `src/engine/group-engine.ts` `case "foundingAdd"` (lines 1189-1367) runs `createCommit` and stages a `PendingState` but never calls `peeler.wrapGroupMessage` (comment at 1329-1338). Unchanged from prior VERIFIED status; regression-checked via `src/engine/__tests__/founding-add-send.test.ts` and `src/client/__tests__/founding-create.test.ts` (both green) |
| 2 | The founding Add passes the same proof and group-profile validation as an ordinary commit before it is merged | ✓ VERIFIED (upgraded from PARTIAL) | Content validation: `#assertStagedCommitLegal(parentState, newState, prepared.committedWithSenders, ...)` (group-engine.ts:1322-1327), identical to `case "commit"`/`case "selfUpdate"`. Invocation legality (CR-03, previously missing): `case "foundingAdd"` now throws before `createCommit` unless `groupContext.epoch === 0n` (line 1227), the local member is the tree's sole occupied leaf via `#occupiedLeafIndices()` (line 1232), there are no unapplied proposals (line 1241), and the resolved proposal set is non-empty and Add-only (lines 1277-1287). Five new tests in `founding-add-send.test.ts` (`describe("foundingAdd invocation guard (CR-03)", ...)`), one per rejection branch, each asserting the specific error, `engine.state` unchanged (`toBe` same reference), lifecycle stays `Stable`, `history.size` and `wrapCount()` unchanged. Confirmed present by direct code read; `pnpm vitest run src/engine/__tests__/founding-add-send.test.ts` → 11/11 pass (6 pre-existing + 5 CR-03). See "Open Finding (non-blocking)" below for a residual TOCTOU note (WR-06) that does not fail this truth |
| 3 | Immediately after founding creation the group's lifecycle state is `Stable`, with no `PendingPublish` window | ✓ VERIFIED | `GroupFactory.#createFounding` calls `engine.send({kind:"foundingAdd", ...})` then `engine.confirmPublished(result.pending)` with no `await` in between (unchanged). `src/client/__tests__/founding-create.test.ts` asserts this and passes |
| 4 | Each invitee's Welcome is delivered independently; a failed delivery is retryable per invitee and never rolls back the group | ✓ VERIFIED (was FAILED — CR-02 now closed) | `NostrWelcomeDelivery.deliverMany()` (`src/client/transport/nostr/welcome-delivery.ts:139-172`) now gates `succeeded` on `hasAck(result.value)` — the same shared helper (`src/utils/nostr.ts:54`) `GroupRuntime#publishToGroupRelays` uses (`group-runtime.ts:350`). A fulfilled publish with no acknowledging relay (all `ok:false`, or an empty response object) is classified `failed` with a `"No relay accepted the Welcome"` error naming each rejecting relay. Verified at three levels by direct code read and passing tests: unit (`welcome-delivery.test.ts`, 3 new CR-02 tests, 8/8 total pass), `MarmotGroup` retry surface (`marmot-group.test.ts`, CR-02 test proves an unacked invitee appears in `pendingWelcomes` and `retryWelcome` re-publishes it until acked), and `GroupRuntime` ordinary-invite path (`group-runtime.test.ts`, CR-02 test with a real `NostrWelcomeDelivery` against an all-nacking network) — all pass |
| 5 | An invitee who receives their Welcome joins at epoch 1 and can exchange messages with the creator | ✓ VERIFIED | `src/__tests__/integration/founding-group-create-join-message.test.ts` — end-to-end positive control, unchanged from prior verification, still passes (`pnpm vitest run`, 2026-09-28) |

**Score:** 5/5 truths verified (both previously-failed truths, and the previously-PARTIAL truth, are now clean)

### Gap Closure Detail

| Gap (prior VERIFICATION.md) | Closing Plan | Fix | Verified |
|---|---|---|---|
| CR-02 — `deliverMany()` mislabels zero-ack Welcome publishes as `succeeded` (truth 4 FAILED) | 10-06 | `hasAck(result.value)` gate added to the fulfilled branch of `deliverMany`'s per-recipient mapping; descriptive `"No relay accepted the Welcome"` error | Code read confirms `hasAck` imported from `../../../utils/index.js` and applied at `welcome-delivery.ts:155`; 8/8 unit tests, 18/18 `marmot-group.test.ts`, 19/19 `group-runtime.test.ts` pass |
| CR-01 — relay-less founding create silently produces a permanently unusable group; stale JSDoc (truth 1/5 — informational truth about the D-09 input shape) | 10-05 | `assertFoundingInviteeRelays()` module-private guard called as the literal first statement of `GroupFactory.create()`, before ciphersuite resolution, signer calls, KeyPackage generation, and MLS state construction; stale JSDoc in `group-factory.ts` and `marmot-group.ts` and the published `docs/client/marmot-client.md` bullet corrected; D-09/R-05 annotated SUPERSEDED (original text retained) in `10-CONTEXT.md` | Code read confirms `assertFoundingInviteeRelays(options?.invitees, options?.relays)` is the first statement of `create()` (group-factory.ts:186), preceding `#getCiphersuiteImpl`; `grep -c "depends entirely on each recipient"` → 0 in both files; `10-05-PLAN.md`'s 15-test rewritten `founding-create.test.ts` (Test 13 refusal matrix + Test 15 solo-allowed) passes |
| CR-03 — engine's public `foundingAdd` `SendIntent` has no epoch-0/sole-leaf/Add-only invocation guard (truth 2 PARTIAL) | 10-07 | Five ordered checks (epoch, sole-leaf, no-unapplied-proposals, non-empty, Add-only) added to `case "foundingAdd"`, all running before any `await`/proposal resolution/`createCommit` | Code read confirms all five checks present and correctly ordered (group-engine.ts:1227-1287); 5 new tests, one per branch, in `founding-add-send.test.ts`; `types.ts` `foundingAdd` JSDoc documents the contract (comment-only change) |

### Regression Check (previously-passed truths)

| Truth | Prior Status | Current Status | Evidence |
|---|---|---|---|
| 1 (FOUND-01) | VERIFIED | VERIFIED (no change) | `founding-add-send.test.ts` 6 pre-existing tests + `founding-create.test.ts` all pass |
| 3 (FOUND-03) | VERIFIED | VERIFIED (no change) | Same no-yield send→confirm code path, untouched by gap-closure plans; tests pass |
| 5 (FOUND-05) | VERIFIED | VERIFIED (no change) | `founding-group-create-join-message.test.ts` passes, 1/1 |

No regressions found. Full workspace suite: `pnpm vitest run` → 115 files, 1292/1292 tests passing (matches orchestrator-observed facts). `pnpm exec tsc -p tsconfig.json --noEmit` clean. `pnpm lint` (`prettier --check .`) clean.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/client/group-factory.ts` | `assertFoundingInviteeRelays()` guard, first statement of `create()` | ✓ VERIFIED | Confirmed by read: line 186, precedes all ciphersuite/signer/KeyPackage/state work; `FOUNDING_RELAYS_REQUIRED` const referenced at both throw sites (lines 384-411) |
| `src/client/transport/nostr/welcome-delivery.ts` | `hasAck`-gated `deliverMany()` classification | ✓ VERIFIED | Confirmed by read: `hasAck` imported (line 8) and applied (line 155); single definition of `hasAck` exists only in `src/utils/nostr.ts` |
| `src/engine/group-engine.ts` | `case "foundingAdd"` invocation-legality guard | ✓ VERIFIED | Confirmed by read: five checks at lines 1227-1287, correctly ordered before `createCommit` (line 1306) |
| `src/engine/types.ts` | `foundingAdd` `SendIntent` JSDoc documents CR-03 preconditions | ✓ VERIFIED | Comment-only change confirmed |
| `docs/client/marmot-client.md` | Fail-closed bullet replacing the phantom-recovery-path claim | ✓ VERIFIED | Line 86 confirmed |
| `docs/client/marmot-group.md` | "succeeded" defined as "at least one relay acknowledged" | ✓ VERIFIED | Line 147 confirmed |
| `.planning/phases/10-founding-group-creation-via-welcome/10-CONTEXT.md` | D-09/R-05 SUPERSEDED annotations, original text retained | ✓ VERIFIED | 2 matches for the SUPERSEDED marker confirmed |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `group-factory.ts` `create()` | `assertFoundingInviteeRelays` | synchronous first-statement guard | ✓ WIRED | Confirmed by read, no intervening await before the call |
| `welcome-delivery.ts` `deliverMany` | `src/utils/nostr.ts` `hasAck` | shared ack classification | ✓ WIRED | Confirmed by read; also used identically by `group-runtime.ts:350` |
| `group-engine.ts` `case "foundingAdd"` | `#occupiedLeafIndices()` | sole-leaf check | ✓ WIRED | Confirmed by read — reuses existing private helper, no duplicate tree scan |
| `marmot-group.ts` `retryWelcome`/`pendingWelcomes` | `welcome-delivery.ts` `deliverMany` | outcome trust | ✓ WIRED (CR-02 propagates correctly) | `marmot-group.test.ts` CR-02 test confirms an unacked invitee is pending and retried |
| `runtime/group-runtime.ts` | `welcome-delivery.ts` `deliverMany` | ordinary-invite fanout | ✓ WIRED (CR-02 propagates correctly) | `group-runtime.test.ts` CR-02 test with a real `NostrWelcomeDelivery` confirms `failed` outcome |

### Behavioral Spot-Checks / Test Execution

| Behavior | Command | Result | Status |
|---|---|---|---|
| Founding-Add send seam + CR-03 guard | `pnpm vitest run src/engine/__tests__/founding-add-send.test.ts` | 11/11 passed | ✓ PASS |
| Welcome-delivery fanout + CR-02 unit tests | `pnpm vitest run src/client/transport/nostr/__tests__/welcome-delivery.test.ts` | 8/8 passed | ✓ PASS |
| Founding-create client behavioural matrix + CR-01 refusal/allow tests | `pnpm vitest run src/client/__tests__/founding-create.test.ts` | 15/15 passed | ✓ PASS |
| FOUND-05 end-to-end positive control | `pnpm vitest run src/__tests__/integration/founding-group-create-join-message.test.ts` | 1/1 passed | ✓ PASS |
| MarmotGroup Welcome delivery report + CR-02 retry test | `pnpm vitest run src/client/group/__tests__/marmot-group.test.ts` | 18/18 passed | ✓ PASS |
| GroupRuntime Welcome delivery + CR-02 ordinary-invite test | `pnpm vitest run src/client/runtime/__tests__/group-runtime.test.ts` | 19/19 passed | ✓ PASS |
| Full workspace suite (run once) | `pnpm vitest run` | 115 files, 1292/1292 passed | ✓ PASS |
| Type check | `pnpm exec tsc -p tsconfig.json --noEmit` | clean | ✓ PASS |
| Format check | `pnpm lint` (`prettier --check .`) | clean | ✓ PASS |

All six phase-scoped files run together: 72/72 tests passing (matches 10-REVIEW.md's count).

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|---|---|---|---|---|
| FOUND-01 | 10-01, 10-03, 10-05 | Founding Add merged locally to epoch 1, no kind-445 published | ✓ SATISFIED | group-engine.ts case, client tests, CR-01 fail-closed guard preserves this on the supported input shape |
| FOUND-02 | 10-01, 10-04, 10-07 | Founding Add passes same proof/profile validation as ordinary commit | ✓ SATISFIED (upgraded) | Content-validation gate (`#assertStagedCommitLegal`) + CR-03 invocation-legality guard, both now present and tested |
| FOUND-03 | 10-01, 10-03 | Stable immediately, no PendingPublish window | ✓ SATISFIED | No-yield send→confirm; tests pass |
| FOUND-04 | 10-02, 10-03, 10-04, 10-06 | Independent, retryable per-invitee Welcome delivery, never rolls back | ✓ SATISFIED (upgraded) | CR-02 ack-aware classification; proven at unit, MarmotGroup, and GroupRuntime levels |
| FOUND-05 | 10-04, 10-05 | Invitee joins at epoch 1, exchanges messages with creator | ✓ SATISFIED | Integration test passes; CR-01 does not affect the supported (relays-supplied) path |

No orphaned requirements: REQUIREMENTS.md lists exactly FOUND-01..05 for Phase 10; all five appear in at least one plan's `requirements:` frontmatter (10-01 through 10-07). REQUIREMENTS.md already marks all five `[x]` Complete — this matches the verified state; no reopening needed.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| — | — | No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers found in any file touched by plans 10-01..10-07 | ℹ Info | Debt-marker gate: clean |
| `src/engine/group-engine.ts` | 1227-1248 (guard) vs 1289 (re-read of `this.state`) | WR-06 (10-REVIEW.md, new): the CR-03 guard reads `this.state` before the loop that `await`s each caller-supplied `ProposalAction`; a concurrent state mutation during that await (another `send`+`confirmPublished`, an `ingest()` batch, or a direct `engine.state =` assignment) would not be caught, since the commit is built from a later re-read | ⚠ Warning (non-blocking) | See "Open Finding" below — narrow, requires an async `ProposalAction` plus a genuinely concurrent caller; the sole in-tree caller (`GroupFactory`) does not race it. Rated Warning, not Critical, by 10-REVIEW.md; does not falsify the literal text of truth 2 (content + invocation-legality validation, both present) |

No blocker-level anti-patterns. `10-REVIEW.md` (re-review, commit `ef90340`) independently confirms: 0 critical, 6 warning, 8 info, all three prior Critical findings (CR-01/02/03) RESOLVED.

### Open Finding (non-blocking): WR-06 TOCTOU in the CR-03 guard

`10-REVIEW.md` documents a new Warning introduced by the CR-03 gap-closure itself: the epoch/sole-leaf/unapplied-proposals guard is evaluated against `this.state` before the loop that resolves `intent.extraProposals` (which may contain async `ProposalAction` callbacks and therefore `await`s). The commit is later built from a fresh read of `this.state`, not the guarded snapshot. If canonical state changes during that await window — via a concurrent `send`, an `ingest()` batch, or a direct `engine.state =` assignment — the guard's safety property (foundingAdd is only legal on a one-member epoch-0 group) can be bypassed for the commit that actually gets built and merged.

This is assessed as **non-blocking** for this verification:
- It is a genuinely new, narrower finding than the CR-03 gap this phase's gap-closure wave targeted (10-VERIFICATION.md's CR-03 entry was "no guard exists at all"; a guard now exists and closes the primary hazard — invocation on an already-multi-member/multi-epoch group in the ordinary, non-racing case).
- 10-REVIEW.md itself classifies it as a Warning, not a Critical, and it was found only because the CR-03 gap-closure added the very code path that could theoretically race.
- The sole in-tree caller (`GroupFactory.#createFounding`) does not introduce the race: it calls `send({kind:"foundingAdd"})` with `ProposalAction`s that do not themselves mutate the same engine's `state`, and does not run a concurrent `send`/`ingest` against the same engine instance during that window. `MarmotGroupEngine.ingest()` is documented as an `AsyncGenerator` callers must drain fully before the next batch (single-threaded event loop, no worker threads per CLAUDE.md's architectural constraints), so the concurrency this bug requires is an unusual caller pattern on the public `./engine` surface, not a path the phase's own founding-creation flow exercises.
- It does not contradict the literal text of roadmap truth 2 ("The founding Add passes the same proof and group-profile validation as an ordinary commit before it is merged") — both the content-validation gate and the invocation-legality guard are present and independently tested; WR-06 is a race-condition robustness gap in the guard's own implementation, not an absence of the guard.

**Recommendation:** track WR-06 as a follow-up fix (10-REVIEW.md provides a concrete patch — bind the guard to a `guardedState` snapshot and re-check `this.state === guardedState` after the proposal-resolution loop). This does not need to block Phase 10 completion or Phase 11 start, but should not be silently dropped — it is a real, verified, unresolved hardening item on the public `./engine` surface.

### Other Still-Open, Non-Blocking Findings (carried from 10-REVIEW.md, out of gap-closure scope)

10-REVIEW.md lists WR-01 through WR-05 and IN-01 through IN-08 as OPEN — these were explicitly out of scope for the 10-05/10-06/10-07 gap-closure wave (which targeted only CR-01/02/03) and were already open at the time of the original 10-VERIFICATION.md. None of them falsify a roadmap success criterion:
- WR-01 (case duplication), WR-02 (retry reentrancy), WR-03 (no changeset), WR-04 (re-invite recovery doc gap), WR-05 (Welcome fanout blocks tracking) — code-quality / robustness concerns, not goal-blocking.
- IN-01 through IN-08 — informational, including two new items (IN-06 relay-validation drift, IN-07 narrowed never-throw guarantee) surfaced by the gap-closure changes themselves.

These are legitimate follow-up candidates for a future hardening pass but are not required for this phase's five success criteria to hold.

### Human Verification Required

None. All items in this report are resolvable from static code reading, passing automated tests (unit, integration, full workspace suite), and the independent 10-REVIEW.md re-review's findings. No UNCERTAIN items requiring a human judgment call remain open for the phase's five roadmap truths.

## Gaps Summary

All three Critical findings from the prior verification round (CR-01, CR-02, CR-03) are confirmed resolved by direct code reading, not by trusting SUMMARY.md claims:

- **CR-02** (truth 4, FOUND-04): `deliverMany()` now applies the shared `hasAck()` helper and correctly classifies zero-ack publishes as `failed`; proven wired through to `pendingWelcomes`/`retryWelcome` and `GroupRuntime`'s ordinary-invite path.
- **CR-01** (truth 1/5 safety hole): `GroupFactory.create()` fails closed via `assertFoundingInviteeRelays()` before any side effect; all stale JSDoc and docs corrected; decision history preserved in `10-CONTEXT.md` per the user's directive.
- **CR-03** (truth 2, FOUND-02, previously PARTIAL): the engine's public `foundingAdd` invocation now has a full legality guard (epoch 0, sole leaf, no unapplied proposals, non-empty Add-only), closing the silent-fork hazard on the public `./engine` surface.

No regressions in the previously-passing truths (1, 3, 5). Full workspace suite (115 files / 1292 tests), typecheck, and lint are all clean, matching orchestrator-observed facts. The independent 10-REVIEW.md re-review corroborates all three resolutions and found 0 new Critical issues — only one new Warning (WR-06, a TOCTOU in the CR-03 guard's own implementation) and three new Info items, none of which block the phase goal or any FOUND-01..05 requirement as written.

**Recommendation:** Phase 10 goal is achieved. Proceed to Phase 11. Track WR-06 and the other OPEN warnings/info items from 10-REVIEW.md as follow-up hardening work — they do not need to gate this phase or the next.

---

_Verified: 2026-09-28_
_Verifier: Claude (gsd-verifier)_
