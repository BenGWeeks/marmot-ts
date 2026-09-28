---
phase: 10-founding-group-creation-via-welcome
plan: 06
subsystem: client-transport
tags: [gap-closure, cr-02, welcome-delivery, publish-ack, retry]

# Dependency graph
requires: []
provides:
  - "NostrWelcomeDelivery.deliverMany() classifies a fulfilled-but-unacknowledged publish as failed, via the shared hasAck() helper"
  - "MarmotGroup.pendingWelcomes / retryWelcome consumer proof: an unacknowledged founding Welcome is visible and retryable"
  - "GroupRuntime ordinary-invite consumer proof with a real NostrWelcomeDelivery"
  - "group-runtime.test.ts's makeDeliverManyFromDeliver delegates to the production NostrWelcomeDelivery.prototype.deliverMany"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ack classification lives in exactly one place (src/utils/nostr.ts hasAck); deliverMany() applies it rather than duplicating an ok-scan"
    - "Test doubles that reproduce production logic (makeDeliverManyFromDeliver) delegate to the real method via Function.prototype.call with a minimal { deliver } stand-in for `this`, instead of hand-copying the classification"

key-files:
  created: []
  modified:
    - src/client/transport/nostr/welcome-delivery.ts
    - src/client/transport/nostr/__tests__/welcome-delivery.test.ts
    - src/client/group/__tests__/marmot-group.test.ts
    - src/client/runtime/__tests__/group-runtime.test.ts
    - docs/client/marmot-group.md

key-decisions:
  - "Per the user's 2026-09-28 decision, CR-02 is a blocking fix: reused the existing hasAck() helper rather than introducing a second ack-detection implementation"
  - "The error message is built as a single base literal (`No relay accepted the Welcome`) with an optional parenthesised detail appended, so the acceptance grep for the literal string matches exactly once in the source file even though both the all-ok:false and empty-response cases share it"
  - "Reworded the makeDeliverManyFromDeliver docstring to avoid repeating the literal `NostrWelcomeDelivery.prototype.deliverMany` string a second time, so the acceptance grep for that exact call-site string matches exactly once (the real call), not the comment"

patterns-established:
  - "A fulfilled-but-unacknowledged publish is a `failed` WelcomeDeliveryOutcome, not `succeeded` — consumers (MarmotGroup.pendingWelcomes, retryWelcome, GroupRuntime's ordinary-invite outcomes) inherit this for free since they all read deliverMany()'s classification rather than re-deriving it"

requirements-completed: [FOUND-04]

# Metrics
duration: ~35min
completed: 2026-09-28
status: complete
---

# Phase 10 Plan 06: Ack-Aware Welcome Delivery Classification (CR-02) Summary

**`NostrWelcomeDelivery.deliverMany()` now classifies a fulfilled publish where no relay acknowledged as `failed` (via the shared `hasAck()` helper), so an unacknowledged Welcome stays visible in `MarmotGroup.pendingWelcomes` and is retried by `retryWelcome` instead of being silently reported as delivered.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-09-28
- **Tasks:** 2
- **Files modified:** 5 (0 created, 5 modified)

## Accomplishments

- `deliverMany()`'s fulfilled branch now checks `hasAck(result.value)` (the same helper `GroupRuntime#publishToGroupRelays` already uses for group events) before classifying a publish as `succeeded`; an all-`ok:false` or empty response is now `failed` with an error naming each rejecting relay and its message.
- `deliver()` itself is untouched — it still returns the raw per-relay response; classification is `deliverMany()`'s responsibility alone.
- Proved the fix at three levels: the `deliverMany` unit (3 new tests: all-nack, mixed-ack, empty-response), the `MarmotGroup` founding-create retry surface (an unacknowledged invitee appears in `pendingWelcomes` and `retryWelcome` re-publishes it until a relay acknowledges), and the `GroupRuntime` ordinary-invite path (a real `NostrWelcomeDelivery` against an all-nacking network reports a `failed` outcome).
- `group-runtime.test.ts`'s `makeDeliverManyFromDeliver` test double no longer hand-writes a settle-and-map copy of the classification logic — it now delegates to `NostrWelcomeDelivery.prototype.deliverMany` itself, so the runtime suite cannot silently drift from the production method again.
- Documented in `docs/client/marmot-group.md` that a delivery counts as `succeeded` only when at least one relay acknowledged it, and that the same rule applies to an ordinary invite's per-recipient outcomes.

## Task Commits

Each task was committed atomically:

1. **Task 1: Ack-aware classification in NostrWelcomeDelivery.deliverMany with unit tests** - `d34d6ba` (fix)
2. **Task 2: Prove the fix at the MarmotGroup retry surface and the GroupRuntime ordinary-invite path; document it** - `42296e4` (test)

## Files Created/Modified

