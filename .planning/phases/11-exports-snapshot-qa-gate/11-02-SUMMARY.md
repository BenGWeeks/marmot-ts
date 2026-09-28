---
phase: 11-exports-snapshot-qa-gate
plan: 02
subsystem: testing
tags: [vitest, exports-snapshot, package-smoke, noble-curves, bip-340, account-identity-proof]

requires:
  - phase: 07-account-identity-proof-component-0x8009-legacy-clean-cut
    provides: "the 0x8009 account identity proof component, the 15-name legacy 0xf2f1 export removal (ef756c8), and the mandatory generateKeyPackage signer option"
provides:
  - "Per-subpath inline export-key snapshots for 8 of 9 public subpaths (all except ./mls)"
  - "findLegacyExportViolations: a mechanical, self-tested guard rejecting any removed legacy export name, legacy-shaped name, or 0xf2f1 value (number/bigint/hex string, recursively) on any public surface"
  - "A working packed-tarball package-smoke that signs a real 0x8009 KeyPackage proof with a runtime-dependency-only signer and validates it"
affects: [release-gate, ci-build-workflow]

tech-stack:
  added: []
  patterns:
    - "Per-subpath source-barrel namespace import + toMatchInlineSnapshot() key-list pattern, replicated 8x from the existing root snapshot"
    - "Recursive legacy-value scan (arrays, Sets, Maps, plain objects, class statics) with a WeakSet cycle guard and depth cap, self-tested against one planted violation per kind plus a negative control"
    - "Hand-rolled BIP-340 signer built only from @noble/curves + @noble/hashes for a packed-tarball smoke test, avoiding devDependency leakage into the simulated consumer install"

key-files:
  created: []
  modified:
    - src/__tests__/exports.test.ts
    - scripts/package-smoke/smoke.mjs

key-decisions:
  - "Followed RESEARCH.md's exact D-02 guard design (exact-match denylist + legacy-shaped-name regex + recursive 0xf2f1 value scan) rather than a fuzzy substring match, since several current exports legitimately contain the token AccountIdentityProof"
  - "Snapshotted both ./extra/audit/node and ./extra/audit/browser (RESEARCH.md's import-safety finding overrides CONTEXT.md's cautious 'browser may be skipped' framing -- both import cleanly under Node/Deno/Bun)"
  - "Built the package-smoke signer from @noble/curves/secp256k1.js + @noble/hashes (marmot-ts runtime dependencies) rather than the devDependency applesauce-accounts helper the repo's own tests use, per RESEARCH.md Pitfall 3"

requirements-completed: [QA-05, QA-04]

coverage:
  - id: D1
    description: "Per-subpath inline export-key snapshots for ./client, ./core, ./engine, ./extra, ./utils, ./audit, ./extra/audit/node, ./extra/audit/browser (D-03), root snapshot left byte-identical"
    requirement: "QA-05"
    verification:
      - kind: unit
        ref: "src/__tests__/exports.test.ts#./client exports, ./core exports, ./engine exports, ./extra exports, ./utils exports, ./audit exports, ./extra/audit/node exports, ./extra/audit/browser exports"
        status: pass
    human_judgment: false
  - id: D2
    description: "findLegacyExportViolations guard rejecting removed legacy names, legacy-shaped names, and 0xf2f1 values across all 9 public surfaces, proven non-vacuous by a self-test planting each violation kind plus a negative control (D-02)"
    requirement: "QA-05"
    verification:
      - kind: unit
        ref: "src/__tests__/exports.test.ts#legacy 0xf2f1 account-identity-proof export guard (D-02) > %s exposes no legacy proof export"
        status: pass
      - kind: unit
        ref: "src/__tests__/exports.test.ts#legacy 0xf2f1 account-identity-proof export guard (D-02) > flags planted legacy names, legacy-shaped constants and nested 0xf2f1 values (guard self-test)"
        status: pass
    human_judgment: false
  - id: D3
    description: "scripts/package-smoke/smoke.mjs signs a real 0x8009 KeyPackage proof with a runtime-dependency-only BIP-340 signer, validates it, and passes on Node, Bun, and Deno after pnpm build (QA-04, D-06)"
    requirement: "QA-04"
    verification:
      - kind: other
        ref: "bash scripts/package-smoke/run.sh (recorded output: package smoke OK (node v26.9.0), package smoke OK (Bun), package smoke OK (Deno), package-smoke: PASSED)"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-09-28
status: complete
---

# Phase 11 Plan 02: Exports Snapshot Guard & Package-Smoke Signer Fix Summary

