# Milestones

## v2.1 Protocol hardening and group images (Shipped: 2026-10-09)

**Delivered:** Conformant protocol/client lifecycle and verified encrypted group-image retrieval, upload, replacement and clear through guarded MLS operations.

**Phases completed:** 12–13; 2 phases, 17 plans, 40 task declarations, 23/23 requirements.

**Key accomplishments:**

- Authenticated complete Welcome validation and restart-safe KeyPackage retirement, routes and rotation.
- Ordered proposal builders, full-drain serialized connections and cancellable watches.
- Durable whole-batch history retractions and immutable source-epoch retention envelopes.
- Strict image metadata/crypto, URL-first source projection and explicit bounded Blossom transport.
- Parent-authorized image mutations, independently owned cache reads and cancellation through preparation/publication.
- Independent cross-phase validation, including malformed image Welcome rejection before any adoption effects.

**Validation:** 1,874 tests / 122 files; build/docs/lint and fresh packed Node/Bun/Deno consumers passed. Requirements 23/23, integration 15/15, flows 8/8. Both verification owners were current passed immediately before archival.

**Stats:** 93 production/docs/example files changed; +13,468/−574 lines across the development range `d39d079..34436eb`; 2026-10-08 → 2026-10-09. Task count uses all 40 PLAN task declarations (the SDK summary parser undercounted 9).

**Closeout:** Requirements and behavior verified. Retained debt approved by the user for later work. Artifact closeout records 2 newly acknowledged deferred entries, 0 carried forward; no requirement or behavior gap was waived. See RELEASE-FOLLOWUPS.md.

**Retained debt:** 246 expanded test-source diagnostics, 54 TypeDoc warnings, optional WINDOWS ledger repair, and individually undispositioned historical release follow-ups. This milestone is separate from npm v0.6.0 and does not publish a package.

**Archive:** [Roadmap](milestones/v2.1-ROADMAP.md), [requirements](milestones/v2.1-REQUIREMENTS.md).

**Next:** Select the next milestone; debt cleanup remains deferred.

---

| Milestone | Completed | Phases | Plans | Tasks | Requirements |
| --- | --- | --- | --- | --- | --- |
| v1.0 Catchup | 2026-09-11 | 7 | 53 | 113 | 16/16 |
| v2.0 Account identity proof v2 | 2026-10-05 | 6 | 27 | 66 | 27/27 |

v1.0 delivered protocol catchup, inbound validation, convergence, disbanding,
MDK conformance vectors, and the runtime QA matrix. Its historical closeout records
passed phase verification and an explicit decision to proceed without a milestone audit.

v2.0 delivered the shared authorization-proof envelope, adopted `0x8009` component,
legacy clean cut, group profile enforcement, replacement-leaf identity binding,
Welcome-only founding creation, and exports/runtime QA. Its milestone audit passed.
No v2.0 git tag was created: milestone versions differ from npm versions.

Completed workflow artifacts have been removed. Outstanding findings remain
in [release follow-ups](RELEASE-FOLLOWUPS.md); cleanup does not mark them resolved.
