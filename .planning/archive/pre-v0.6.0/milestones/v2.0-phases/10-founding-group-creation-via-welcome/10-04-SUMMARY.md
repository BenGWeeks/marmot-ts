---
phase: 10-founding-group-creation-via-welcome
plan: 04
subsystem: testing
tags: [integration-test, founding-create, welcome-retry, docs, positive-control, mock-network]

# Dependency graph
requires:
  - phase: 10-founding-group-creation-via-welcome
    provides: "plan 10-03's founding orchestration in GroupFactory.create() (options.invitees), MarmotGroup.welcomeDeliveries/pendingWelcomes/retryWelcome(), and the founding-create.test.ts scaffolding this plan extends"
provides:
  - "the FOUND-05 end-to-end positive control: two invitees join a founding-created group at epoch 1 from their own Welcome, see each other and the creator as members, and exchange messages with the creator in both directions"
  - "the extended behavioural matrix on founding-create.test.ts: D-13 duplicate refusal, FOUND-02 refusal through the public API, D-12/FOUND-04 partial Welcome failure and retry, R-04 non-durability on reload, D-09/R-05 relay-less founding create, and fork-tree persistence through a configured rewind store"
  - "downstream docs (marmot-client.md, marmot-group.md) describing founding creation, its per-invitee Welcome report, and both accepted caveats — corrected to the actually-verified relay-less behavior, not the phase's original (incomplete) prediction"
  - "a phase-level deferred-items.md logging a pre-existing pnpm lint drift (3 files from plan 10-02) and the D-09/R-05 discrepancy discovered while writing this plan's tests"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Forcing a single recipient's Welcome delivery to fail while a group relay IS configured requires making that recipient's getUserInboxRelays() resolve to an empty array (not throw) — a throw falls back to the non-empty groupRelays and always succeeds, silently defeating the intended per-recipient failure"
    - "A relay-less founding create cannot be used to test partial per-recipient Welcome failure at all: createWelcomeRumor() throws for every recipient before per-recipient relay resolution is even reached, so relays: RELAYS is required for any test exercising one-succeeds-one-fails semantics"
    - "A plain object spread copies own enumerable Symbol-keyed properties too — cloning a NostrEvent that has already been through applesauce's verifyEvent() carries over the cached verifiedSymbol result, so a tampered-signature test clone must explicitly delete that symbol or the tamper is silently ignored"
    - "applesauce's unlockGiftWrap()/getSealRumor() cache the decrypted rumor on the event object itself once unlocked by any caller with the right key; combined with MockNetwork sharing object references in-process (not serializing bytes), the creator's own gift-wrap object is effectively pre-unlocked before test code touches it, making a same-process cross-signer decrypt-failure assertion unreliable — rely on p-tag addressing plus the correct-signer round trip instead"
    - "MarmotGroup.submitIntent() is convergence-gated (queues behind a ~1s default settlementQuiescenceMs immediately after a founding create, since the founding Add is the most recent convergence-relevant input); to observe an immediate refusal (e.g. a relay-less group's send failing) bypass the queue via group.session.send(intent) / group.runtime.publishEffects(effects) directly rather than group.submitIntent()"

key-files:
  created:
    - src/__tests__/integration/founding-group-create-join-message.test.ts
    - .planning/phases/10-founding-group-creation-via-welcome/deferred-items.md
  modified:
    - src/client/__tests__/founding-create.test.ts
    - docs/client/marmot-client.md
    - docs/client/marmot-group.md

key-decisions:
  - "Wrote Test 13 (D-09/R-05) and the corresponding docs to assert the VERIFIED behavior (a relay-less founding create's Welcome delivery fails for every invitee, because createWelcomeRumor() unconditionally requires a non-empty relays tag) rather than the plan's Pinned Expectations / CONTEXT.md's prediction (partial failure limited to invitees without their own NIP-65 inbox relays) — the prediction does not match the current implementation; softening the test to match the wrong prediction would have hidden a real discrepancy in the phase's own planning documents"
  - "Redesigned the Test 9-12 shared helper to supply relays: RELAYS and force the failing invitee's getUserInboxRelays() to resolve to [] (not throw), after empirically confirming a throw falls back to the (non-empty) group relays and always succeeds — the originally-planned relay-less, throw-based design cannot produce a genuine per-recipient-only failure"
  - "Dropped the originally-planned cross-signer gift-wrap decrypt-failure assertion in the FOUND-05 integration test after confirming (via a throwaway debug test) that the gift wrap is already unlocked immediately after create() resolves, before any test code runs — a same-process caching artifact of applesauce's gift-wrap helpers plus MockNetwork's shared object references, not a real security property this harness can observe; kept the p-tag addressing + correct-signer round-trip checks instead, matching the existing end-to-end-invite-join-message.test.ts analog's scope"
  - "Logged (did not fix) a pre-existing pnpm lint (Prettier) failure across 3 files from plan 10-02 (group-runtime.ts and two of its test files) discovered while running this plan's own pnpm lint acceptance check — reverted an inadvertent pnpm format --write touch on those files and logged the drift to deferred-items.md instead of fixing it, since this plan's scope is declared test-and-docs-only"

