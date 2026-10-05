---
phase: 10-founding-group-creation-via-welcome
plan: 05
subsystem: client
tags: [gap-closure, cr-01, founding-create, fail-closed, relays, mls]

# Dependency graph
requires:
  - phase: 10-founding-group-creation-via-welcome
    provides: "GroupFactory.create() founding orchestration (D-01..D-13), NostrWelcomeDelivery.deliverMany(), and the 10-VERIFICATION.md CR-01 gap report this plan closes"
provides:
  - "Fail-closed relay guard (assertFoundingInviteeRelays) as the first statement of GroupFactory.create()"
  - "Corrected in-source JSDoc (CreateGroupOptions.invitees, create(), deliverFoundingWelcomes(), retryWelcome()) matching the verified fail-closed behaviour"
  - "Rewritten Test 13 (six relay-shape refusal matrix, zero-trace assertions) and new Test 15 (solo relay-less create still allowed)"
  - "Corrected docs/client/marmot-client.md fail-closed bullet, replacing the disproven recovery-path claim"
  - "D-09/R-05 supersession record in 10-CONTEXT.md, original decision text retained per user directive"
affects: [11-interop-qa-gate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-private synchronous precondition guard as the literal first statement of a public async method, before any await — enforces fail-closed-before-any-side-effect for founding creation"

key-files:
  created: []
  modified:
    - src/client/group-factory.ts
    - src/client/group/marmot-group.ts
    - src/client/__tests__/founding-create.test.ts
    - docs/client/marmot-client.md
    - .planning/phases/10-founding-group-creation-via-welcome/10-CONTEXT.md

key-decisions:
  - "CR-01 reverses D-09 per the user's 2026-09-28 locked decision: founding create with invitees and no valid relays now fails closed instead of producing a permanently unusable group with phantom members"
  - "Duplicate relays are not rejected by the new guard — encodeNostrRoutingV1 already dedupes them and MarmotGroup.relays reads back from the deduped component, so duplicates cannot reproduce the Welcome failure this guard exists to prevent"
  - "D-09 and R-05 are annotated SUPERSEDED in 10-CONTEXT.md rather than deleted, keeping the original decision text visible as history per the user's directive"

patterns-established:
  - "FOUNDING_RELAYS_REQUIRED base-message const referenced at both throw sites so the literal error text exists exactly once in the file"

requirements-completed: [FOUND-01, FOUND-05]

coverage:
  - id: D1
    description: "GroupFactory.create() throws before any MLS state, key material, store write, tracking, or publish when invitees is non-empty and relays is absent, empty, or contains an invalid relay URL"
    requirement: "FOUND-01"
    verification:
      - kind: unit
        ref: "src/client/__tests__/founding-create.test.ts#Test 13 (CR-01; supersedes D-09/R-05): a founding create with invitees but no valid group relays throws before any MLS state is created, and nothing is persisted, tracked or published"
        status: pass
    human_judgment: false
  - id: D2
    description: "A solo create (invitees omitted or empty) without relays is still allowed and stays at epoch 0"
    requirement: "FOUND-01"
    verification:
      - kind: unit
        ref: "src/client/__tests__/founding-create.test.ts#Test 15 (CR-01 scope): a solo create without relays — invitees omitted or empty — is still allowed and stays at epoch 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "The founding happy path with relays (FOUND-01, FOUND-05) is unchanged by the new guard"
    requirement: "FOUND-05"
    verification:
      - kind: unit
        ref: "src/client/__tests__/founding-create.test.ts (Tests 1-12, 14)"
        status: pass
      - kind: integration
        ref: "src/__tests__/integration/founding-group-create-join-message.test.ts#FOUND-05: founding group creation, joining, and first message (positive control)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Source JSDoc, test header, published docs, and 10-CONTEXT.md all agree on the fail-closed behaviour; D-09/R-05's original text survives as history"
    requirement: "FOUND-01"
    verification:
      - kind: other
        ref: "acceptance-criteria greps from 10-05-PLAN.md Task 1/Task 2 (all pass — see below)"
        status: pass
    human_judgment: false

duration: 9min
completed: 2026-09-28
status: complete
---

# Phase 10 Plan 05: Fail-Closed Founding-Create Relay Guard (CR-01) Summary

**GroupFactory.create() now throws a synchronous, module-private `assertFoundingInviteeRelays()` guard before any MLS state, key material, store write, tracking, or publish when a founding create supplies invitees without a valid relay list — reversing D-09 per the user's 2026-09-28 locked decision.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-09-28T15:50:59Z
- **Completed:** 2026-09-28T16:00:22Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added a fail-closed relay guard (`assertFoundingInviteeRelays`) as the literal first statement of `GroupFactory.create()`, ahead of ciphersuite resolution, signer calls, KeyPackage generation, MLS state construction, and store writes. Every relay is validated with the existing `isValidRelayUrl` helper; the guard applies only when `invitees` is non-empty, so solo creation is unaffected.
- Rewrote Test 13 into a six-shape refusal matrix (relay option omitted, `[]`, `[""]`, a valid https URL, an unparseable string, and a mixed valid/empty list) and proved the refusal is total: `signEvent` was never called, the store holds zero keys, `groups.loaded` is empty, `groups.listIds()` resolves empty, no `created` event fired, and zero gift wraps or group events were published.
- Added Test 15 pinning that a solo create — `invitees` omitted or an empty array — is still allowed and stays at epoch 0 with no publish traffic, so the guard's scope boundary is explicitly tested, not just implied.
- Corrected all four stale in-source JSDoc blocks (`CreateGroupOptions.invitees`, `create()`, `deliverFoundingWelcomes()`, `retryWelcome()`) and the published `docs/client/marmot-client.md` bullet to describe the fail-closed behaviour instead of the disproven NIP-65-inbox-fallback recovery path.
- Recorded D-09 and R-05 as `SUPERSEDED (2026-09-28, gap closure — fail closed, see 10-VERIFICATION.md CR-01)` in `10-CONTEXT.md`, retaining every original decision paragraph verbatim under an explicit "Original decision text (retained for history)" marker, per the user's directive to annotate rather than delete decision history.

## Task Commits

Each task was committed atomically:

1. **Task 1: Fail-closed relay guard in GroupFactory.create, corrected JSDoc, and rewritten Test 13 + new Test 15** - `b7e0ee2` (fix)
2. **Task 2: Correct the published docs and record the D-09/R-05 supersession in 10-CONTEXT.md** - `ed3205a` (docs)

_Note: this plan's tasks are not TDD-tagged (`tdd` attribute absent from frontmatter); the behavior/action/verify structure was followed but only two commits resulted, matching the plan's `<tasks>` count._

## Files Created/Modified

- `src/client/group-factory.ts` - Added `isValidRelayUrl` import, module-private `FOUNDING_RELAYS_REQUIRED` const + `assertFoundingInviteeRelays()` guard called first in `create()`, corrected `CreateGroupOptions.invitees` and `create()` JSDoc
- `src/client/group/marmot-group.ts` - Corrected `deliverFoundingWelcomes()` and `retryWelcome()` JSDoc to cite CR-01 instead of the disproven D-09/R-05 inbox-fallback claim
- `src/client/__tests__/founding-create.test.ts` - Rewrote Test 13 (fail-closed refusal matrix), added Test 15 (solo relay-less scope pin), updated header docstring, describe title, and the `createFoundingWithSecondInviteeUnreachable` docstring's CR-01 pointer; removed the now-unused `application-message.js` import; added `vi` to the vitest import
- `docs/client/marmot-client.md` - Replaced the "Always supply relays..." consequence bullet with a fail-closed bullet describing the throw-before-any-side-effect behaviour and the solo-create exception
- `.planning/phases/10-founding-group-creation-via-welcome/10-CONTEXT.md` - Annotated D-09 and R-05 as SUPERSEDED with a new "Superseding decision" paragraph; added trailing supersession annotations to the domain-section footgun bullet and the two `code_context` D-09 mentions

## Decisions Made

- **CR-01 reverses D-09** per the user's 2026-09-28 locked decision: a founding create with invitees and no valid group relays now fails closed, before any MLS state exists, instead of merging the founding Add and letting every Welcome fail inside `createWelcomeRumor()`.
- **Duplicate relays are deliberately not rejected** by the new guard — `encodeNostrRoutingV1` already dedupes them and `MarmotGroup.relays` is read back from that deduped component, so duplicate entries cannot reproduce the all-Welcomes-fail defect this guard exists to prevent. The stricter `validateRelay` checks (credentials, fragment, missing host, length) still run inside `createSimpleGroup`.
- **D-09/R-05 annotated, not deleted** — the original decision text (including the "Rejected: throwing at the call site..." line, which is exactly the alternative now adopted) is preserved verbatim in `10-CONTEXT.md` under an explicit "Original decision text (retained for history)" marker, so the decision history remains legible.

## Deviations from Plan

None - plan executed exactly as written. One formatting fix was needed during self-verification: two of the `SUPERSEDED (2026-09-28, gap closure — fail closed, see 10-VERIFICATION.md CR-01)` markers initially wrapped across a markdown line break in `10-CONTEXT.md`, which caused the acceptance-criteria grep (`grep -c` matches whole lines) to undercount. Reflowed both onto single lines before committing Task 2; no semantic content changed. Not logged as a Rule 1-3 deviation since it was caught and fixed before the task commit, not a post-commit correction.

## Issues Encountered

The worktree had no `node_modules` and an uninitialized `ts-mls` submodule. Ran `git submodule update --init ts-mls`, `pnpm install --frozen-lockfile`, and `pnpm --filter ts-mls build` before the first verification pass, per this plan's worktree build-note instructions. No other issues.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CR-01 is closed: `pnpm vitest run src/client/__tests__/founding-create.test.ts src/__tests__/integration/founding-group-create-join-message.test.ts src/client/group/__tests__/marmot-group.test.ts src/__tests__/groups-manager.test.ts` → 4 files, 51/51 tests passing. `pnpm compile` and `pnpm exec tsc -p tsconfig.json --noEmit` both exit 0. `pnpm exec prettier --check` on all five touched files passes.
- `git diff --stat src/core/ src/engine/ src/client/transport/` is empty — this plan touched no protocol, engine, or transport code, as the plan's verification block requires.
- CR-02 (`deliverMany()` misclassifies zero-ack Welcome publishes as succeeded) and CR-03 (the engine's public `foundingAdd` `SendIntent` has no epoch-0/sole-leaf/Add-only invocation guard) remain open — they are explicitly out of scope for this plan (10-05 covers CR-01 only) and are the responsibility of sibling plans 10-06 and 10-07, executed in parallel in the same wave.
- REQUIREMENTS.md still marks FOUND-02 and FOUND-04 as needing reopening per 10-VERIFICATION.md's recommendation; this plan does not touch FOUND-02/FOUND-04 scope (those trace to CR-02/CR-03, not CR-01) and defers their REQUIREMENTS.md status update to the orchestrator's post-wave consolidation.

## Self-Check: PASSED

- FOUND: src/client/group-factory.ts
- FOUND: .planning/phases/10-founding-group-creation-via-welcome/10-05-SUMMARY.md
- FOUND: b7e0ee2 (Task 1 commit)
- FOUND: ed3205a (Task 2 commit)

---

*Phase: 10-founding-group-creation-via-welcome*
*Plan: 05*
*Completed: 2026-09-28*