**Added per-subpath export snapshots plus a self-tested legacy-export guard across all 9 public surfaces, and fixed the packed-tarball package-smoke to sign a real BIP-340 0x8009 KeyPackage proof so it passes on Node, Bun, and Deno again.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-09-28T22:56:00Z
- **Completed:** 2026-09-28T23:00:38Z
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments

- Extended `src/__tests__/exports.test.ts` with 8 new per-subpath inline export-key snapshots (`./client`, `./core`, `./engine`, `./extra`, `./utils`, `./audit`, `./extra/audit/node`, `./extra/audit/browser`), leaving the existing root snapshot byte-identical (purely additive commit, confirmed 0 removed lines).
- Added `findLegacyExportViolations`, a recursive mechanical guard (exact 15-name denylist + legacy-shaped-name regex + recursive `0xf2f1` value scan across arrays, Sets, Maps, plain objects, and class statics) run over all 9 public surfaces via `it.each`, proven non-vacuous by a self-test that plants one violation of each kind plus a negative control of current `0x8009` names.
- Fixed `scripts/package-smoke/smoke.mjs`, which crashed with `Cannot read properties of undefined (reading 'signEvent')` because it called `generateKeyPackage` without the `signer` Phase 7 made mandatory — the root cause of the GitHub `Build` workflow's package-smoke job being red on master. The fix hand-rolls a BIP-340 signer from `@noble/curves`/`@noble/hashes` (marmot-ts runtime dependencies, not the devDependency account-signer helper the repo's own tests use) and validates the resulting packed `0x8009` proof with `validateKeyPackageAccountIdentityProof`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Per-subpath export snapshots + legacy-export guard with self-test, and D-04 snapshot review (QA-05)** - `a3fbe1e` (test)
2. **Task 2: Give the package smoke a real raw-key AuthorizationProofSigner and validate the packed 0x8009 proof (QA-04, D-06)** - `e736c70` (fix)

**Plan metadata:** committed alongside this SUMMARY (see final commit).

## Files Created/Modified

- `src/__tests__/exports.test.ts` - Added 8 namespace imports from source barrels, the D-02 guard machinery (`REMOVED_LEGACY_EXPORT_NAMES`, `LEGACY_EXPORT_NAME_PATTERN`, `LEGACY_PROOF_EXTENSION_TYPE`, `findLegacyExportViolations`, `PUBLIC_SURFACES`), 8 new `describe` blocks with populated inline snapshots, and a `describe("legacy 0xf2f1 account-identity-proof export guard (D-02)")` block with `it.each` over all 9 surfaces plus the guard self-test.
- `scripts/package-smoke/smoke.mjs` - Replaced the non-on-curve placeholder pubkey with a schnorr-derived one from a deterministic throwaway key, added a hand-rolled `smokeSigner` satisfying `AuthorizationProofSigner`, threaded it into `generateKeyPackage`, and added a `validateKeyPackageAccountIdentityProof(kp.publicPackage)` call after KeyPackage generation.

## Reviewed snapshot diff (D-04)

Per-subpath sorted export-key counts (counted directly from the populated inline snapshots):

| Subpath | Key count |
|---|---|
| `.` (root) | 293 |
| `./client` | 29 |
| `./core` | 245 |
| `./engine` | 32 |
| `./extra` | 4 |
| `./utils` | 16 |
| `./audit` | 21 |
| `./extra/audit/node` | 3 |
| `./extra/audit/browser` | 3 |

**D-04 name presence check:** `AUTHORIZATION_PROOF_LENGTH`, `AUTHORIZATION_PROOF_MAX_CREATED_AT`, `AuthorizationProofError`, `ACCOUNT_IDENTITY_PROOF_COMPONENT`, `ACCOUNT_IDENTITY_PROOF_COMPONENT_ID`, and `AccountIdentityProofError` all appear in both the root and `./core` snapshots — confirmed by grep (`grep -c '"<name>",' src/__tests__/exports.test.ts` returns ≥2 for each name). None of the 15 removed legacy names (`ACCOUNT_IDENTITY_PROOF_EVENT_KIND`, `ACCOUNT_IDENTITY_PROOF_EXTENSION_TYPE`, `accountIdentityProofEventId`, `accountIdentityProofEventJson`, `accountIdentityProofSignatureFromSignedEvent`, `accountIdentityProofSigningDigest`, `buildAccountIdentityProofEvent`, `buildAccountIdentityProofExtension`, `decodeAccountIdentityProof`, `encodeAccountIdentityProof`, `makeAccountIdentityProofExtension`, `mlsSignatureScheme`, `signAccountIdentityProof`, `verifyAllLeafAccountIdentityProofs`, `verifyLeafAccountIdentityProof`) appears anywhere in the file — each occurs exactly once (inside `REMOVED_LEGACY_EXPORT_NAMES`, the denylist itself), confirmed by grep.

