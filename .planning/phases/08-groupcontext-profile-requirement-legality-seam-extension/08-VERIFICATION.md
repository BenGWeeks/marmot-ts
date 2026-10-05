---
phase: 08-groupcontext-profile-requirement-legality-seam-extension
verified: 2026-10-05T15:40:00Z
status: passed
score: 4/4 roadmap success criteria verified (27/27 plan must-have truths; 2 superseded by later deliberate changes)
behavior_unverified: 0
overrides_applied: 0
re_verification: false
warnings:
  - id: W-01
    item: "Review-fix commits 56c5972 (WR-01), d269628 (WR-02), c9c2e7a (WR-03) have no regression tests"
    classification: "test debt, not a gap. None of the three is a Phase 8 must-have, and the code was inspected at HEAD."
  - id: W-02
    item: "Stale test titles in account-identity-proof-seams.test.ts: the tree-fed rows are named 'abandons the switch, tip unchanged', but the drop-requirement row now asserts adoption of the legal prefix (sib1)"
    classification: "cosmetic. The assertions are correct and stronger than the titles."
  - id: W-03
    item: "Line references in the milestone audit's integration trace are partly wrong: group-engine.ts:2305 is the pooled-envelope sweep against retained fork nodes, not tree-fed convergence. Tree-fed convergence reaches validateCommitLegality through resolveCandidateParent (group-engine.ts:3568 -> fork-recovery.ts:350/409)."
    classification: "documentation accuracy only. Both seams are wired and tested."
---

# Phase 8: GroupContext Profile Requirement & Legality-Seam Extension Verification Report

**Phase Goal:** Every group requires the `0x8009` profile in its GroupContext, and that requirement is enforced identically across group creation, invite, join, inbound ingest and convergence. This closes the codebase's recurring seam-asymmetry defect class before any seam-local work begins.
**Verified:** 2026-10-05T15:40:00Z
**Status:** passed
**Re-verification:** No. This is the initial verification; the v2.0 milestone audit flagged it as missing.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A newly created group's GroupContext required-component list includes `0x8009`, with no GroupContext-level state stored for it (GRP-01) | VERIFIED | `DEFAULT_GROUP_COMPONENT_IDS` (src/core/components/ids.ts:74) includes `ACCOUNT_IDENTITY_PROOF_COMPONENT_ID`. `createGroup` (src/core/group.ts:65-77) always unions the defaults into `appComponentsEntry`, so a caller's `requiredComponentIds` cannot drop it. `marmotRequiredCapabilitiesExtension` (src/core/capabilities.ts:99) lists only `0x0006` and never `0x8009`. The client path `group-factory.ts:200` uses `createSimpleGroup`, which calls `createGroup`. Test `group.test.ts` "GRP-01: …" asserts `0x8009` is in `app_components`, has no component data, and is absent from `required_capabilities` (as is `0xf2f1`), and that `getGroupProfileSupport` reports `supported`. The test passes. |
| 2 | A commit that drops the `0x8009` requirement, or produces a member leaf without valid `0x8009` support and proof, is rejected identically on send, inbound ingest, pool replay/fork recovery and tree-fed convergence (GRP-02) | VERIFIED | **Central check:** `validateCommitLegality` (integrity.ts:811) calls `validateCommitAccountIdentityProofs` (integrity.ts:445). That function runs a profile check on the parent and on the result via `getGroupProfileSupport`, then runs `diffChangedLeaves` and calls `validateLeafAccountIdentityProof` on every changed leaf. The order is component-integrity, then proof, then disband, then admin-leaf coupling. The function never throws. **Call sites, re-traced:** send `#assertStagedCommitLegal` (group-engine.ts:1711); inbound (ingest.ts:835); fork-recovery `resolveCandidateParent` on the known-child path (fork-recovery.ts:350) and the replay path (fork-recovery.ts:409), which is shared by pool replay (fork-recovery.ts:657) and tree-fed `#treeResolution` (group-engine.ts:3568); pooled-envelope sweep against fork nodes (group-engine.ts:2305). Pre-apply Add rejections carry the same label on every seam through `validatePreApplyProposals`: send at group-engine.ts:1521/1554, inbound at ingest.ts:807, replay at fork-recovery.ts:402, sweep at group-engine.ts:2281. **Tests:** `account-identity-proof-seams.test.ts` has 18 rows covering 3 invalid fixtures × 4 seams plus controls. Each row projects `{reason, proofReason, leafIndex}` and asserts `toEqual` against one shared expected verdict per fixture. All 18 pass. |
| 3 | Joining via Welcome fails when the group does not require `0x8009` or any current member's proof is invalid (GRP-03) | VERIFIED | `groups-manager.ts:721-727` calls `assertCurrentGroupAccountIdentityProofProfile` and `validateGroupMemberAccountIdentityProofs`, which validates every member leaf. Both run before `adoptClientState` (line 729), and `joinGroup` before them is pure, so a rejected join persists nothing. Tests in `join-account-identity-proof.test.ts` (5/5 pass) cover: missing requirement, invalid non-creator member proof, mixed `0xf2f1`+`0x8009` profile, a creator proof bound to a different signature key, all "without persisting", and a positive control. |
| 4 | Inviting a user, and admin-policy admission of a standalone Add proposal, both validate the invitee's `0x8009` proof before the proposal is created or queued (GRP-04) | VERIFIED | **Invite:** `proposeInviteUser` (invite-user.ts:22) calls `validateKeyPackageAccountIdentityProof` before returning the Add. The commit path also re-checks by-value Adds (group-engine.ts:1521). **Raw proposal intent:** `send({kind:"proposal"})` validates the Add KeyPackage before `createProposal` (group-engine.ts:1003-1009). **Inbound standalone:** `createAdminCommitPolicyCallback`'s `incoming.kind === "proposal"` branch (admin-policy.ts:288-302) rejects through `validatePreApplyProposals`, which calls `validateAddProposalAccountIdentityProofs` first (admin-policy.ts:183). The ingest proposal branch (ingest.ts:620-650) yields `rejected` with `account-identity-proof` and the `proofReason`, and never stages the proposal. The commit branch (admin-policy.ts:307) validates every Add with no "skip if no proof material" path; the D-08 gap is closed. **Tests:** invite.test.ts GRP-04 (3 rows) and standalone-add-admission.test.ts (7 rows). These cover a raw intent, an Add inside a commit, an inbound forged Add that is not queued (`unappliedProposals` length 0, audit `account_identity_proof`), a valid Add that is still staged, D-05 labeling, WR-04 (an unreadable group view) and WR-05. All pass. |

