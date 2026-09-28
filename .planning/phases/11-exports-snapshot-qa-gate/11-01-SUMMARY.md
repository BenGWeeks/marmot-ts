---
phase: 11-exports-snapshot-qa-gate
plan: 01
subsystem: testing
tags: [comment-hygiene, stale-references, spec-citations, qa-05, d-01, d-10]

# Dependency graph
requires:
  - phase: 07-account-identity-proof-component-0x8009-legacy-clean-cut
    provides: the deletion of src/core/account-identity-proof.ts (commit ef756c8) that left six dangling comment pointers
provides:
  - Six comments naming the Phase-7-deleted legacy proof module by deletion commit instead of a dead relative path
  - Zero MIP-NN citations anywhere in src/; every rewritten citation names an existing refs/marmot topic file
  - Two ambiguous self-update citations resolved against the spec text
  - Adjacent "Marmot Group Data Extension" pre-split terminology retired from 3 locations
affects: [11-exports-snapshot-qa-gate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dead-pointer comments name the deletion commit hash rather than a resolvable-looking relative path"
    - "Spec citations in comments/test titles use bare topic-path text in backticks (e.g. \`protocol-core/group-messaging.md\`), matching the existing src/core/auth-service.ts style"

key-files:
  created: []
  modified:
    - src/core/components/account-identity-proof.ts
    - src/core/__tests__/darkmatter-invite-compat.test.ts
    - src/core/__tests__/capabilities.test.ts
    - src/core/__tests__/key-package.test.ts
    - src/core/group-message-crypto.ts
    - src/core/group-event.ts
    - src/core/default-capabilities.ts
    - src/core/key-package-event-decode.ts
    - src/core/key-package-event-encode.ts
    - src/core/capabilities.ts
    - src/core/extensions.ts
    - src/core/key-package.ts
    - src/core/auth-service.ts
    - src/client/key-package-store.ts
    - src/core/__tests__/credential.test.ts
    - src/core/__tests__/key-package-event.test.ts
    - src/core/__tests__/group-message.test.ts
    - src/engine/__tests__/group-engine.test.ts
    - src/client/__tests__/key-package-manager.test.ts
    - src/client/group/__tests__/marmot-group.test.ts
    - src/__tests__/integration/end-to-end-invite-join-message.test.ts
    - src/__tests__/integration/ingest-commit-race.test.ts

key-decisions:
  - "Both RESEARCH.md-flagged ambiguous self-update citations (marmot-group.test.ts:771, end-to-end-invite-join-message.test.ts:143) resolved to spec text rather than left as-is or escalated"
  - "The adjacent 'Marmot Group Data Extension' terminology drift (default-capabilities.ts, key-package-event-encode.ts, one key-package.test.ts title) was fixed in the same D-10 commit, per planner discretion, and called out separately from the MIP-number rewrite"

patterns-established:
  - "Comments pointing at deleted modules must name the deletion commit hash, not a relative path that used to resolve"

requirements-completed: [QA-05]

coverage:
  - id: D1
    description: "Six dead pointers to the Phase-7-deleted src/core/account-identity-proof.ts rewritten to name deletion commit ef756c8 instead of a resolvable-looking path; all CUT-02 rejection machinery left byte-identical"
    requirement: "QA-05"
    verification:
      - kind: unit
        ref: "pnpm vitest run src/core/ (34 files, 588 tests)"
        status: pass
      - kind: other
        ref: "grep-based acceptance criteria: 0 dead pointers remain, 3x ef756c8 in account-identity-proof.ts, 1x ef756c8 per test file, LEGACY_ACCOUNT_IDENTITY_PROOF_EXTENSION_TYPE count unchanged (5 in module, 3 per test file), 0xf2f1 count >=11 in module"
        status: pass
    human_judgment: false
  - id: D2
    description: "All 26 MIP-NN citations in 18 src/ files rewritten to topic-organized refs/marmot/ spec paths, including the two ambiguous self-update citations resolved against spec text"
    requirement: "QA-05"
    verification:
      - kind: unit
        ref: "pnpm vitest run (115 files, 1292 tests)"
        status: pass
      - kind: other
        ref: "grep -rnE 'MIP-[0-9]{2}' src/ | wc -l == 0; per-file citation counts verified (marmot-group.test.ts=4, end-to-end-invite-join-message.test.ts=1, group-message-crypto.ts=2, capabilities.ts=3)"
        status: pass
    human_judgment: false

duration: 14min
completed: 2026-09-28
status: complete
---

# Phase 11 Plan 01: Stale-Reference & MIP-Citation Hygiene Summary

**Six dead-module pointers rewritten to name deletion commit `ef756c8`, and all 26 stale `MIP-NN` citations across 18 `src/` files rewritten to topic-organized `refs/marmot/` paths, as two independent comment-only commits.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-09-28T22:57:00Z
- **Completed:** 2026-09-28T23:00:05Z
- **Tasks:** 2
- **Files modified:** 22 (4 in Task 1, 19 in Task 2 — `src/core/key-package.test.ts` was touched in both tasks)

## Accomplishments

- Closed the QA-05 "no stale `0xf2f1` references" gap for comments: the three doc comments in `src/core/components/account-identity-proof.ts` (module docstring, `MLS_SIGNATURE_SCHEME_BY_CIPHERSUITE` doc, `LEGACY_ACCOUNT_IDENTITY_PROOF_EXTENSION_TYPE` doc) and the three identical header comments in `src/core/__tests__/{darkmatter-invite-compat,capabilities,key-package}.test.ts` no longer present `../account-identity-proof.js` as a resolvable path — they now name the Phase 7 deletion commit `ef756c8`.
- Every CUT-02 rejection reference (the private `LEGACY_ACCOUNT_IDENTITY_PROOF_EXTENSION_TYPE` constant, every reject branch, every negative-case test assertion, `docs/client/best-practices.md`) is byte-identical — confirmed by grep counts and `git diff --stat 4a7130d -- docs/client/best-practices.md` printing nothing.
- Rewrote all 26 `MIP-NN` citations (across 22 lines in 18 files, matching RESEARCH.md's count exactly) to the topic-organized `refs/marmot/{foundation,protocol-core,transports}/` paths.
- Resolved both citations RESEARCH.md flagged as ambiguous (self-update commit behavior labeled `MIP-02`): both now cite `protocol-core/group-messaging.md` (`marmot-group.test.ts:771`) and `protocol-core/joining.md` (`end-to-end-invite-join-message.test.ts:143`) respectively, per spec-text verification during planning.
- Retired the pre-split "Marmot Group Data Extension" terminology in 3 adjacent locations (`default-capabilities.ts`, `key-package-event-encode.ts` ×2, one `key-package.test.ts` test title) in favor of the actual current extension names (`app_data_dictionary`, `last_resort`).
- Full suite green after both commits: `pnpm vitest run` (115 files / 1292 tests, 0 failures), `pnpm compile`, and `pnpm exec tsc -p tsconfig.json --noEmit` all pass; `pnpm exec prettier --check` clean on all touched files.

## Task Commits

1. **Task 1: D-01 — rewrite the six dead pointers to the deleted legacy proof module (QA-05)** - `7837d95` (docs)
2. **Task 2: D-10 — rewrite every MIP-NN citation to its topic spec path, plus adjacent stale extension terminology (chore)** - `e857449` (chore)

_No TDD tasks; both are comment/test-title-only edits._

## The Six Rewritten Dead-Pointer Locations (D-01)

| File | Location | Before | After |
|---|---|---|---|
| `src/core/components/account-identity-proof.ts` | module docstring (~line 15-17) | "This is a purely additive replacement for the legacy … extension (`0xf2f1`, `../account-identity-proof.js`), which this module does not import from or modify." | "It replaces the legacy … extension (`0xf2f1`), whose module was deleted in the Phase 7 clean cut (`ef756c8`). `0xf2f1` survives here only as a private constant so the validators below can detect and reject legacy material (CUT-02); it is never produced or accepted." |
| `src/core/components/account-identity-proof.ts` | `MLS_SIGNATURE_SCHEME_BY_CIPHERSUITE` doc (~line 68-69) | "Re-homed verbatim from the verified legacy table (`../account-identity-proof.js`'s `MLS_SIGNATURE_SCHEME_BY_CIPHERSUITE`) …" | "Re-homed verbatim from the verified `MLS_SIGNATURE_SCHEME_BY_CIPHERSUITE` table of the deleted legacy proof module (`ef756c8`) …" |
| `src/core/components/account-identity-proof.ts` | `LEGACY_ACCOUNT_IDENTITY_PROOF_EXTENSION_TYPE` doc (~line 234-235) | "The deployed legacy … extension type (`../account-identity-proof.js`). Not exported: …" | "The legacy … extension type, whose module was deleted in `ef756c8`. Not exported: …" |
| `src/core/__tests__/darkmatter-invite-compat.test.ts` | 4-line header above `LEGACY_ACCOUNT_IDENTITY_PROOF_EXTENSION_TYPE` | referenced `../account-identity-proof.js` | 3-line comment naming `ef756c8`, "Referenced here only as a literal to assert its absence and rejection (CUT-01/CUT-02)." |
| `src/core/__tests__/capabilities.test.ts` | same header pattern | same | same rewrite |
| `src/core/__tests__/key-package.test.ts` | same header pattern | same | same rewrite |

## The 26-Citation Mapping As Applied (D-10)

| File:line(s) | Old citation | New citation |
|---|---|---|
| `src/core/group-message-crypto.ts:44` | MIP-03 | `transports/nostr.md` (kind-445 group-event encryption key) |
| `src/core/group-message-crypto.ts:120` | MIP-03 | `transports/nostr.md` (kind-445 content encryption) |
| `src/core/group-event.ts:44` | MIP-03 | `transports/nostr.md` (fresh per-event ephemeral key) |
| `src/core/key-package-event-decode.ts:158,161` | MIP-00 | `transports/nostr.md` (`i` tag value / KeyPackage publication) |
| `src/core/key-package-event-encode.ts:44-45` | MIP-00 | `transports/nostr.md` (current kind-30443 tag set omits protected tag) |
| `src/core/key-package.ts:128` | MIP-00 | `foundation/key-packages.md` |
| `src/core/extensions.ts:17` | MIP-00 | `foundation/key-packages.md` (`last_resort_key_package`) |
| `src/core/auth-service.ts:11` | MIP-00 / `foundation/identity.md` | `foundation/identity.md` only (dropped the MIP-00 prefix) |
| `src/client/key-package-store.ts:211` | MIP-00 prefix | dropped (line 213 already cites `transports/nostr.md`) |
| `src/core/capabilities.ts:69` | MIP-03 | `protocol-core/member-departure.md` |
| `src/core/capabilities.ts:94` | MIP-03 | `protocol-core/member-departure.md` |
| `src/core/default-capabilities.ts:14-15,20` | MIP-01 + "Marmot Group Data Extension" | `protocol-core/group-setup.md` + `foundation/key-packages.md`, extension names spelled out |
| `src/core/key-package-event-encode.ts:94,106` | "Marmot Group Data Extension (0xf2ee)" | actual extension names (`app_data_dictionary`, `last_resort`) |
| `src/core/__tests__/key-package.test.ts:257` | "Marmot Group Data Extension" test title | "should include the app_data_dictionary extension in capabilities" |
| `src/core/__tests__/credential.test.ts:235` | MIP-00 | `foundation/identity.md` |
| `src/core/__tests__/key-package-event.test.ts:619` | MIP-00 | `transports/nostr.md, foundation/key-packages.md` |
| `src/core/__tests__/group-message.test.ts:46,47` | MIP-03 | `transports/nostr.md` |
| `src/client/__tests__/key-package-manager.test.ts:670` | MIP-00 | `transports/nostr.md` |
| `src/engine/__tests__/group-engine.test.ts:202` | MIP-03 | `protocol-core/group-messaging.md` |
| `src/client/group/__tests__/marmot-group.test.ts:489,546,603` | MIP-03 | `protocol-core/group-messaging.md` |
| `src/client/group/__tests__/marmot-group.test.ts:771` | MIP-02 (ambiguous) | `protocol-core/group-messaging.md` (resolved) |
| `src/__tests__/integration/end-to-end-invite-join-message.test.ts:143` | MIP-02 (ambiguous) | `protocol-core/joining.md` (resolved) |
| `src/__tests__/integration/ingest-commit-race.test.ts:60,214` | MIP-03 | `protocol-core/group-messaging.md` |

## The Two Ambiguity Resolutions (with spec line references)

1. **`src/client/group/__tests__/marmot-group.test.ts:771`** — "accepts non-admin self-update commits (no proposals)" was cited `(MIP-02)`. RESEARCH.md flagged this as ambiguous because MIP-02 pre-split mapped only to "Welcome Events." Resolved to **`protocol-core/group-messaging.md`**: that file's "Commit authorization" section (lines 40-51) explicitly lists "a self-update Commit that updates only the sender's own LeafNode" as the non-admin commit shape the test exercises; `protocol-core/group-setup.md` line 92 corroborates.
2. **`src/__tests__/integration/end-to-end-invite-join-message.test.ts:143`** — "MIP-02 self-update is the caller's responsibility" comment. Resolved to **`protocol-core/joining.md`**: step 14 (line 62) and lines 70-71 own the post-join self-update behavior and explicitly state it "carries forward the MIP-02 post-join rotation guidance," making `joining.md` the current normative home even though the comment used to cite the old MIP-02 label directly.

## Adjacent Terminology Fix (separate from the MIP rewrite)

Per RESEARCH.md Open Question 1, included in the same D-10 commit at planner discretion because it sits beside citations being touched anyway — **not** part of the MIP-NN grep count itself:

- `src/core/default-capabilities.ts:14-15,20` — replaced "the Marmot Group Data Extension" (a pre-split monolithic MIP-01 name that no longer exists per `refs/marmot/mip-coverage.md`'s field-split table) with a description of the actual capabilities `ensureMarmotCapabilities` adds (app_data_dictionary, last_resort, agent-text-stream `receive`, app_data_update, self_remove).
- `src/core/key-package-event-encode.ts:94,106` — same terminology fix, plus dropped the stale `0xf2ee` hex id (verified zero remaining occurrences).
- `src/core/__tests__/key-package.test.ts:257` — test title "should include Marmot Group Data Extension in capabilities" renamed to "should include the app_data_dictionary extension in capabilities" (assertion itself unchanged).

## Files Created/Modified

**Task 1 (4 files):**
- `src/core/components/account-identity-proof.ts` — 3 doc-comment rewrites naming `ef756c8`
- `src/core/__tests__/darkmatter-invite-compat.test.ts` — header comment rewrite
- `src/core/__tests__/capabilities.test.ts` — header comment rewrite
- `src/core/__tests__/key-package.test.ts` — header comment rewrite

**Task 2 (19 files):** all 18 files listed in the plan frontmatter's `files_modified`, comment/test-title-only edits per the 26-citation mapping above.

## Decisions Made

- Resolved both RESEARCH.md-flagged ambiguous self-update citations against the actual spec text (see "Ambiguity Resolutions" above) rather than leaving them unchanged or raising a checkpoint — RESEARCH.md's own recommendation was to resolve with justification, not escalate, and the spec-text evidence was unambiguous once read directly.
- Included the adjacent "Marmot Group Data Extension" terminology fix in the D-10 commit per planner discretion (RESEARCH.md Open Question 1 recommended this), documented separately from the MIP-number rewrite per instruction.

## Deviations from Plan

None — plan executed exactly as written. Both commits matched their planned scope (comment/test-title-only), and every acceptance-criteria grep/count check specified in the plan passed on the first attempt.

## Issues Encountered

The worktree's `ts-mls`, `refs/mdk`, and `refs/marmot` git submodules were not initialized by default (only the parent repo was checked out). `pnpm install` failed until `git submodule update --init ts-mls` ran, and `pnpm vitest run src/core/` failed one file (`nostr-routing.test.ts`, missing an MDK conformance-vector fixture) until `git submodule update --init refs/mdk refs/marmot` also ran. This is worktree-lifecycle setup, not a plan deviation — no source files were touched to work around it, and it is explicitly permitted by the parallel-execution instructions ("run `git submodule update --init ts-mls` ... inside your worktree first if needed").

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- QA-05's comment-hygiene half (D-01, D-10) is closed. The remaining QA-05 scope (D-02 export guard, D-03/D-04 per-subpath snapshots) and QA-04 (six-runtime gate, package-smoke fix) are separate plans in this phase, per the phase's wave breakdown.
- Full suite verified green after both commits (115 files / 1292 tests), so later plans in this phase inherit a clean baseline.
- No blockers identified for subsequent plans in phase 11.

---
*Phase: 11-exports-snapshot-qa-gate*
*Completed: 2026-09-28*
