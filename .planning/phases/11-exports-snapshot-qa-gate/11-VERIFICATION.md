---
phase: 11-exports-snapshot-qa-gate
verified: 2026-10-05T16:00:00Z
status: passed
score: 2/2 roadmap success criteria verified (plus all plan-level truths for 11-01/11-02/11-03)
behavior_unverified: 0
overrides_applied: 0
re_verification: false
gaps: []
hardening_followups:
  - id: WR-01
    note: "PUBLIC_SURFACES not tied to package.json exports; tarball smoke loads only ., ./mls, ./core"
  - id: WR-02
    note: "Name checks only run on top-level keys; LEGACY_EXPORT_NAME_PATTERN is case-sensitive"
  - id: WR-03
    note: "Type-only legacy exports (5 types) unguarded; type-level assertions not enforced in CI"
  - id: WR-04
    note: "smoke.mjs relies on hoisted @noble/curves and @noble/hashes"
  - id: WR-05
    note: "last_resort (0x000a) citations point at a spec file that specifies a different mechanism; pre-existing code divergence not tracked in backlog"
---

# Phase 11: Exports Snapshot & QA Gate Verification Report

**Phase Goal:** The `0x8009` cutover is verified against the full cross-runtime suite, and the public export surface reflects the removed legacy proof exports and the added envelope/component exports. The milestone is shippable.
**Verified:** 2026-10-05
**Status:** passed
**Re-verification:** No, initial verification

## Goal Achievement

### Observable Truths

| # | Truth (ROADMAP success criterion) | Status | Evidence |
|---|-----------------------------------|--------|----------|
| 1 | Full Vitest suite green on Node 20, 22, 24, Deno 2, Bun latest/1.1 | VERIFIED | I re-queried `gh run view 37328779021 --repo marmot-protocol/marmot-ts --json jobs`. Run conclusion is `success`, `headSha == c2f5a1201f3199655e17513e62a7b3392ef85b66`, and all six jobs are `success`: Test on Node.js 20.x, 22.x, 24.x, Deno v2.x, Bun latest, Bun 1.1. Build run 37328778947 (same SHA): `build`, `Package smoke (Node 20.x)` and `Package smoke (Node 24.x)` are all `success`. `git diff --name-only c2f5a12..HEAD` lists only `.planning/` files (11-03-SUMMARY.md, 11-REVIEW.md), so CI covers the code at HEAD. `git status` is clean. The SUMMARY also records local runs of 115 files / 1310 tests on Node 26, Deno 2.9.6 and Bun 1.3.14 with identical counts. I treated that as corroborating only. |
| 2 | `src/__tests__/exports.test.ts` reflects removed legacy proof exports and added envelope/component exports, with no stale `0xf2f1` outside the CUT-02 keep set | VERIFIED | See details below. |

**Score:** 2/2 truths verified, 0 behavior-unverified (neither truth asserts a state-transition or cleanup invariant).

#### Truth 2 details (checked in the code)

- **Snapshots exist for every public subpath.** `src/__tests__/exports.test.ts` has inline snapshots for `.`, `./client`, `./core`, `./engine`, `./extra`, `./utils`, `./audit`, `./extra/audit/node` and `./extra/audit/browser`. `package.json` `exports` has these plus `./mls` (deliberately excluded, since it re-exports ts-mls) and `./package.json`. Coverage is complete today.
- **The snapshots contain the added names.** `AUTHORIZATION_PROOF_LENGTH`, `AUTHORIZATION_PROOF_MAX_CREATED_AT`, `AuthorizationProofError`, `ACCOUNT_IDENTITY_PROOF_COMPONENT_ID` and `AccountIdentityProofError` each appear twice in the file (root and `./core` snapshots).
- **The snapshots contain none of the 15 removed names.** I grepped everything after the denylist definition (line 64 onward) and found 0 hits. The 15 names appear only in the frozen denylist, so the snapshots reflect the removal.
- **The guard works.** `pnpm vitest run src/__tests__/exports.test.ts` passed 20/20 locally. That includes the nine per-surface `findLegacyExportViolations` checks and the self-test that plants each violation kind plus a negative control.
- **`0xf2f1` inventory.** `grep -rl '0xf2f1' src docs README.md` returns exactly 14 paths. A case-insensitive search for `f2f1` or `61169` (also run over `scripts` and `examples`) matches the same 14. They are the CUT-02 keep set from 11-CONTEXT D-01: the private legacy constant and reject branches, negative-case tests, `docs/client/best-practices.md`, and `exports.test.ts` itself (the guard). No stale use presents `0xf2f1` as supported.
- **Other QA-05 hygiene.** `grep -rnE 'MIP-[0-9]{2}' src` returns 0. Skip/only/todo/skipIf/runIf in `src/**/*.test.ts` returns 0. No TODO/FIXME/TBD/XXX in `exports.test.ts` or `smoke.mjs`.

### Plan-level must-haves

