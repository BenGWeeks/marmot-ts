# marmot-ts

## What This Is

marmot-ts is an ESM TypeScript library implementing a Marmot (MLS over Nostr) client. It
runs in the browser and natively in Deno, Bun, and Node.js, and is built as layered
abstractions: **ts-mls** (the core MLS engine) → **src/core** (Marmot helpers, constants,
and crypto over MLS) → **src/engine** (a fork-aware state-machine that tracks epochs and
chooses the correct fork to follow) → **src/client** (a convenience layer so downstream
apps can create clients and subscribe to groups easily). It is for developers building
Marmot/Nostr clients who want a spec-conformant MLS implementation without reimplementing
the protocol.

## Core Value

A downstream client can join a Marmot group and exchange messages that interoperate,
byte-for-byte, with any spec-conformant peer (including the Rust MDK reference) —
correctly, across every supported runtime.

## Current State

**v2.0 Account identity proof v2 — shipped 2026-10-05** (phases 6–11, 27 plans, 27/27 requirements).
See `.planning/MILESTONES.md` and [milestone summary](MILESTONES.md).

marmot-ts now speaks the adopted Current profile: KeyPackages and leaves carry the
`marmot.member.account-identity-proof.v2` component `0x8009` (104-byte `MarmotAuthorizationProof`,
spec vector byte-exact), signed with the client's own `EventSigner`. Every group requires `0x8009`,
enforced identically on send, inbound, pool-replay/fork-recovery, and tree-fed convergence through the
shared `validateCommitLegality` adapter (tri-state `CommitLegalityOutcome`). Replacement leaves must
preserve account identity. Founding creation with invitees merges the founding Add locally (epoch 0→1,
no kind-445) and delivers per-invitee retryable Welcomes. The legacy `0xf2f1` profile is gone with no
fallback; out-of-profile stored groups load but refuse all traffic.

Built on v1.0 Catchup (shipped 2026-09-11): resync to the post-split spec + MDK reference, verify-before-
trust inbound boundary, convergence parity, `marmot.group.lifecycle.v1` disbanding, MDK conformance vectors,
and the six-runtime CI matrix.

## Next Milestone Goals

Not yet defined — run `/gsd-new-milestone`. Candidates:

- Backlog 999.1 group image support, 999.2 docs review ahead of the next release, 999.7 invite-only
  client mode (no KeyPackage identifier)
- Shelved 999.3–999.6 audit/closure phases (re-scope against current refs first)
- v2.0 tech debt from the archived v2.0 audit (see [release follow-ups](RELEASE-FOLLOWUPS.md)): regression tests for Phase 8 WR-01..03,
  Phase 10 WR-06 foundingAdd TOCTOU, Phase 11 export-guard gaps (PUBLIC_SURFACES ↔ package.json exports)
- Deferred tracks: multi-device (MDEV-01), push (PUSH-01) — both reuse the `MarmotAuthorizationProof` primitive

## Requirements

### Validated

<!-- Inferred from existing code — the completed migration baseline and shipped architecture. -->

