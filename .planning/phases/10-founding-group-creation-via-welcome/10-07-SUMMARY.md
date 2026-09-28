---
phase: 10-founding-group-creation-via-welcome
plan: 07
subsystem: engine
tags: [gap-closure, cr-03, engine, founding-add, silent-fork, spec-conformance]

# Dependency graph
requires:
  - phase: 10-01
    provides: "case \"foundingAdd\" send seam (FOUND-01..03), the founding-add-send.test.ts fixture set"
provides:
  - "Invocation-legality guard on MarmotGroupEngine.send({ kind: \"foundingAdd\" }): epoch-0, sole-local-leaf, no-unapplied-proposals, non-empty all-Add proposal set"
  - "Documented CR-03 preconditions on the public SendIntent foundingAdd member"
  - "Five rejection tests proving each branch throws before createCommit with state, lifecycle, history and wrapCount unchanged"
affects: [10-VERIFICATION, 10-REVIEW, founding-group-creation, engine-public-api]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Invocation-legality guard preceding proposal resolution and createCommit, mirroring case \"commit\"'s placement of its groupData/lifecycle guards"

key-files:
  created: []
  modified:
    - src/engine/group-engine.ts
    - src/engine/types.ts
    - src/engine/__tests__/founding-add-send.test.ts

key-decisions:
  - "Reused the existing private #occupiedLeafIndices() helper for the sole-leaf check rather than adding a new tree scan"
  - "Applied the Add-only rule to the intent's own resolved proposals only, explicitly exempting the engine-generated admin-policy splice from #prepareOutboundCommitProposals"
  - "Split the plan's two tasks into two separate commits by temporarily reverting Task 2's guard/JSDoc edits, writing and RED-confirming Task 1's tests, committing, then reapplying Task 2's edits and RED-confirming its tests before GREEN"

patterns-established:
  - "CR-03 guard ordering: state-precondition checks (epoch, sole-leaf, unapplied-proposals) run immediately after the existing groupData/mayPrepareLocalCommit guards and before any await; the Add-only/non-empty check runs on RESOLVED proposals, after the extraProposals resolution loop and before #prepareOutboundCommitProposals"

requirements-completed: [FOUND-02]

coverage:
  - id: D1
    description: "foundingAdd refuses invocation on a group past epoch 0 (the live-group silent-fork case), leaving engine.state, lifecycle, history and wrapCount unchanged, and does not block a following selfUpdate"
    requirement: "FOUND-02"
    verification:
      - kind: unit
        ref: "src/engine/__tests__/founding-add-send.test.ts#foundingAdd invocation guard (CR-03) > CR-03: refuses foundingAdd on a group already past epoch 0 (the live-group silent-fork case) and leaves state unchanged"
        status: pass
    human_judgment: false
  - id: D2
    description: "foundingAdd refuses invocation when the tree holds more than the local member, even at epoch 0"
    requirement: "FOUND-02"
    verification:
      - kind: unit
        ref: "src/engine/__tests__/founding-add-send.test.ts#foundingAdd invocation guard (CR-03) > CR-03: refuses foundingAdd when the tree holds more than the local member, even at epoch 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "foundingAdd refuses invocation while unapplied proposals are staged (createCommit would otherwise bundle them by reference)"
    requirement: "FOUND-02"
    verification:
      - kind: unit
        ref: "src/engine/__tests__/founding-add-send.test.ts#foundingAdd invocation guard (CR-03) > CR-03: refuses foundingAdd while unapplied proposals are staged"
        status: pass
    human_judgment: false
  - id: D4
    description: "foundingAdd refuses a non-Add proposal in extraProposals, both by value and via a ProposalAction that resolves to one (proves the check runs on resolved proposals)"
    requirement: "FOUND-02"
    verification:
      - kind: unit
        ref: "src/engine/__tests__/founding-add-send.test.ts#foundingAdd invocation guard (CR-03) > CR-03: refuses foundingAdd carrying a non-Add proposal, by value or via a ProposalAction"
        status: pass
    human_judgment: false
  - id: D5
    description: "foundingAdd refuses an empty extraProposals array before createCommit is reached"
    requirement: "FOUND-02"
    verification:
      - kind: unit
        ref: "src/engine/__tests__/founding-add-send.test.ts#foundingAdd invocation guard (CR-03) > CR-03: refuses foundingAdd with no proposals"
        status: pass
    human_judgment: false
  - id: D6
    description: "Legitimate founding path (GroupFactory, FOUND-01..05) is unaffected by the new guards"
    requirement: "FOUND-02"
    verification:
      - kind: unit
        ref: "src/engine/__tests__/founding-add-send.test.ts (6 pre-existing tests)"
        status: pass
      - kind: unit
        ref: "src/client/__tests__/founding-create.test.ts (14 tests)"
        status: pass
      - kind: integration
        ref: "src/__tests__/integration/founding-group-create-join-message.test.ts (FOUND-05 positive control)"
        status: pass
    human_judgment: false

# Metrics
duration: ~25min
completed: 2026-09-28
status: complete
---

# Phase 10 Plan 07: CR-03 foundingAdd Invocation-Legality Guard Summary

**Closed the public-`./engine` silent-fork hazard: `MarmotGroupEngine.send({ kind: "foundingAdd" })` now throws before `createCommit` unless the group is a one-member epoch-0 group with no unapplied proposals and a non-empty, all-Add proposal set.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-09-28
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `case "foundingAdd"` in `src/engine/group-engine.ts` gained five ordered guard checks, all running before any `await`, any proposal resolution, and any `createCommit`:
  1. `groupContext.epoch !== 0n` → refused ("only legal at epoch 0")
  2. more than one occupied leaf, or the local member is not the sole leaf → refused
  3. any unapplied proposals staged → refused (would otherwise be bundled by reference into the commit)
  4. zero resolved proposals → refused ("requires at least one Add proposal")
  5. any resolved proposal is not an Add → refused ("may only carry Add proposals")
