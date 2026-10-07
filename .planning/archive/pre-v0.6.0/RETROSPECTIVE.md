# Project Retrospective

_A living document updated after each milestone. Lessons feed forward into future planning._

## Milestone: v1.0 — Catchup

**Shipped:** 2026-09-11
**Phases:** 7 (5 planned + 2 inserted) | **Plans:** 53 | **Sessions:** not tracked

### What Was Built

- Account-identity-proof v2 with a Rust-signed → TS-verified fixture (Phase 1)
- Verify-before-trust inbound boundary, 84-day KeyPackage lifetime cap, #236 tag cardinality (Phase 2)
- Commit-legality validators (app-component integrity, admin/leaf coupling) on send, inbound, and fork-recovery seams; SelfEvicted and digest-attributed rewind-withdrawable notifications (Phases 3, 03.1)
- Confirm-time own-commit convergence stamp ported from MDK, missing-parent deferral, bounded convergence passes, SafeAAD advertisement, MDK scenario vectors as a parity harness (Phase 4)
- `marmot.group.lifecycle.v1` with an absorbing, durable `disbanded` terminal state (Phase 04.1)
- Six-runtime CI matrix and four byte-exact Rust/TS parity dossiers bound to one tested source SHA (Phase 5)

### What Worked

- Ordering by severity: interop-breakers (Phases 1–2) closed quickly in small plans before the larger convergence work
- Verify-first requirements (CONV-04) surfaced a real defect rather than assuming parity
- Checking how MDK solved a problem before hand-rolling a fix: porting `OwnCommitConvergenceStamp` closed a defect class structurally
- Converting open review findings into a planned, verified insertion phase (03.1) instead of another ad-hoc fix round

### What Was Inefficient

- Phase 3 went through three code-review rounds, each finding blockers in the previous round's fixes (7 → 4 → 5) before the work was replanned
- The `refs/` submodules drifted 4 and 193 commits behind before the 2026-08-06 sweep caught it, which late-added lifecycle-v1 scope (Phase 04.1)
- Planning bookkeeping drifted: stale "Gaps Found" traceability rows and a pending todo that had already been fixed in code were only caught at milestone close
- No milestone audit was run before close

### Patterns Established

- Standing per-phase upstream check of `refs/marmot` and `refs/mdk`, recorded as its own `chore(refs):` commit
- Diverging from the Rust reference is a recorded decision, not a default
- Byte-exact parity claims are backed by immutable, machine-validated dossiers pinned to a tested source SHA
- Restart/persist → reload → converge scenarios get automated vectors, not just in-memory tests

### Key Lessons

1. When incremental review fixes keep regressing, stop patching and look for the structural solution — often already in the reference implementation.
2. Refresh upstream references at the start of every phase, not only at milestone start.
3. Close todos and traceability rows in the same commit as the fix, so milestone close doesn't depend on archaeology.

### Cost Observations

- Model mix: not tracked
- Sessions: not tracked
- Notable: most plans ran 3–15 minutes; outliers were Phase 3 convergence work (45–95 min) and the 03-08 reference-materialization plan (~6h)

---

## Milestone: v2.0 — Account identity proof v2

**Shipped:** 2026-10-05
**Phases:** 6 (6–11) | **Plans:** 27 | **Sessions:** not tracked

### What Was Built

- Shared, proof-class-agnostic 104-byte `MarmotAuthorizationProof` envelope primitive (Phase 6)
- `0x8009` account identity proof component, byte-exact with the spec vector, and a full clean cut of the legacy `0xf2f1` profile (Phase 7)
- `0x8009` group-profile requirement enforced identically on every legality seam through the shared `validateCommitLegality` adapter, proven by a seam-parity matrix (Phase 8)
- Replacement-leaf identity binding with a tri-state `CommitLegalityOutcome` across all six seams (Phase 9)
- Founding group creation via Welcome only, with per-invitee retryable, ack-aware delivery (Phase 10)
- Per-subpath export snapshots, legacy-export guard, and a green nine-job CI gate (Phase 11)

### What Worked

- Dependency-ordered roadmap from research (primitive → proof class → seams → update → founding → QA) — no phase had to wait on or rework a later one
- Centralizing the profile check in one adapter before touching any seam, then proving parity with a matrix test; the v1.0 seam-asymmetry defect class did not recur
- Atomic wire cut (07-06) after first migrating all tests to real signers in separate waves (07-02..07-05) kept the suite green across a breaking change
- Gap-closure plans (10-05..10-07) inside the phase instead of a separate inserted phase

### What Was Inefficient

- Phase 8 shipped with four code-review rounds and a fix report but no VERIFICATION.md; it was only caught by the milestone audit and produced at close
- Review fixes landed without regression tests (Phase 8 WR-01..03), so their correctness rests on inspection
- An unreproduced single-test failure in Phase 9 was lost to `tail`-truncated output
- Phase 10 changed a locked decision mid-phase (D-09 relay-less create reversed to fail-closed)

### Patterns Established

- Seam-parity matrix tests: one shared expected verdict per invalid input, asserted across send / inbound / replay / tree-fed
- Tri-state legality outcome (legal / violation / undecidable) so unjudgeable commits defer in each seam's own idiom
- Deterministic pubkey-ordered `testAccount(slot)` fixtures so real signers don't perturb tie-break-sensitive tests
- Inline per-subpath export snapshots plus a self-tested legacy-export guard

### Key Lessons

1. Run phase verification even when code review was heavy — review rounds are not a goal-backward check.
2. Every review fix ships with a test that fails without it.
3. Never truncate test output when a failure appears; capture the full run before re-running.

### Cost Observations

- Model mix: not tracked
- Sessions: not tracked
- Notable: suite grew from ~1250 to ~1310 tests; 258 commits over 24 days

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions    | Phases | Key Change                                                       |
| --------- | ----------- | ------ | ---------------------------------------------------------------- |
| v1.0      | not tracked | 7      | Per-phase reference checks; review findings closed as a planned phase |
| v2.0      | not tracked | 6      | Research-derived dependency order; seam-parity matrix tests; milestone audit before close |

### Cumulative Quality

| Milestone | Tests        | Coverage     | Zero-Dep Additions |
| --------- | ------------ | ------------ | ------------------ |
| v1.0      | not recorded | not recorded | —                  |
| v2.0      | ~1310 (115 files) | not recorded | —           |

### Top Lessons (Verified Across Milestones)

1. Look for the structural fix (shared adapter / reference port) before patching seam by seam — held in v1.0 (convergence stamp) and v2.0 (`validateCommitLegality`).
2. Planning bookkeeping drifts unless checked before close — v1.0 stale traceability rows, v2.0 missing Phase 8 VERIFICATION.md; running the milestone audit caught it.