- ✓ Layered architecture (ts-mls → core → engine → client) — existing
- ✓ Cross-platform build/test (browser, Deno 2, Bun, Node 20/22/24) — existing
- ✓ Cross-impl handshake: MLSMessage-framed KeyPackages, PublicMessage commits/proposals — existing
- ✓ Transport/validation blockers B1–B4 (NIP-65 KeyPackage discovery, inbox welcomes, proposal/component tags, account-identity-proof) — existing
- ✓ B5 convergence status/quiescence-settlement (Syncing/Resolving/Settled/Blocked + settle timer + outbound gating) — existing
- ✓ B6 member departure via MLS self_remove (0x000a) + deterministic auto-committer — existing
- ✓ B7 deferred disposition for future-epoch / missing-parent commits — existing
- ✓ M1–M8 validation & convergence hardening — existing
- ✓ Fork-aware engine with tree-fed re-convergence (switch forks live and on restart) — existing
- ✓ encrypted-media-v1 wire format — existing
- ✓ m1/m4/m5/m6 cleanup & retention hardening — existing
- ✓ PROOF-01 account-identity-proof v2 (kind-450 event-id signing, Rust-signed → TS-verified fixture) — v1.0 _(legacy `0xf2f1` profile; superseded by the adopted `0x8009` component in v2.0)_
- ✓ SEC-01 verify event id + signature before trusting routing tags or decrypting — v1.0
- ✓ WIRE-01 KeyPackage Lifetime cap (≤ 84 days) on publish and inbound — v1.0
- ✓ WIRE-02 required-tag cardinality enforcement (445/1059/444/30443) — v1.0
- ✓ WIRE-03 app-component integrity on send, inbound, and convergence seams — v1.0
- ✓ WIRE-04 SafeAAD component advertisement matching MDK leaf bytes — v1.0
- ✓ CONV-01 admin ⊆ member-leaves resulting-epoch invariant — v1.0
- ✓ CONV-02 SelfEvicted / durable removed-inactive realization — v1.0
- ✓ CONV-03 commit-digest-attributed notifications withdrawn on rewind — v1.0
- ✓ CONV-04 own-confirmed-commit protection (closed structurally via confirm-time convergence stamp) — v1.0
- ✓ CONV-05 disband commits always enter a bounded convergence pass — v1.0
- ✓ LIFE-01 / LIFE-02 `marmot.group.lifecycle.v1` codec and absorbing durable disbanded state — v1.0
- ✓ CONF-01 MDK reference vectors as automated cross-impl tests — v1.0
- ✓ QA-01 green suite on Node 20/22/24, Deno 2, Bun latest/1.1 — v1.0
- ✓ QA-02 byte-exact MDK cross-checks recorded as parity dossiers — v1.0
- ✓ AUTHZ-01..05 shared `MarmotAuthorizationProof` envelope primitive in `src/core` (104-byte codec, `created_at` range, x-only signer check, NIP-01 + BIP-340 verify, strict external-signer produce) — v2.0 _(Validated in Phase 6: Shared Authorization-Proof Envelope Primitive)_
- ✓ PROOF-02..06 `0x8009` account identity proof component (kind-450 template/producer on the spec vector, leaf advertisement + single dictionary entry, leaf/KeyPackage/tree validators, wrong-container rejection) — v2.0 _(Validated in Phase 7: Account Identity Proof Component (0x8009) + Legacy Clean Cut)_
- ✓ CUT-01 / CUT-02 legacy `0xf2f1` never emitted, exports removed, and any `0xf2f1`-carrying/requiring KeyPackage, leaf, or group rejected — v2.0 _(Validated in Phase 7: Account Identity Proof Component (0x8009) + Legacy Clean Cut)_
- ✓ GRP-01..04 GroupContext `app_components` requires `0x8009`, `0x8009` data in GroupContext rejected, enforced identically on create, invite, join, inbound, and convergence seams — v2.0 _(Validated in Phase 8: GroupContext Profile Requirement & Legality-Seam Extension)_
- ✓ UPD-01..04 replacement-leaf identity binding (prior-occupant identity preserved, proof bound to the resulting signature key, `0x8009` non-removable from a non-blank leaf, standalone Update re-checked at admission) — v2.0 _(Validated in Phase 9: Self-Update / Replacement-Leaf Identity Binding)_
- ✓ FOUND-01..05 founding group creation via Welcome only (internal founding Add Commit never published, Welcome-only invitee join, per-invitee retryable ack-aware delivery, fail-closed relay-less founding create) — v2.0 _(Validated in Phase 10: Founding Group Creation via Welcome)_
- ✓ QA-04 / QA-05 full suite green on Node 20/22/24, Deno 2, Bun latest/1.1 (CI run 37328779021 on c2f5a12) and exports snapshot reflects the `0x8009` cutover with `0xf2f1` only in the CUT-02 keep set — v2.0 _(Validated in Phase 11: Exports Snapshot & QA Gate)_

### Active

<!-- Hypotheses for the next milestone; refined by /gsd-new-milestone. -->

(None yet — define with `/gsd-new-milestone`.)

### Out of Scope

- Multi-device (MIP-06) — catalogued, deferred to v2 (MDEV-01); orthogonal to single-device wire interop
- Push notifications (MIP-05) — deferred to v2 (PUSH-01); groups must work with zero push
- Implementing the blossom-image (0x8002) codec — Rust reference omits it; documented as unsupported instead
- QUIC transport runtime / broker (agent text streams) — experimental; the 0x8006 durable policy codec is done, the data plane is deliberately absent
- App / tooling crates (marmot-app, cli, forensics, uniffi, concrete storage backends) — not library scope
- App-message NIP-40 expiry semantics — cataloged as deferred by the catchup review
- Legacy `0xf2f1` proof compatibility (reading or joining existing Legacy-profile groups) — v2.0 is a clean cut to the adopted spec, which forbids a v1/legacy fallback
- Published KeyPackage rotation/refresh to retire legacy KeyPackages — not taken on in v2.0; apps republish

## Context

- Both upstreams are vendored under `refs/` and are the source of truth for wire format:
  **`refs/marmot/`** (spec, topic-organized; MIP numbering deprecated) and **`refs/mdk/`**
  (Rust "Marmot Development Kit", currently `accda242`). A standing rule checks both for upstream
  changes at the start of every phase.