- `src/client/transport/nostr/welcome-delivery.ts` - `deliverMany()` imports and applies `hasAck`; fulfilled-but-unacknowledged publishes map to `{ kind: "failed" }` with a "No relay accepted the Welcome" error naming rejecting relays; JSDoc on `WelcomeDeliveryOutcome` and `deliverMany` updated to define `succeeded`/`failed` in terms of relay acknowledgement (CR-02); `deliver()` byte-for-byte unchanged
- `src/client/transport/nostr/__tests__/welcome-delivery.test.ts` - `makeNetwork` gains an optional `publish` override parameter; three new tests cover all-`ok:false` (naming both rejecting relays), mixed `ok:true`/`ok:false` (still succeeded, full response), and empty-response (failed) cases; all five pre-existing tests pass unmodified
- `src/client/group/__tests__/marmot-group.test.ts` - new test in the "MarmotGroup founding Welcome delivery report" describe block: a founding fanout where every relay nacks the second recipient's gift wrap puts it in `pendingWelcomes`; `retryWelcome` while still nacked re-publishes (call count increases) and stays failed/pending; after the network recovers, `retryWelcome` succeeds and `pendingWelcomes` empties
- `src/client/runtime/__tests__/group-runtime.test.ts` - `NostrWelcomeDelivery` import changed from type-only to a value import; `makeDeliverManyFromDeliver` now delegates to `NostrWelcomeDelivery.prototype.deliverMany.call({ deliver }, options)` instead of a hand-copied classification; new test drives a real `NostrWelcomeDelivery` (network that always nacks) through an ordinary-invite `groupEvolution` commit and asserts the resulting `welcomeDelivery.outcomes` reports `failed`
- `docs/client/marmot-group.md` - new paragraph in "Founding Welcome delivery and retry" defining a succeeded delivery as "at least one relay acknowledged" and noting the same rule applies to ordinary-invite Welcome outcomes

## Decisions Made

- Reused `hasAck()` from `src/utils/nostr.ts` rather than writing a second ack-detection helper — verified with `grep -rn "export const hasAck\|function hasAck" src --include='*.ts'` finding exactly one definition.
- Built the "No relay accepted the Welcome" error as one base literal with an appended, optional parenthesised detail (rather than two separate literal strings for the "with rejections" and "empty response" cases), so the string exists exactly once in the source file as the acceptance criteria require, while still surfacing per-relay detail when available.
- Reworded the `makeDeliverManyFromDeliver` docstring in `group-runtime.test.ts` to describe the delegation without repeating the exact literal `NostrWelcomeDelivery.prototype.deliverMany` string a second time — the acceptance criteria grep for that literal expects exactly one match (the actual call site), and an initial draft that also spelled the call out in the comment produced two matches.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Worktree missing submodules and node_modules**

- **Found during:** initial setup, before Task 1
- **Issue:** the parallel worktree had no `node_modules`, and the `ts-mls`, `refs/mdk`, and `refs/marmot` git submodules were unpopulated (empty directories with placeholder gitlinks). `pnpm vitest run` on `group-runtime.test.ts` failed with "Cannot find module '.../refs/mdk/crates/cgka-conformance-simulator/vectors/publish-fail.v1.json'" until `refs/mdk` and `refs/marmot` were initialized.
- **Fix:** ran `git submodule update --init ts-mls`, then `pnpm install --frozen-lockfile` (which also built the `ts-mls` fork via its `prepare` script), then `git submodule update --init refs/mdk refs/marmot` once the missing-fixture error surfaced.
- **Files modified:** none (environment setup only, no source changes)
- **Commit:** not applicable (no tracked files changed)

None beyond the environment setup above — no Rule 1/2/4 deviations. The implementation matches the plan's `<action>` steps verbatim.

## Known Stubs

None.

## Threat Flags

None. This plan's `<threat_model>` already covers the new surface (T-10-29 through T-10-32); no additional untracked surface was introduced.

## Issues Encountered

None beyond the worktree submodule/dependency bootstrap documented above.

## User Setup Required

None - no external service configuration required.

## Verification

- `pnpm vitest run src/client/transport/nostr/__tests__/welcome-delivery.test.ts src/client/group/__tests__/marmot-group.test.ts src/client/runtime/__tests__/group-runtime.test.ts` → 3 files, 45 tests, all passing.
- `pnpm vitest run src/client/ src/__tests__/` → 42 files, 397 tests, all passing.
- `pnpm compile` (tsc -b tsconfig.build.json) exits 0.
- `pnpm exec tsc -p tsconfig.json --noEmit` (full project including tests) exits 0.
- `pnpm exec prettier --check` on all five modified files exits 0.
- All plan acceptance-criteria greps for both tasks verified individually and pass as specified.

## Next Phase Readiness

- CR-02 (10-VERIFICATION.md truth 4 / FOUND-04) is closed: a Welcome is `succeeded` iff at least one relay acknowledged it, otherwise `failed` and retryable, at every level (unit, `MarmotGroup`, `GroupRuntime`).
- No blockers for sibling gap-closure plans 10-05 (relay-less founding-create guard) or 10-07 (engine foundingAdd guard) — this plan touched only `welcome-delivery.ts` and its own test/doc files, none of which overlap those plans' `files_modified`.

---
*Phase: 10-founding-group-creation-via-welcome*
*Completed: 2026-09-28*

## Self-Check: PASSED

- FOUND: src/client/transport/nostr/welcome-delivery.ts
- FOUND: src/client/transport/nostr/__tests__/welcome-delivery.test.ts
- FOUND: src/client/group/__tests__/marmot-group.test.ts
- FOUND: src/client/runtime/__tests__/group-runtime.test.ts
- FOUND: docs/client/marmot-group.md
- FOUND commit: d34d6ba
- FOUND commit: 42296e4
