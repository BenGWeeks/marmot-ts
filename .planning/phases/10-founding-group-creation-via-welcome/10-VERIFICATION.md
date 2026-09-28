---
phase: 10-founding-group-creation-via-welcome
verified: 2026-09-28T00:00:00Z
status: gaps_found
score: 3/5 truths verified (2 failed)
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "Each invitee's Welcome is delivered independently; a failed delivery is retryable per invitee and never rolls back the group (FOUND-04, ROADMAP SC4)"
    status: failed
    reason: >
      NostrWelcomeDelivery.deliverMany() (src/client/transport/nostr/welcome-delivery.ts:139-150)
      classifies every fulfilled network.publish() Promise as "succeeded", including the case where
      every relay in the response returned { ok: false } (rejected, rate-limited, auth-required,
      etc.). It never checks the per-relay ok flag (no hasAck()-style check), unlike the
      group-event path (src/client/runtime/group-runtime.ts uses hasAck() there). Confirmed by
      direct code read; no fix commit exists after 10-REVIEW.md (CR-02) was written — git log for
      welcome-delivery.ts stops at 679bb1d (10-02), before the 2026-09-28 review.
    artifacts:
      - path: src/client/transport/nostr/welcome-delivery.ts
        issue: "deliverMany() maps every fulfilled deliver() call to { kind: 'succeeded' } with no ack check (lines ~139-150)"
      - path: src/client/group/marmot-group.ts
        issue: "pendingWelcomes (getter, ~line 722) and retryWelcome() (~line 775) both trust the mislabeled 'succeeded' outcome, so an unacknowledged Welcome is invisible to both the pending list and the retry API"
    missing:
      - "deliverMany() must classify a fulfilled deliver() result as failed when no relay in the response set ok:true (a hasAck()-equivalent check), matching the pattern already used for group-event publish outcomes in group-runtime.ts"
      - "A test asserting an all-ok:false publish response produces a WelcomeDeliveryOutcome of kind 'failed', and that retryWelcome() then re-attempts it"
  - truth: "Founding creation with an invitee list and no group relays is a safe, well-defined operation (bears on SC1/SC4/SC5 — the documented 'supported' D-09 path must not silently produce an unrecoverable group with false documentation)"
    status: failed
    reason: >
      GroupFactory.create() (src/client/group-factory.ts) still accepts invitees with an empty/absent
      relays list, merges the founding Add anyway (phantom members added permanently), and every
      Welcome then fails deterministically inside createWelcomeRumor() (per this phase's own
      deferred-items.md finding, discovered while writing 10-04's tests). There is no fail-closed
      guard, and the two source JSDoc blocks that describe the consequence are still wrong:
      group-factory.ts's CreateGroupOptions.invitees doc (~lines 86-91) and marmot-group.ts's
      deliverFoundingWelcomes() doc (~lines 738-742) both still say Welcome delivery "depends
      entirely on each recipient's own published NIP-65 inbox relays" — false; createWelcomeRumor()
      throws unconditionally for every recipient before that resolution is ever reached. 10-04
      corrected the *published* docs page (docs/client/marmot-client.md:86, verified accurate) but
      left the in-source JSDoc unrepaired, and no fail-fast guard was added to group-factory.ts.
      The resulting group is a persisted, non-recoverable dead group with N phantom members and no
      Nostr routing component — a real instance of "founding creation succeeds but no invitee can
      ever join," which directly undermines SC1/SC5 for that (documented-as-supported) input shape.
    artifacts:
      - path: src/client/group-factory.ts
        issue: "create() performs no relay-list validation before #createFounding when invitees is non-empty (no CR-01 guard); JSDoc at ~lines 86-91 still describes the disproven NIP-65-inbox-fallback behaviour"
      - path: src/client/group/marmot-group.ts
        issue: "deliverFoundingWelcomes() JSDoc at ~lines 738-742 repeats the same disproven claim"
    missing:
      - "Either: fail closed in GroupFactory.create() before any MLS state is created when invitees is non-empty and relays is empty/invalid (10-REVIEW.md CR-01's proposed fix), or explicitly re-accept D-09 as a recorded, documented divergence — but either way the stale JSDoc in the two source files must be corrected to match the verified (100%-failure) behaviour, not left contradicting deferred-items.md's own finding"
deferred: []
behavior_unverified_items: []
---

# Phase 10: Founding Group Creation via Welcome — Verification Report

**Phase Goal:** Creating a Current-profile group with initial invitees publishes no founding commit; the founding Add is merged locally to epoch 1, the group reaches `Stable` immediately, and each invitee joins via an independently-retryable Welcome.
**Verified:** 2026-09-28
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth (ROADMAP Success Criterion) | Status | Evidence |
|---|---|---|---|
| 1 | Creating a group with initial invitees merges the founding Add locally to epoch 1 and publishes no kind-445 group event for it | VERIFIED | `src/engine/group-engine.ts` `case "foundingAdd"` (lines 1189-1307) runs `createCommit` and stages a `PendingState` but never calls `peeler.wrapGroupMessage` — no transport envelope is ever constructed (comment at 1269-1278 states this explicitly, matches code). `src/engine/__tests__/founding-add-send.test.ts` and `src/client/__tests__/founding-create.test.ts` both pass (`pnpm vitest run`, 2026-09-28: 4 files, 26/26 tests green) |
| 2 | The founding Add passes the same proof and group-profile validation as an ordinary commit before it is merged | ⚠ PARTIAL — see CR-03 note below | `#assertStagedCommitLegal(parentState, newState, prepared.committedWithSenders, ...)` (group-engine.ts:1262-1267) is the identical gate `case "commit"`/`case "selfUpdate"` call, so commit *content* is validated identically. **However** the `foundingAdd` case itself has no guard restricting it to epoch 0, sole-leaf, no-unapplied-proposals, or Add-only proposals (10-REVIEW.md CR-03, verified: no such checks exist in the case body, only `groupData` presence + `mayPrepareLocalCommit`). This is reachable through the public `./engine` `SendIntent` surface, not only through `GroupFactory`. Not scored as a failed truth (the literal SC text — content validation — holds) but flagged as a real spec-conformance hole; see Gaps note below for why it isn't in the blocking `gaps:` list |
| 3 | Immediately after founding creation the group's lifecycle state is `Stable`, with no `PendingPublish` window | VERIFIED | `GroupFactory.#createFounding` calls `engine.send({kind:"foundingAdd", ...})` then `engine.confirmPublished(result.pending)` with no `await` in between (verified by reading `src/client/group-factory.ts`); `confirmPublished` reuses the existing commit-confirmation branch, which transitions to `Stable`. `src/client/__tests__/founding-create.test.ts` asserts this and passes |
| 4 | Each invitee's Welcome is delivered independently; a failed delivery is retryable per invitee and never rolls back the group | ✗ FAILED | `NostrWelcomeDelivery.deliverMany()` (`src/client/transport/nostr/welcome-delivery.ts:139-150`) marks any fulfilled `deliver()` Promise as `succeeded`, even when every relay in the response set `ok: false`. No `hasAck()`-equivalent check exists. This directly breaks the "retryable per invitee" half of this criterion: `pendingWelcomes` omits such an invitee and `retryWelcome()` refuses to retry it. Confirmed by direct code read; matches 10-REVIEW.md CR-02 exactly; no fix landed since the review |
| 5 | An invitee who receives their Welcome joins at epoch 1 and can exchange messages with the creator | VERIFIED | `src/__tests__/integration/founding-group-create-join-message.test.ts` — end-to-end positive control: two invitees join a founding-created group at epoch 1, see each other and the creator as members, exchange messages in both directions. Passes (`pnpm vitest run`, 2026-09-28) |

**Score:** 3/5 truths cleanly verified, 2 failed (criterion 4 directly; criterion 2 carries an unresolved related defect — see below)

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/engine/types.ts` | `foundingAdd` SendIntent / `foundingGroupCreated` SendResult (no `envelope`) | ✓ VERIFIED | Present, wired, used by group-engine.ts |
| `src/engine/group-engine.ts` | `case "foundingAdd"`, audit-kind arms | ✓ VERIFIED, ⚠ guard-incomplete | Case exists and is wired into `#sendInner`/audit emitters; content-validation gate present; epoch/sole-leaf/Add-only invocation guard absent (CR-03) |
| `src/client/transport/nostr/welcome-delivery.ts` | `deliverMany()`, `WelcomeDeliveryOutcome` | ✓ EXISTS, ✗ INCORRECT BEHAVIOR | Present and wired into both `GroupRuntime` and `GroupFactory`, but misclassifies unacknowledged publishes as succeeded (CR-02) |
| `src/client/group/marmot-group.ts` | `welcomeDeliveries`, `pendingWelcomes`, `deliverFoundingWelcomes()`, `retryWelcome()` | ✓ VERIFIED | All present, wired to `deliverMany`; inherits CR-02's misclassification since it trusts `deliverMany`'s outcome |
| `src/client/group-factory.ts` | `CreateGroupOptions.invitees`, founding orchestration branch | ✓ EXISTS, ✗ NO FAIL-CLOSED GUARD | Present and wired (creates founding engine, admits invitees via `createInviteIntent`, confirms, fans out Welcomes); accepts relay-less invitee lists without guard (CR-01); JSDoc at ~86-91 still inaccurate |
| `src/client/__tests__/founding-create.test.ts` | Behavioural matrix (D-13, FOUND-02, D-12, FOUND-04, R-04, D-09, fork-tree persistence) | ✓ VERIFIED (exists, passes) | 14 tests pass, but Test 13 pins the CR-01 defect (100%-Welcome-failure-with-no-guard) as "expected behaviour" rather than testing a fix |
| `src/__tests__/integration/founding-group-create-join-message.test.ts` | FOUND-05 positive control | ✓ VERIFIED | 1 test, passes |
| `docs/client/marmot-client.md` / `docs/client/marmot-group.md` | Founding-creation + retry docs | ✓ VERIFIED (accurate) | Both pages correctly describe the verified (not the originally-predicted) relay-less behaviour; `marmot-client.md:86` is accurate. Source-level JSDoc in `group-factory.ts`/`marmot-group.ts` was NOT updated to match and remains stale/false |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `group-engine.ts` `case "foundingAdd"` | `types.ts` `foundingGroupCreated` | return type | ✓ WIRED | Confirmed by read |
| `group-factory.ts` | `group/invite.ts` `createInviteIntent` | founding invitee admission | ✓ WIRED | Confirmed by read; reuses trust boundary as claimed (D-11) |
| `group-factory.ts` | `group-engine.ts` `confirmPublished` | no-yield confirm | ✓ WIRED | Confirmed — no intervening `await` |
| `group/marmot-group.ts` `retryWelcome`/`deliverFoundingWelcomes` | `welcome-delivery.ts` `deliverMany` | fanout | ✓ WIRED (but propagates CR-02's bug) | Confirmed by read |
| `runtime/group-runtime.ts` | `welcome-delivery.ts` `deliverMany` | ordinary-invite fanout | ✓ WIRED | Confirmed by read — same shared implementation, same CR-02 defect applies to ordinary invite too (see 10-REVIEW.md IN-03) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Founding-Add send seam engine tests | `pnpm vitest run src/engine/__tests__/founding-add-send.test.ts` | 6/6 passed | ✓ PASS |
| Welcome-delivery fanout unit tests | `pnpm vitest run src/client/transport/nostr/__tests__/welcome-delivery.test.ts` | 5/5 passed | ✓ PASS (but does not cover the all-ok:false case — CR-02 gap) |
| Founding-create client behavioural matrix | `pnpm vitest run src/client/__tests__/founding-create.test.ts` | 14/14 passed | ✓ PASS (Test 13 pins the CR-01 defect as expected, not fixed) |
| FOUND-05 end-to-end positive control | `pnpm vitest run src/__tests__/integration/founding-group-create-join-message.test.ts` | 1/1 passed | ✓ PASS |

All four files run together: `pnpm vitest run <4 files>` → 4 files, 26/26 tests passed, 2026-09-28. (Full workspace suite not re-run; these are the phase's own targeted test files, run once as documented above — no full-suite grep loop.)

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| FOUND-01 | 10-01, 10-03 | Founding Add merged locally to epoch 1, no kind-445 published | ✓ SATISFIED | group-engine.ts case, engine + client tests |
| FOUND-02 | 10-01, 10-04 | Founding Add passes same proof/profile validation as ordinary commit | ⚠ PARTIAL | Content-validation gate identical (`#assertStagedCommitLegal`); invocation-legality guard (epoch 0, sole leaf, Add-only) missing on the public `./engine` `foundingAdd` intent (CR-03) — not itself blocking the documented client-level flow, but a real, verified conformance gap on the public API |
| FOUND-03 | 10-01, 10-04 | Stable immediately, no PendingPublish window | ✓ SATISFIED | No-yield send→confirm; tests pass |
| FOUND-04 | 10-02, 10-03, 10-04 | Independent, retryable per-invitee Welcome delivery, never rolls back | ✗ BLOCKED | `deliverMany()` misreports unacknowledged publishes as succeeded (CR-02); `retryWelcome` then refuses to retry them |
| FOUND-05 | 10-04 | Invitee joins at epoch 1, exchanges messages with creator | ✓ SATISFIED | Integration test passes |

REQUIREMENTS.md currently marks all five FOUND-* items `[x]` complete; FOUND-02 and FOUND-04 should be reopened per this verification pending the CR-01/CR-02/CR-03 fixes.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `src/client/group-factory.ts` | ~86-91 | Stale/false JSDoc describing a disproven NIP-65-inbox-fallback recovery for relay-less founding create | ⚠ Warning | Misleads any developer reading the source directly (the published docs page was fixed in 10-04, but this in-source copy was not); compounds CR-01 |
| `src/client/group/marmot-group.ts` | ~738-742 | Same stale/false JSDoc, second copy | ⚠ Warning | Same as above |
| — | — | No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers found in any phase-10 file | ℹ Info | Debt-marker gate: clean |

No blocker-level anti-patterns beyond the two findings already carried into `gaps:` (CR-01, CR-02) and the CR-03 note under criterion 2.

### Human Verification Required

None — all items in this report are resolvable from static code reading, git history, and the phase's own targeted test runs. No UNCERTAIN items requiring a human judgment call remain open.

## Gaps Summary

The happy path — founding create with relays supplied, all Welcomes deliverable, epoch-1 join, bidirectional messaging (criteria 1, 3, 5) — is solidly implemented and covered by passing tests, including a real end-to-end positive control (FOUND-05). That part of the phase goal is achieved.

However, `10-REVIEW.md` (code review, same date as this verification) identified three Critical issues, and a direct re-read of the current codebase confirms **none of them have been fixed** — no commit exists after the review's timestamp that touches any of the three files it names, and `git log` for `group-factory.ts`, `welcome-delivery.ts`, and `group-engine.ts` stops at the 10-01/10-02/10-03 feature commits, before `fd3df86 docs(10): add code review report`.

Two of the three are scored as failed truths here because they falsify an explicit ROADMAP success criterion or materially undermine it:

- **CR-02** (`deliverMany` mislabels zero-ack Welcome publishes as `succeeded`) directly falsifies criterion 4 — "a failed delivery is retryable per invitee." An invitee whose Welcome every relay rejected is invisible to `pendingWelcomes` and cannot be retried. This also affects ordinary (non-founding) invites, since `deliverMany` is the one shared implementation (10-REVIEW.md IN-03).
- **CR-01** (relay-less founding create has no fail-closed guard, and the resulting all-Welcomes-fail, unrecoverable-group behaviour is still described inaccurately in two source JSDoc blocks, even though the phase's own `deferred-items.md` documents the correct, verified behaviour) undermines criteria 1/5 for the documented "supported" (D-09) input shape: the group is created, is permanently unusable, and nobody is ever told why by the source-level documentation.

The third (**CR-03**, the engine's public `foundingAdd` `SendIntent` having no epoch-0/sole-leaf/Add-only guard) is noted against criterion 2 rather than scored as an independent failed truth, because the literal success-criterion text (commit-content validation) is satisfied by the shared `#assertStagedCommitLegal` gate. It remains a real, verified, unresolved defect: a silent-fork hazard reachable through the public `./engine` surface that the spec explicitly restricts to epoch 0.

**Recommendation:** do not proceed to the next phase until CR-01 and CR-02 are fixed (10-REVIEW.md gives concrete patches for both) and CR-03 is at minimum decided — fixed, or explicitly accepted as a recorded, documented risk given the single in-tree caller. All three fixes are narrowly scoped and were already designed in the review; this does not require new planning, only a remediation pass.

---

_Verified: 2026-09-28_
_Verifier: Claude (gsd-verifier)_