requirements-completed: [FOUND-02, FOUND-04, FOUND-05]

coverage:
  - id: D1
    description: "An invitee of a founding create joins at epoch 1 from their Welcome and exchanges messages with the creator in both directions, with relays supplied (FOUND-05 positive control)"
    requirement: "FOUND-05"
    verification:
      - kind: integration
        ref: "src/__tests__/integration/founding-group-create-join-message.test.ts#admin founding-creates a group with two invitees; both join at epoch 1, see each other, and exchange messages with the creator"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every invitee of a multi-invitee founding create sees the other invitees as members, proving one shared founding Add rather than N sequential commits"
    requirement: "FOUND-05"
    verification:
      - kind: integration
        ref: "src/__tests__/integration/founding-group-create-join-message.test.ts#admin founding-creates a group with two invitees; both join at epoch 1, see each other, and exchange messages with the creator (Step 6 shared-commit assertion)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A duplicate invitee (D-13) and an untrusted invitee (FOUND-02, tampered KeyPackage signature) are refused through the public create() API before anything is burned or persisted"
    requirement: "FOUND-02"
    verification:
      - kind: unit
        ref: "src/client/__tests__/founding-create.test.ts#Test 7 (D-13): creating with a duplicate invitee KeyPackage is refused before anything is burned"
        status: pass
      - kind: unit
        ref: "src/client/__tests__/founding-create.test.ts#Test 8 (FOUND-02): creating with a tampered-signature invitee KeyPackage is refused through the public create() API"
        status: pass
    human_judgment: false
  - id: D4
    description: "A founding create with one undeliverable invitee still reaches epoch 1 with all members and reports only that invitee as pending; retryWelcome re-delivers exactly the failed invitee and clears it from pendingWelcomes; retryWelcome fails loudly on an unknown pubkey and no-ops on an already-succeeded one"
    requirement: "FOUND-04"
    verification:
      - kind: unit
        ref: "src/client/__tests__/founding-create.test.ts#Test 9 (D-12/FOUND-04): a founding create with one undeliverable invitee still resolves at epoch 1 with all members"
        status: pass
      - kind: unit
        ref: "src/client/__tests__/founding-create.test.ts#Test 10 (FOUND-04): retryWelcome re-delivers exactly the failed invitee's Welcome and clears it from pendingWelcomes"
        status: pass
      - kind: unit
        ref: "src/client/__tests__/founding-create.test.ts#Test 11 (FOUND-04): retryWelcome rejects for a pubkey that was never an invitee, and no-ops on an already-succeeded invitee"
        status: pass
    human_judgment: false
  - id: D5
    description: "The delivery report is non-durable — a group reloaded from the store reports no pending Welcomes even though an invitee was never reached (R-04, documented)"
    verification:
      - kind: unit
        ref: "src/client/__tests__/founding-create.test.ts#Test 12 (R-04): a group reloaded from the store reports no pending Welcomes even though an invitee was never reached"
        status: pass
    human_judgment: false
  - id: D6
    description: "A relay-less founding create still merges the founding Add at epoch 1, and the resulting group cannot carry ordinary group traffic (D-09/R-05) — asserted against the VERIFIED behavior (100% Welcome-delivery failure), documented for downstream apps"
    verification:
      - kind: unit
        ref: "src/client/__tests__/founding-create.test.ts#Test 13 (D-09/R-05): a relay-less founding create still merges the founding Add at epoch 1, but every Welcome fails and the group cannot carry ordinary group traffic"
        status: pass
    human_judgment: false
  - id: D7
    description: "The founding commit's fork-tree node is persisted when a rewind store is configured, so the supplied history tree is actually bound"
    verification:
      - kind: unit
        ref: "src/client/__tests__/founding-create.test.ts#Test 14: a founding create driven through a GroupsManager configured with a rewind store binds the supplied history tree before the single save"
        status: pass
    human_judgment: false
  - id: D8
    description: "Downstream docs (marmot-client.md, marmot-group.md) state founding-create behaviour and both accepted caveats, corrected to the verified relay-less behavior"
    verification:
      - kind: other
        ref: "docs/client/marmot-client.md 'Founding creation with initial invitees' section + docs/client/marmot-group.md 'Founding Welcome delivery and retry' section; pnpm docs:build exits 0"
        status: pass
    human_judgment: false