- The Add-only rule (#5) applies to the intent's own resolved `extraProposals` only — the engine-generated admin-policy splice appended by `#prepareOutboundCommitProposals` (`#adminPolicySpliceFor`) is explicitly exempt and remains gated by the shared `#assertStagedCommitLegal` call, per the plan's threat-register T-10-36 (accepted, not a caller-supplied input).
- `SendIntent`'s `foundingAdd` member in `src/engine/types.ts` documents the full CR-03 contract (comment-only change; no type-shape change).
- Five new engine tests in `src/engine/__tests__/founding-add-send.test.ts`, one per rejection branch, each asserting: the specific error regex, `engine.state` is the identical object reference, `engine.lifecycle === "Stable"`, unchanged `engine.history.size`, and unchanged `wrapCount()`. The epoch test additionally proves a following `selfUpdate` is not left blocked as `PendingPublish`.
- All six pre-existing `founding-add-send.test.ts` tests, the 14-test `founding-create.test.ts` client suite, and the FOUND-05 integration test pass unchanged — the legitimate founding path is unaffected.

## Task Commits

Each task was committed atomically:

1. **Task 1: State preconditions (epoch 0, sole local leaf, no unapplied proposals) with rejection tests** - `de11d95` (feat)
2. **Task 2: Add-only / non-empty proposal rule, documented SendIntent preconditions, and regression sweep** - `e772051` (feat)

_TDD note: both tasks followed RED→GREEN. Task 2's RED phase was confirmed against Task 1's already-committed guard code (the non-Add and empty-proposals tests failed with pre-existing, unrelated error messages — "This commit would remove the last member..." and "createCommit produced no Welcome..." — proving the new checks did not yet exist) before the Add-only/non-empty guard was added._

## Files Created/Modified

- `src/engine/group-engine.ts` - `case "foundingAdd"` gained the five-check invocation-legality guard (epoch/sole-leaf/unapplied-proposals immediately after the existing `groupData`/`mayPrepareLocalCommit` guards; empty/non-Add checks after the `extraProposals` resolution loop and before `#prepareOutboundCommitProposals`)
- `src/engine/types.ts` - `foundingAdd` `SendIntent` member JSDoc extended with the CR-03 precondition contract (comment-only)
- `src/engine/__tests__/founding-add-send.test.ts` - new `describe("foundingAdd invocation guard (CR-03)", ...)` block with 5 tests; header docstring updated with a CR-03 bullet

## Decisions Made

- Reused the existing private `#occupiedLeafIndices()` helper for the sole-leaf check instead of adding a second ratchet-tree scan (per the plan's `key_links`).
- Applied the Add-only rule strictly to the intent's own resolved proposals (`newProposals`), not to `prepared.extraProposals`/`prepared.committedProposals`, so the engine's own admin-policy splice — which is not caller-supplied — is unaffected. Documented inline with a one-line comment citing CR-03.
- To keep the two plan tasks as genuinely separate, verifiable commits despite both editing `case "foundingAdd"` in the same file: implemented both guards first, then temporarily reverted Task 2's Add-only guard and its `types.ts` JSDoc addition, wrote and RED-confirmed Task 1's three tests against only the Task 1 guard, committed, then reapplied Task 2's guard + JSDoc, wrote and RED-confirmed its two tests, and committed. This preserves per-task atomic commits and real RED/GREEN evidence for each task rather than a single combined diff.
- The two-member-at-epoch-0 test (Task 1, rejection branch 2) used the plan's primary approach — constructing a second `MarmotGroupEngine` directly over a two-member state with `groupContext.epoch` overridden to `0n` — rather than falling back to a synthetic duplicated-leaf ratchet tree. The engine constructor does not validate tree/epoch consistency, so no fallback was needed.

## Deviations from Plan

None — plan executed exactly as written. Both tasks' acceptance criteria (grep counts, `awk` ordering checks, test counts, `pnpm compile`/`tsc --noEmit`/prettier) were verified explicitly and all passed; see Issues Encountered for one environment-setup step needed before verification could run.

## Issues Encountered

- The worktree had no `node_modules` and the `ts-mls` submodule was uninitialized (`git submodule status` showed a `-` prefix), so `pnpm exec prettier` initially failed with "no package named ts-mls is present in the workspace." Resolved per the orchestrator's stated build note: `git submodule update --init ts-mls` followed by `pnpm install --frozen-lockfile` (which also ran the `ts-mls` fork's own `prepare` build automatically). No production code was affected; this was pure environment setup.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CR-03 is closed: `10-VERIFICATION.md` truth 2 / FOUND-02's "PARTIAL" note can be upgraded — both content validation (the shared `#assertStagedCommitLegal` gate, already verified) and invocation legality (this plan's guard) now hold on the public `./engine` `foundingAdd` surface.
- `git diff --stat src/client/ src/core/` is empty for this plan's commits — confirmed engine-only change, no ripple into client or core layers.
- This closes one of three gap-closure plans (10-05 CR-01, 10-06 CR-02, 10-07 CR-03) spawned from `10-REVIEW.md`; REQUIREMENTS.md/STATE.md/ROADMAP.md updates for the wave as a whole are the orchestrator's responsibility after all three land.

---
*Phase: 10-founding-group-creation-via-welcome*
*Completed: 2026-09-28*