**Count deviation, explained:** RESEARCH.md's D-03/D-04 table recorded the root subpath's key count as 245 — identical to the `./core` row directly below it. That figure does not match the actual, unedited root snapshot already present in the repo before this plan touched the file: `git show HEAD~2:src/__tests__/exports.test.ts | sed -n '/ACCOUNT_IDENTITY_PROOF_COMPONENT/,/verifyAuthorizationProof/p' | wc -l` (and the populated `./core` snapshot in this same commit) both independently confirm the root snapshot has 293 entries, `./core` has 245. This is logically consistent, not a regression: `src/index.ts` (root) aggregates `client` (29) + `core` (245) + `utils` (16) plus selected `./engine`/`./audit` re-exports, so root necessarily has *more* keys than `core` alone — root cannot legitimately equal core's count. The 245-for-root research figure is almost certainly a copy-paste slip from the `./core` row directly beneath it in RESEARCH.md's table, not a discovered code problem. The commit diff for `src/__tests__/exports.test.ts` shows zero removed lines (`git show -U0 --format= HEAD~1 -- src/__tests__/exports.test.ts | grep -cE '^-[^-]'` → `0`), confirming the root snapshot's 293 entries were already present, byte-for-byte, before this plan ran — this plan made no root-snapshot change to explain or investigate further. All 8 other subpath counts (`./client` 29, `./core` 245, `./engine` 32, `./extra` 4, `./utils` 16, `./audit` 21, `./extra/audit/node` 3, `./extra/audit/browser` 3) match RESEARCH.md's captured counts exactly.

**Accepted gap (D-02):** type-only exports are erased at runtime and are not covered by `findLegacyExportViolations` — this codebase has no legacy *type* name to guard against (the 15 removed exports were all runtime values per 07-07-SUMMARY.md's own list), so this is a documented, zero-present-value gap rather than a silent omission (RESEARCH.md D-02 point 3).

## Decisions Made

- Used a flat per-subpath `describe` block per subpath (mirroring the existing file's flat style) rather than a table-driven loop for the snapshot assertions, since inline snapshots require one call site per assertion and cannot be generated from a loop.
- Snapshotted both `./extra/audit/node` and `./extra/audit/browser` (not just `node`) per RESEARCH.md's confirmed three-runtime import-safety finding, which overrides CONTEXT.md's more cautious "browser may be skipped" framing.
- Kept the D-02 guard's value-equality check case-insensitive for hex-string forms (`"0xF2F1"` matches) per the plan's explicit self-test coverage, without attempting to catch every conceivable string representation (e.g. plain decimal `"62193"` is out of scope — the plan's self-test does not require it and RESEARCH.md's design section focuses on number/bigint/hex forms).

## Deviations from Plan

None — plan executed exactly as written. Both tasks matched their `<action>` and `<acceptance_criteria>` blocks precisely; the one discrepancy found (the root subpath's RESEARCH.md-recorded key count) was a pre-existing research-documentation figure, not a plan deviation, and is explained above per the plan's own "any difference must be explained" instruction.

## Issues Encountered

None. This worktree did not have the `ts-mls` submodule checked out or `node_modules` installed at start (a fresh worktree); `git submodule update --init ts-mls` and `pnpm install --frozen-lockfile` were run first, as the parallel-execution instructions anticipated, before any test or build command.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- QA-05 is fully satisfied by this plan: every public subpath except `./mls` has a reviewed, populated inline export snapshot, and the D-02 guard mechanically proves no surface leaks a legacy `0xf2f1` proof export.
- QA-04's package-smoke leg of the D-06 gate is fixed and green on Node, Bun, and Deno locally (`bash scripts/package-smoke/run.sh` → `package-smoke: PASSED`). The remaining QA-04/D-06 gate items (`pnpm vitest run` on the full suite across all local runtimes, `pnpm build`, `pnpm lint`) are this phase's other plans' scope, not re-verified exhaustively here beyond what these two tasks' own verification touched (`pnpm exec tsc -p tsconfig.json --noEmit`, `pnpm exec prettier --check`, and `pnpm build` as a precondition for the package smoke).
- No blockers for the phase's remaining plans (D-08/D-09/D-10 chores, and the phase-level verification pass).

---
*Phase: 11-exports-snapshot-qa-gate*
*Completed: 2026-09-28*