duration: ~25min
completed: 2026-09-28
status: complete
---

# Phase 10 Plan 04: Founding Create Behavioural Matrix, Positive Control, and Docs Summary

**The FOUND-05 positive control (two invitees join a founding-created group at epoch 1 and message the creator), an 8-test behavioural matrix (D-13/FOUND-02 refusals, D-12/FOUND-04 partial failure and retry, R-04 non-durability, D-09/R-05 relay-less create, fork-tree persistence), and downstream docs — with one CONTEXT.md/RESEARCH.md prediction corrected to match verified behavior along the way.**

## Performance

- **Duration:** ~25 min (including one-time worktree submodule/`pnpm install` setup, matching the same gap noted in 10-01/10-02/10-03's SUMMARYs)
- **Started:** 2026-09-28T09:20:00-05:00 (approx.)
- **Completed:** 2026-09-28T09:42:04-05:00
- **Tasks:** 3
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- Extended `src/client/__tests__/founding-create.test.ts` from 6 to 14 tests, proving: D-13's duplicate-invitee refusal happens before any KeyPackage material is burned (zero gift wraps, zero commit events); FOUND-02's tampered-signature refusal reaches through the public `create()` API and leaves no local group; D-12/FOUND-04's partial-failure semantics (canonical state reaches epoch 1 with all members regardless of Welcome delivery outcome); `retryWelcome()`'s three documented behaviors (re-delivers exactly the failed recipient, throws on an unknown pubkey, no-ops on an already-succeeded one); R-04's accepted silent-loss window (a group reloaded from the same store reports zero pending Welcomes even though one was never delivered); D-09/R-05's relay-less consequence; and the founding commit's fork-tree node binding to a configured rewind store.
- Created `src/__tests__/integration/founding-group-create-join-message.test.ts`, the FOUND-05 positive control: an admin founding-creates a group with two invitees and relays; zero kind-445 events are ever published for the founding Add; both invitees independently join from their own Welcome at epoch 1; each sees the creator **and** the other invitee as a member (the strongest available proof that one founding Add carried both invitees, not two sequential commits); the first invitee messages the admin and the admin messages the second invitee, both decrypted correctly; each invitee's consumed KeyPackage is marked used on its own client.
- Updated `docs/client/marmot-client.md` ("Creating a New Group" — corrected the group-event-published claim to the empty-epoch-0-publication-obligation fact; new "Founding creation with initial invitees" section) and `docs/client/marmot-group.md` (new "Founding Welcome delivery and retry" section covering `welcomeDeliveries`/`pendingWelcomes`/`retryWelcome()`), both stating the verified — not originally-predicted — relay-less behavior and the fresh-KeyPackage recovery path.
- **Discovered and documented a discrepancy** between CONTEXT.md/RESEARCH.md's D-09 analysis and the actual implementation: `createWelcomeRumor()` unconditionally requires a non-empty `relays` tag, so a relay-less founding create's Welcome delivery fails for **every** invitee (not just invitees lacking their own NIP-65 inbox relays, as the phase's planning documents predicted). Tests and docs were written to the verified behavior; logged in a new `deferred-items.md` rather than silently "fixed" in the plan text.

## Task Commits

1. **Task 1: Behavioural matrix — refusals, partial failure, retry, non-durability, relay-less, tree persistence** - `ffa9c6b` (test)
2. **Task 2: FOUND-05 end-to-end positive control** - `afc169a` (test)
3. **Task 3: Downstream docs for the accepted caveats** - `e66434d` (docs)

## Files Created/Modified

- `src/client/__tests__/founding-create.test.ts` - Extended with 8 new tests (D-13, FOUND-02, D-12/FOUND-04, R-04, D-09/R-05, fork-tree persistence); no plan-10-03 test deleted or weakened.
- `src/__tests__/integration/founding-group-create-join-message.test.ts` - New FOUND-05 positive-control integration test.
- `docs/client/marmot-client.md` - Corrected "Creating a New Group"; added "Founding creation with initial invitees".
- `docs/client/marmot-group.md` - Added "Founding Welcome delivery and retry".
- `.planning/phases/10-founding-group-creation-via-welcome/deferred-items.md` - New: logs the pre-existing `pnpm lint` drift (plan 10-02, 3 files) and the D-09/R-05 discrepancy.

## Decisions Made

- See `key-decisions` in the frontmatter above for the four substantive decisions made while writing this plan's tests (relay-supplied vs. relay-less forced-failure design, the FOUND-02 tamper-test `verifiedSymbol` fix, dropping the cross-signer decrypt-failure assertion, and logging rather than fixing the pre-existing lint drift).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug in test design] `verifiedSymbol` caching defeated the FOUND-02 tampered-signature test**
- **Found during:** Task 1, Test 8
- **Issue:** A plain object spread (`{ ...invitee1Event, sig: tamperedSig }`) copies own enumerable Symbol-keyed properties too, including nostr-tools' cached `verifiedSymbol` result set on the original event when it was first published/verified. `verifyEvent()` short-circuits on that cached `true`, so the tampered clone was accepted instead of rejected.
- **Fix:** Explicitly `delete tamperedEvent[verifiedSymbol]` before passing it to `create()`, forcing a real re-verification against the tampered signature.
- **Files modified:** `src/client/__tests__/founding-create.test.ts`
- **Verification:** Test 8 now genuinely exercises the SEC-01 signature gate and passes for the correct reason (verified by first observing it pass for the WRONG reason — a stale cached `true` — then confirming the fix by re-running and inspecting the assertion path).
- **Committed in:** `ffa9c6b` (Task 1 commit)

**2. [Rule 1 - Bug in test design] Throw-based per-recipient inbox-lookup failure silently succeeded via the group-relay fallback**
- **Found during:** Task 1, Tests 9-12 design
- **Issue:** The originally-planned helper made the failing invitee's `getUserInboxRelays()` throw with no `relays` supplied to `create()`. Empirically this produced **both** invitees failing (with the "Welcome rumor requires a non-empty relays tag" error) rather than the intended one-succeeds-one-fails split, because `createWelcomeRumor()` throws before delivery is even attempted when the founding group has no relays.
- **Fix:** Redesigned the helper to supply `relays: RELAYS` and make the failing invitee's `getUserInboxRelays()` resolve to `[]` (not throw) — `deliver()`'s catch-based group-relay fallback only triggers on a throw, not on an empty resolved array, so this produces a genuine, isolated per-recipient "No relays available" failure while the group relays keep `createWelcomeRumor()` satisfied for both.
- **Files modified:** `src/client/__tests__/founding-create.test.ts`
- **Verification:** Confirmed via a throwaway debug harness before and after the fix; Tests 9-12 pass with the intended one-succeeds-one-fails split.
- **Committed in:** `ffa9c6b` (Task 1 commit)

**3. [Rule 1 - Bug in test design] Cross-signer gift-wrap decrypt-failure assertion was unreliable and dropped**
- **Found during:** Task 2
- **Issue:** A planned assertion that unwrapping invitee1's gift wrap with invitee2's signer rejects instead resolved successfully with the correctly-decrypted rumor. Root cause (confirmed via a throwaway debug test): applesauce's `unlockGiftWrap()`/`getSealRumor()` cache the decrypted rumor on the event object itself once unlocked by any caller with the right key, and `MockNetwork` shares object references in-process (not serializing bytes over a wire) — the gift-wrap event was already unlocked (by the creator's own encryption round-trip, which retains the plaintext it just encrypted) before any test code touched it, so a subsequent call with any signer just returns the cached rumor.
- **Fix:** Removed the cross-signer negative assertion; kept the `p`-tag addressing check (each gift wrap names exactly one intended recipient) and the correct-signer round-trip + `e`-tag match, matching the scope of the existing `end-to-end-invite-join-message.test.ts` analog, which never attempted a cross-signer check either.
- **Files modified:** `src/__tests__/integration/founding-group-create-join-message.test.ts`
- **Verification:** Test passes; the addressing and round-trip checks still positively prove "addressed to that invitee."
- **Committed in:** `afc169a` (Task 2 commit)

**4. [Rule 3 - out-of-scope, logged not fixed] Pre-existing `pnpm lint` (Prettier) drift in 3 unrelated files**
- **Found during:** Task 3, `pnpm lint` acceptance check
- **Issue:** `pnpm lint` fails on `src/client/runtime/group-runtime.ts` and two of its test files — all three touched by plan 10-02, not by this plan, and `git diff HEAD` on each is empty (the drift is baked into the last commit that touched them).
- **Fix:** None applied — this plan is declared test-and-docs-only and these are neither declared test files nor docs. A stray `pnpm format` (run once, whole-repo, to format this plan's own new files) touched these three files as a side effect; reverted with `git checkout --` for each before committing, then logged the drift to `.planning/phases/10-founding-group-creation-via-welcome/deferred-items.md` with the recommended one-command fix (`pnpm format`) for a future housekeeping commit.
- **Files modified:** None (reverted the inadvertent touch)
- **Verification:** `pnpm exec prettier --check` on all four files this plan actually touches is clean; the phase-level `pnpm lint` gate remains blocked on the pre-existing files until a follow-up formats them.
- **Committed in:** N/A (not fixed here; logged in `e66434d`'s `deferred-items.md`)

---

**Total deviations:** 4 (3 auto-fixed test-design bugs under Rule 1, 1 logged-not-fixed pre-existing issue under the scope boundary rule).
**Impact on plan:** All three test-design fixes were necessary for the tests to actually exercise the claims they name — an unfixed version would have been a false-passing test (accepting a tampered signature, missing a genuine partial-failure split, or asserting a cryptographic property this harness cannot observe). The logged (not fixed) lint drift and the D-09/R-05 discrepancy are both flagged prominently for the orchestrator; neither blocks this plan's own deliverables, but the D-09/R-05 finding may warrant a decision revisit in a later phase (see `deferred-items.md`).

## Known Stubs

None.

## Threat Flags

None — this plan added no new files or surface beyond tests and docs; the threat register's dispositions (T-10-19..T-10-24) are all addressed by tests already covered under `coverage` above.

## Issues Encountered

- This worktree was created without the `ts-mls`, `refs/marmot`, and `refs/mdk` git submodules checked out — the same one-time environment gap noted in every prior plan's SUMMARY for its own worktree (10-01, 10-02, 10-03). Ran `git submodule update --init ts-mls refs/mdk refs/marmot` and `pnpm install --frozen-lockfile` before starting Task 1. Not a plan deviation — no code changes required.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 10 (founding-group-creation-via-welcome) is now fully covered: FOUND-01 through FOUND-05 all have executable proof, the positive control exists, and the accepted-cost decisions (D-04, D-09, D-10, D-12) are each pinned by a test and documented for downstream apps.
- Full suite green: 115 test files / 1281 tests. `pnpm compile` exits 0. `pnpm exec tsc -p tsconfig.json --noEmit` exits 0. `pnpm docs:build` exits 0.
- `git diff --stat` against the plan's base commit shows only test and docs files changed — no production source touched.
- **Two items need follow-up beyond this plan's scope**, both logged in `deferred-items.md`:
  1. A pre-existing `pnpm lint` failure in 3 files from plan 10-02 (one-command fix: `pnpm format`).
  2. The D-09/R-05 discrepancy: a relay-less founding create's Welcome delivery fails for every invitee (not a partial subset as CONTEXT.md/RESEARCH.md predicted). This is documented as the verified behavior, not fixed in production code (test-and-docs-only scope) — a future phase may want to revisit whether `GroupFactory.create()` should fail fast when `invitees` is supplied without `relays`, rather than silently producing a group whose founding Welcomes are all guaranteed to fail.
- No blockers for phase completion.

---
*Phase: 10-founding-group-creation-via-welcome*
*Completed: 2026-09-28*

## Self-Check: PASSED

- FOUND: src/client/__tests__/founding-create.test.ts
- FOUND: src/__tests__/integration/founding-group-create-join-message.test.ts
- FOUND: docs/client/marmot-client.md
- FOUND: docs/client/marmot-group.md
- FOUND: .planning/phases/10-founding-group-creation-via-welcome/deferred-items.md
- FOUND commit: ffa9c6b
- FOUND commit: afc169a
- FOUND commit: e66434d
