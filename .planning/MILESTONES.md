# Milestones

## v2.0 Account identity proof v2 (Shipped: 2026-10-05)

**Delivered:** a clean cut from the legacy `0xf2f1` proof extension to the adopted
`marmot.member.account-identity-proof.v2` app component `0x8009` (104-byte `MarmotAuthorizationProof`),
so marmot-ts interoperates with MDK's default Current-profile groups.

**Phases completed:** 6 phases (6–11), 27 plans, 66 tasks
**Timeline:** 2026-09-12 → 2026-10-05
**Git:** 258 commits; `src/` 138 files changed, +19,294 / −2,094; ~72k LOC TypeScript under `src/`
**Requirements:** 27/27 v2.0 requirements satisfied
**Closeout:** verified_closeout — milestone audit `passed` (re-scored after Phase 8's missing
VERIFICATION.md was produced at close: 4/4 criteria, GRP-01..04 satisfied); all 6 phases verification
`passed`; open-artifact audit clear. No `v2.0` git tag (milestone ≠ npm version). Tech debt carried
forward is listed in `milestones/v2.0-MILESTONE-AUDIT.md` (notably: Phase 8 WR-01..03 review fixes lack
regression tests; Phase 10 WR-06 foundingAdd TOCTOU; Phase 11 export-surface guard gaps).

**Key accomplishments:**

- **Authorization-proof envelope** — proof-class-agnostic 104-byte `MarmotAuthorizationProof` codec, NIP-01 id reconstruction + BIP-340 verify, strict external-signer produce; spec signing vector reproduced byte-for-byte (AUTHZ-01..05)
- **`0x8009` proof class + legacy clean cut** — kind-450 producer, leaf/KeyPackage/tree validators, container guards; `generateKeyPackage` requires a signer; `0xf2f1` module, exports, fixture deleted with no fallback; non-current stored KeyPackages skipped (PROOF-02..06, CUT-01/02)
- **Seam-symmetric profile enforcement** — `0x8009` required on every group and checked inside the shared `validateCommitLegality` adapter; a 14-test parity matrix proves send / inbound / pool-replay / tree-fed report the identical violation; join and standalone-Add admission gated; out-of-profile stored groups refuse all traffic (GRP-01..04)
- **Replacement-leaf identity binding** — tri-state `CommitLegalityOutcome` across all six legality seams; identity change, stale proof, or dropped `0x8009` on a leaf is rejected; standalone Update admission validator (UPD-01..04)
- **Founding creation via Welcome** — `foundingAdd` merges epoch 0→1 locally with no kind-445 publish, `Stable` immediately, per-invitee retryable Welcomes via `deliverMany()`; relay-less invitees fail closed; unacked Welcomes stay retryable (FOUND-01..05)
- **Exports & QA gate** — per-subpath export snapshots with a legacy-export guard, MIP-NN citations rewritten to topic spec paths, package smoke fixed; all nine CI jobs green (QA-04, QA-05)

**Archives:** `milestones/v2.0-ROADMAP.md`, `milestones/v2.0-REQUIREMENTS.md`, `milestones/v2.0-MILESTONE-AUDIT.md`, `milestones/v2.0-phases/`, `milestones/v2.0-research/`

---

## v1.0 Catchup (Shipped: 2026-09-11)

**Delivered:** marmot-ts resynced to the post-split marmot spec and MDK Rust reference —
closing every catalogued interop-breaker and reaching byte-exact parity on the wire surfaces
that have a Rust counterpart.

**Phases completed:** 7 phases (5 planned + 03.1, 04.1 inserted), 53 plans, 113 tasks
**Timeline:** 2026-07-01 → 2026-09-06 (last phase), closed 2026-09-11
**Git:** 460 commits; `src/` 124 files changed, +20,701 / −751; ~54k LOC TypeScript under `src/`
**Requirements:** 16/16 v1 requirements satisfied
**Closeout:** verified_closeout — all 7 phases verification `passed`; no milestone audit was run
(user chose to proceed). The one pending todo (`groupsmanager-rejectedevents-dos`) was already
fixed in code and moved to `todos/done/`.

**Key accomplishments:**

- **Proof v2** — account-identity-proof signs the canonical kind-450 event id; pinned Rust-signed → TS-verified fixture (PROOF-01)
- **Inbound trust & wire boundary** — verify-before-trust on 445/1059/30443, 84-day KeyPackage lifetime cap, #236 required-tag cardinality (SEC-01, WIRE-01, WIRE-02)
- **Commit integrity & convergence parity** — one `validateCommitLegality` adapter across send, inbound, pool-replay, and tree-fed paths; durable SelfEvicted removal; digest-attributed notifications withdrawn on rewind; 30 review findings closed in inserted Phase 03.1 (WIRE-03, CONV-01..04)
- **Structural own-commit convergence** — ported MDK's `OwnCommitConvergenceStamp`, missing-parent deferral inside the rollback horizon, bounded monotonic convergence passes, SafeAAD leaf advertisement (WIRE-04)
- **Terminal group disbanding** — `marmot.group.lifecycle.v1` codec and an absorbing, durable, canonically-selected `disbanded` state (LIFE-01, LIFE-02, CONV-05)
- **Conformance & quality gate** — MDK scenario vectors as an automated parity harness, six-runtime CI matrix, four byte-exact Rust/TS parity dossiers bound to one tested source SHA (CONF-01, QA-01, QA-02)

**Archives:** `milestones/v1.0-ROADMAP.md`, `milestones/v1.0-REQUIREMENTS.md`, `milestones/v1.0-phases/`

---