**Score:** 4/4 roadmap truths verified (0 present-but-behavior-unverified)

### Plan must-have truths (merged from 08-01..08-04 frontmatter)

| Plan | Truths | Status | Notes |
|------|--------|--------|-------|
| 08-01 | 10 (D-01..D-07, Add helper, GRP-01, GRP-03) | 10/10 VERIFIED | **D-03 superseded:** Phase 9 (UPD-01) later added the identity-equality check for replacement leaves (integrity.ts:515-560), so "no comparison against the member's prior leaf" no longer holds. This was a planned extension, not a regression. D-07 order was confirmed in code (integrity.ts:847-905). |
| 08-02 | 6 (D-05, D-08, D-09 inbound/local, D-10, GRP-04) | 6/6 VERIFIED | **D-10** (Update admission deferred) was likewise extended by Phase 9 UPD-04 as planned. |
| 08-03 | 6 (D-11 load/out/in/destroy, D-12, supported control) | 6/6 VERIFIED | `UnsupportedGroupProfileError`, the `profileSupport` getters (marmot-group.ts:575 → session → engine), and the registry `track()` skip (group-registry.ts:321-334) are in place. The `destroy()` guidance is in docs/client/best-practices.md:78. Tests: `unsupported-profile.test.ts` 11/11 and `unsupported-profile-groups.test.ts` 7/7. |
| 08-04 | 5 (3 fixture rows, per-seam disposition, Pitfall 3 control) | 5/5 VERIFIED | **Superseded wording:** "tree-fed abandons the switch and keeps the tip". After review round 2 (WR-02, matching MDK), the illegal link is still never adopted, but its legal prefix is now a scored candidate. The drop-requirement row therefore asserts adoption of sib1 and that sib2 was not adopted. The invariant that the illegal commit is never adopted is still asserted. A legal-branch control row exists. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/core/components/tree-diff.ts` | `diffChangedLeaves` | VERIFIED | Exported. Imported and called at integrity.ts:478. tree-diff.test.ts 6/6. |
| `src/core/components/integrity.ts` | Proof-extended `validateCommitLegality`, Add helper | VERIFIED | Substantive and wired at all seams listed above. integrity.test.ts 62/62. |
| `src/core/components/account-identity-proof.ts` | `getGroupProfileSupport` | VERIFIED | Line 732. Non-throwing wrapper over `assertCurrentGroupAccountIdentityProofProfile`. |
| `src/__tests__/helpers/account-identity-proof-fixtures.ts` | `forgeKeyPackage`, `dropAccountIdentityProofRequirement` | VERIFIED | Used by the seam and admission tests. |
| `src/engine/types.ts` | `account-identity-proof` reject reason, `unsupported-profile` skip reason | VERIFIED | Compiles; consumed by ingest results asserted in tests. |
| `src/engine/admin-policy.ts` | Add-proof admission for commits and standalone proposals | VERIFIED | `validatePreApplyProposals` → `validateAddProposalAccountIdentityProofs`. |
| `src/engine/ingest.ts` | Proposal admission and labeling | VERIFIED | ingest.ts:620-650 and 807-830. |
| `src/engine/fork-recovery.ts` | `ParentResolution.rejected.violation` | VERIFIED | fork-recovery.ts:360-375 and 398-425. |
| `src/engine/group-engine.ts` | Local Add validation, pre-`createCommit` check, sweep admission, `UnsupportedGroupProfileError` | VERIFIED | All present (see line references above). |
| `src/engine/__tests__/standalone-add-admission.test.ts` | GRP-04 engine tests | VERIFIED | 7/7 pass. |
| `src/client/__tests__/unsupported-profile-groups.test.ts` | D-11 tests | VERIFIED | 7/7 pass. |
| `src/__tests__/helpers/engine-seam-fixtures.ts` | Seam fixtures, `edgeFromReplay` | VERIFIED | Used by the seam-parity matrix. |
| `src/engine/__tests__/account-identity-proof-seams.test.ts` | GRP-02 matrix | VERIFIED | 18/18 pass. |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| integrity.ts | tree-diff.ts | `diffChangedLeaves(` at integrity.ts:478 | WIRED |
| integrity.ts | account-identity-proof.ts | `getGroupProfileSupport(` (450, 464), `validateLeafAccountIdentityProof(` (489), `validateKeyPackageAccountIdentityProof(` (615) | WIRED |
| `validateCommitLegality` | `validateCommitAccountIdentityProofs` | integrity.ts:860, between integrity and disband checks | WIRED |
| admin-policy.ts | integrity.ts | `validateAddProposalAccountIdentityProofs(` at admin-policy.ts:183, used by both callback branches | WIRED |
| group-engine.ts `case "proposal"` | account-identity-proof.ts | `validateKeyPackageAccountIdentityProof(` at group-engine.ts:1006 | WIRED |
| send / ingest / fork-recovery / sweep / tree-fed | `validateCommitLegality` | group-engine.ts:1711, ingest.ts:835, fork-recovery.ts:350/409, group-engine.ts:2305; tree-fed via group-engine.ts:3568 → `resolveCandidateParent` | WIRED |
| groups-manager.ts join | profile and member-proof validators | groups-manager.ts:721-727, before `adoptClientState` at :729 | WIRED |
| group-registry.ts | marmot-group.ts | `profileSupport.kind` at group-registry.ts:321 | WIRED |
| marmot-group.ts | group-session.ts | `session.profileSupport` at marmot-group.ts:576 | WIRED |

### Data-Flow Trace (Level 4)

Not applicable. This is a library protocol-enforcement phase with no rendered dynamic data. Verdict propagation (violation → `rejected` result → audit reason) was checked through the test assertions, which use the audit `account_identity_proof` reason and the projected `{reason, proofReason, leafIndex}`.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| GRP-01..04 and D-11 test files (15 files) | `pnpm vitest run src/core/__tests__/group.test.ts src/client/__tests__/join-account-identity-proof.test.ts src/engine/__tests__/account-identity-proof-seams.test.ts src/engine/__tests__/standalone-add-admission.test.ts src/client/group/__tests__/invite.test.ts src/core/components/__tests__/{integrity,tree-diff,account-identity-proof}.test.ts src/engine/__tests__/{unsupported-profile,group-engine,commit-legality-seams,outbound-payload-gate,pre-apply-batch-validation,send-commit-legality}.test.ts src/client/__tests__/unsupported-profile-groups.test.ts` | 15 files, 273 tests passed | PASS |
| Typecheck including tests | `npx tsc --noEmit -p tsconfig.json` | exit 0 | PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` exist, and no Phase 8 PLAN or SUMMARY declares a probe. Skipped.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| GRP-01 | 08-01 | New group requires `0x8009` in `app_components` (not `required_capabilities`) and holds no GroupContext state for it | SATISFIED | Truth 1 |
| GRP-02 | 08-01, 08-02, 08-04 | A commit that drops `0x8009` or yields a leaf with an invalid proof is rejected identically on send, ingest, replay/fork recovery and tree-fed convergence | SATISFIED | Truth 2 |
| GRP-03 | 08-01 | Welcome join fails when `0x8009` is not required or any member's proof is invalid | SATISFIED | Truth 3 |
| GRP-04 | 08-02 | Invite and standalone-Add admission validate the invitee's `0x8009` proof before proposing or queuing | SATISFIED | Truth 4 |

No orphaned requirements. REQUIREMENTS.md maps only GRP-01..04 to Phase 8, and all four are claimed by plans.

### Anti-Patterns Found

Scanned the 37 `src/` files touched by Phase 8 commits:

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | | `TBD` / `FIXME` / `XXX` | | No debt markers |
| (none) | | `TODO` / `HACK` / `PLACEHOLDER` | | None found |

### Findings (warnings, not gaps)

**W-01: review fixes WR-01, WR-02 and WR-03 ship without regression tests.** I confirmed at HEAD that all three fixes are still present and inspected each diff:

- **WR-01** (`56c5972`, group-engine.ts:1994-2007, 2496-2532): wraps the auto-commit in try/catch, adds an early return while a disband request is pending, and reads the admin set through `getAdminPolicy` only. The logic is sound.
- **WR-02** (`d269628`, group-session.ts:488-500): `#persistSelectedDisbandIfPossible` returns early when there is no lifecycle store or a tombstone already exists, and routes failures to `#onHistoryError`. The logic is sound. The public `persistSelectedDisband` still throws as before.
- **WR-03** (`c9c2e7a`, group-engine.ts:3352, 3366-3370): drops a legal-prefix candidate that lies on the current tip's path. The logic is sound.

A grep of `src/**/*.test.ts` finds no test exercising any of these paths. The `WR-0n` tags that do appear in tests belong to earlier review rounds.

My call: **not a gap.** None of the three is a Phase 8 must-have or touches the `0x8009` enforcement in GRP-01..04. They harden adjacent self-remove, disband-persistence and branch-selection code found during review. The fixer documented why the fixtures are hard to build (WR-03 needs witness or policy tuning to make an ancestor win). These are cleanup and selection invariants that presence checks cannot prove, so they remain test debt. I recommend a follow-up backlog item for discriminating regression rows, verified by mutation as was done for WR-07. If the developer prefers, they can be promoted to `human_verification` items, which would change the status to `human_needed`.

**W-02: stale test titles.** In account-identity-proof-seams.test.ts, the tree-fed row for the drop-requirement fixture is titled "abandons the switch, tip unchanged", but it asserts adoption of the legal prefix (sib1) and that the illegal sib2 was not adopted. The assertions are correct; only the titles are misleading.

**W-03: audit trace line references.** The milestone audit described group-engine.ts:2305 as "the tree-fed sweep". It is actually the pooled-envelope sweep against retained fork nodes, added by CR-01. Tree-fed convergence (`reconvergeFromHistory` → `#treeResolution`) reaches `validateCommitLegality` through `resolveCandidateParent` at group-engine.ts:3568. Both seams are wired and covered: there is a "pool sweep" row and "tree-fed" rows. The audit's admin-policy reference (~255-295) is slightly off; the proposal branch is at admin-policy.ts:288-302.

**Residual (from 08-REVIEW-FIX CR-01, already in the audit):** `0x8002` blossom-image and `0x8008`/`0x800b` media payloads are accepted as opaque. This is more permissive than MDK and outside the GRP-01..04 scope.

### Human Verification Required

None needed for the phase goal. See W-01 for the optional promotion of WR-01..03.

### Gaps Summary

No gaps. Every roadmap success criterion is implemented in the shared `validateCommitLegality` adapter, plus the seam-local admission points that cannot be centralized: the invite path, the local proposal intent, the inbound standalone-proposal callback, and Welcome join. Each is wired at every seam, and passing tests assert one identical projected verdict per invalid fixture across send, inbound, replay and tree-fed. The two plan truths whose wording no longer matches the code (08-01 D-03, 08-04 "keeps the tip") were superseded by deliberate, documented later changes (Phase 9 UPD-01, and review round 2 WR-02 matching MDK). Neither weakens the GRP-02 invariant.

---

_Verified: 2026-10-05T15:40:00Z_
_Verifier: Claude (gsd-verifier)_