- `ts-mls` is a local workspace package and the MLS engine the library builds on.
- Codebase: ~72k lines of TypeScript under `src/`. v1.0 touched 124 `src/` files (+20.7k / −0.75k,
  53 plans); v2.0 touched 138 `src/` files (+19.3k / −2.1k, 27 plans).
- Known technical debt:
  - `maxRewindCommits: Infinity` remains memory-unbounded until `GroupHistoryTree` pruning lands (v1.0)
  - v2.0 items listed in the archived v2.0 audit (see [release follow-ups](RELEASE-FOLLOWUPS.md)) (untested Phase 8 review fixes, Phase 10
    foundingAdd TOCTOU and retry reentrancy, Phase 11 export-guard gaps, `0x8002`/`0x8008`/`0x800b`
    accepted as opaque — looser than MDK)
  - Accepted/deferred review items are recorded in the phase `deferred-items.md` files
  - (Resolved in v2.0: stale `MIP-NN` citations in `src/` rewritten to topic spec paths)
- `SPEC_GAP_REVIEW.md` (repo root) is an older backlog snapshot referenced by example READMEs; keep the path.

## Constraints

- **Tech stack**: ESM TypeScript, `module`/`moduleResolution: NodeNext` — all relative
  imports in `src` need emitted `.js` extensions; named exports only; `Uint8Array` for
  binary/protocol data.
- **Compatibility**: Must interoperate byte-for-byte with the MDK Rust reference; the
  Rust code + spec are the source of truth for wire format.
- **Cross-platform**: Vitest on Node 20/22/24, Deno 2, and Bun (latest/1.1) must all pass;
  no runtime-specific APIs that break the others.
- **Build**: strict TS config fails on unused locals/params and missing returns; `pnpm` with
  `--frozen-lockfile`; `pnpm lint` is prettier-only.
- **Scope discipline**: single-device wire interop; multi-device and push stay deferred until a
  milestone explicitly takes them on.

## Key Decisions

| Decision | Rationale | Outcome |
| --- | --- | --- |
| v1.0 repurposed as "catchup" | The prior v1.0 never shipped and the upstream split moved far ahead, so its phases were shelved to backlog (999.3–999.6) | ✓ Good — shipped a verifiable resync |
| Milestone = resync to post-split marmot spec + MDK Rust | Byte-for-byte parity with the current Rust reference is a verifiable finish line | ✓ Good |
| Review refs first, then close interop-breakers first | Breakers (proof v2, inbound trust, wire boundary) had to land before additive parity | ✓ Good |
| Proof v2 isolated as Phase 1 | Touches identity/credential machinery; headline breaker | ✓ Good — closed in 2 plans |
| Multi-device, push, QUIC data plane, app/tooling deferred | Orthogonal to single-device wire interop | ✓ Good — still valid |
| Insert Phase 03.1 instead of a fourth self-graded review-fix pass | Three review rounds each found blockers in the previous fixes | ✓ Good — 15 planned closures verified |
| Port MDK `OwnCommitConvergenceStamp` rather than patch CR-08/CR-11 incrementally | The Rust reference already had a structural solution to the defect class | ✓ Good — closed in Phase 4 |
| Standing per-phase `refs/` upstream check | 2026-08-06 sweep found submodules 4 and 193 commits behind | ✓ Good — surfaced lifecycle-v1 scope (Phase 04.1) |
| Implement `marmot.group.lifecycle.v1` disbanding in v1.0 (Phase 04.1) | New spec scope sharing the convergence-pass machinery | ✓ Good |
| QA-02 evidence as immutable dossiers bound to one tested source SHA | Byte-exact claims must be reproducible and machine-validated | ✓ Good |
| v2.0 clean cut to proof component `0x8009` (no legacy `0xf2f1` profile) | Adopted spec forbids a v1/legacy fallback; diverges deliberately from MDK's temporary explicit-legacy path | ✓ Good — shipped; out-of-profile groups refuse traffic |
| Centralize the `0x8009` profile check in the shared `validateCommitLegality` adapter (Phase 8) | Defend against the recurring seam-asymmetry (mdk#707) defect class | ✓ Good — 14-test seam-parity matrix |
| Founding create merges the Add locally and sends Welcomes only (MDK `FoundingGroupCreated`) | No founding commit to race on; group is `Stable` immediately | ✓ Good — relay-less invitees fail closed (D-09 reversed) |
| `MarmotAuthorizationProof` as a shared `src/core` primitive | Multi-device join authorization and push owner proofs reuse the same 104-byte envelope | ✓ Good — `0x8009` built on it unchanged; ready for MDEV/PUSH |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):

1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):

1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

_Last updated: 2026-10-05 after v2.0 milestone_