| Plan | Truth | Status | Evidence |
|------|-------|--------|----------|
| 11-01 | D-01 dead pointers rewritten; live CUT-02 uses untouched | VERIFIED | 0 `../account-identity-proof.js` pointers remain per the SUMMARY audit. The 14-path keep set is intact, as shown above. |
| 11-01 | D-10 MIP-NN citations replaced | VERIFIED | 0 `MIP-NN` in `src/`. WR-05 notes that one citation family names a spec file that says something different. See the call below. |
| 11-02 | D-03 per-subpath inline snapshots (root byte-identical, `./mls` excluded) | VERIFIED | See details above. |
| 11-02 | D-02 guard plus non-vacuous self-test | VERIFIED | Present and passing. Residual limits are in the WR section. |
| 11-02 | D-04 reviewed snapshots hold the added names and none of the removed | VERIFIED | Grep results above. |
| 11-02 | D-06 smoke uses a real BIP-340 signer built from marmot-ts runtime deps | VERIFIED | `scripts/package-smoke/smoke.mjs` builds a signer from `@noble/curves` schnorr and `@noble/hashes` sha256, and calls `validateKeyPackageAccountIdentityProof`. CI `Package smoke (Node 20.x/24.x)` is green. |
| 11-03 | D-05/D-06 local gate and QA-04 CI | VERIFIED | CI re-queried, see Truth 1. Local counts come from the SUMMARY. |
| 11-03 | D-07 phase name in ROADMAP and STATE | ACCEPTED (caveat) | ROADMAP uses the title-case name. STATE.md uses the kebab-case slug. The orchestrator will fix it at phase completion, so it is not a gap. |
| 11-03 | D-08 lint, D-09 refs/mdk at 798a3e07 | VERIFIED (per SUMMARY and CI) | `pnpm lint` is clean in the SUMMARY. The CI `build` job is green. |
| 11-03 | Executor never pushed | VERIFIED (per SUMMARY) | The user pushed `c2f5a12`. The SUMMARY records a successful ancestry check of every Phase 11 commit. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/__tests__/exports.test.ts` | per-subpath snapshots, `findLegacyExportViolations`, self-test | VERIFIED | Substantive and green. It runs in every CI runtime. |
| `scripts/package-smoke/smoke.mjs` | real signer, proof validation | VERIFIED | Substantive. It is exercised by `run.sh` in CI on Node 20/24. |
| `11-03-SUMMARY.md` | CI evidence table | VERIFIED | The run IDs match what I re-queried. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Exports snapshot and guard | `pnpm vitest run src/__tests__/exports.test.ts` | 20/20 passed | PASS |
| CI jobs at c2f5a12 | `gh run view <id> --json jobs` for both runs | 9/9 success | PASS |
| HEAD is docs-only past the CI SHA | `git diff --name-only c2f5a12..HEAD \| grep -v '^.planning/'` | empty | PASS |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| QA-04 | 11-02, 11-03 | Full suite green on Node 20/22/24, Deno 2, Bun latest/1.1 | SATISFIED | CI Tests run 37328779021 and Build run 37328778947, all success at c2f5a12. |
| QA-05 | 11-01, 11-02, 11-03 | Exports snapshot reflects removed legacy and added envelope/component exports | SATISFIED | Truth 2 evidence above. |

Both IDs declared in the PLAN frontmatter appear in REQUIREMENTS.md and map to Phase 11. No orphaned requirements.

Housekeeping for the orchestrator: REQUIREMENTS.md still shows QA-04 and QA-05 as `[ ]` / Pending. ROADMAP.md shows "2/3 plans executed" and leaves 11-03 unchecked. Update these at phase completion.

### Anti-Patterns Found

None blocking. No debt markers in the phase's substantive files.

### Code Review Weighing (11-REVIEW.md, advisory)

I judged each warning against the success criteria as stated. None defeats a criterion. They are hardening follow-ups, except WR-05, which is a separate spec-conformance item that was already present before this phase.

| ID | Defeats SC1 or SC2? | Call |
|----|---------------------|------|
| WR-01 (surface list not tied to `package.json`; `dist` mapping untested; 7 of 10 subpaths not loaded from the tarball) | No | Hardening. SC2 concerns the exports snapshot reflecting the current surface, and today's 9 snapshotted surfaces equal the manifest's `exports` minus `./mls` and `./package.json` (I checked). The risk is future drift only. |
| WR-02 (name checks only run on top-level keys; pattern is case-sensitive, so `accountIdentityProofExtension` returns `false`) | No | Hardening. I confirmed the regex gap. The 15 removed names are matched exactly by the denylist, and the inline key-list snapshots fail on any re-added top-level name regardless of the pattern. The weakness is in the secondary guard (nested namespaces, unforeseen casing). |
| WR-03 (five legacy type names were exported historically; type-only exports unguarded; `expectTypeOf` is a runtime no-op in CI) | No | Hardening. SC2 is stated against the runtime snapshot. The self-test comment "no legacy type name ever existed" is factually wrong and should be corrected. A type-level check in CI is a worthwhile follow-up. |
| WR-04 (smoke relies on hoisted `@noble/*`) | No | Hardening. The smoke is green on Node 20/24 in CI and locally on Bun and Deno. The code comment overstates the guarantee, but this only matters if a dependency bump or a different install layout changes the hoisting. |
| WR-05 (rewritten `last_resort` citations name `foundation/key-packages.md`, which specifies the `app_data_dictionary` 0x0004 component rather than extension 0x000a) | No | Not a Phase 11 blocker. SC1 and SC2 do not concern it, and the code divergence predates the phase. D-10 made the citation precise but wrong. Reword the three comments to record the divergence and add a backlog item (CLAUDE.md: record divergences from the reference). |
| IN-01, IN-02 | No | Informational. Comment accuracy, and documenting the guard's scan limits. |

Recommended follow-up as one `/gsd-quick` or backlog item: WR-01 manifest-drift assertion plus smoke import of every subpath, WR-02 key checks and a case-insensitive pattern, WR-03 type-level CI step, WR-04 explicit `@noble` install in `run.sh`, WR-05 comment fix plus backlog entry.

### Human Verification Required

None.

### Gaps Summary

No gaps. Both roadmap success criteria are backed by evidence I re-checked. The nine required CI jobs are green at `c2f5a12`, which is code-identical to HEAD. The exports snapshot guard passes locally. The `0xf2f1` references are exactly the documented 14-path CUT-02 keep set. The five review warnings are tracked above as hardening follow-ups, not blockers.

---

_Verified: 2026-10-05_
_Verifier: Claude (gsd-verifier)_
