# Follow-ups carried into npm v0.6.0 preparation

Planning cleanup on 2026-10-07 removed completed historical artifacts. It did not fix,
retest, waive, or obtain owner sign-off for code findings. Milestone v2.0 is a GSD
milestone identifier, distinct from npm v0.6.0. Release readiness still requires
current checks and an explicit disposition of applicable findings.

Retained findings from previous reviews are summarized below.

## Release review

- Phase 10 WR-06: foundingAdd state guard TOCTOU; WR-02: Welcome retry reentrancy.
- Phase 8 W-01: WR-01/02/03 regression coverage remains debt, despite passed verification.
- Phase 11 WR-01..05: public export/package guards, smoke dependency assumptions,
  and last_resort spec divergence. See the milestone audit for full details.
- Phase 9 D-09-01: replay may permanently defer non-member-sender commits.
  D-09-07: an unidentified failure did not reproduce in 14 runs; retain as observation.
  D-09-08: convergence acceptance contract still warrants owner review.
- Phase 10 deferred formatting finding and older export snapshot findings need current
  verification before being called fixed. Historical green QA does not replace release checks.
- Changelog follow-up updated 2026-10-07: changesets were consolidated into Unreleased
  and Changesets tooling removed (completed quick task 261007-m2r). A version-specific
  0.6.0 entry remains part of release preparation.

Sources: previous v2.0 milestone audit, Phase 9 deferred items, and window ledger.
These historical workflow artifacts have been removed; this summary retains their findings.

## Historical ledger disposition

The old window ledger contained nine open entries. Entries 2–9 describe
implemented deviations or administrative repairs, not newly demonstrated release defects.
Entry 1 is an old snapshot verification concern; later QA is recorded as green but this
cleanup did not rerun it. The active ledger was reset for future work; none of these
historical entries was silently marked fixed or waived. GSD's active gate therefore no
longer represents this historical release-review list.

## Selected scope and backlog disposition

Group-image support (formerly 999.1) and protocol/client review follow-ups
(formerly 999.8) were delivered as Phases 13 and 12 in v2.1. The older unsupported
3/3 completion claim was superseded by the verified v2.1 requirement outcomes.

The user removed the unpromoted candidates 999.2–999.7 on 2026-10-08.
See [ROADMAP.md](ROADMAP.md) for selected scope and [BACKLOG.md](BACKLOG.md) for disposition.

The original v1.0 deferred items (memory retention, removal-marker and tombstone
convergence follow-ups) remain candidates for re-evaluation.

## Phase 12 evidence and preserved boundaries

The historical finding-disposition ledger recovered all nine selected finding groups and subitems from `be2f307`. It recorded
new fixes, tested existing protections and explicit deferrals. Historical integrated commands, versions and outcomes were recorded in Plan 12-08;
the retained [milestone summary](milestones/v2.1-ROADMAP.md) preserves the final results.
These checks support the exercised surfaces; they do not waive unrelated release findings
or replace phase-wide verification and owner decisions.

- **Phase 11 last-resort divergence overlap resolved:** canonical empty-data `0x0004`
  generation/classification and legacy-only rejection are covered by
  Plan 12-02.
  MDK's legacy read fallback is an intentional, approved compatibility difference.
  This resolves only that named part of the Phase 11 WR-01..05 aggregate above.
  Other export/package guard and smoke dependency assumptions remain tracked;
  passing current exports/packed consumers certifies their assertions, not every
  historical guard or adversarial dependency assumption.
- **Selected connection/history/retention API findings resolved:** serialized
  full-drain connections and cancellation (12-05),
  strict restart-capable losing-message attribution and durable history removal
  (12-06),
  source-epoch expiration and immutable signed retries
  (12-04),
  and public auth policy/migration docs
  (12-07).
  They do not resolve the older Phase 9 replay/acceptance findings or Phase 10
  foundingAdd TOCTOU/Welcome retry reentrancy without specific regression evidence.
- **Production Infinity advice corrected; broader pruning remains open:**
  Plan 12-08
  documents the existing finite profile-1 horizon and confines Infinity to explicit
  debugging/forensics. That horizon does not guarantee pruning every full-history
  tree, delivery record or plaintext rumor. Comprehensive memory/tree retention,
  removal-marker and tombstone follow-ups remain outside the selected correction.
- **PublicMessage classifier/order-helper limitation remains open:** the original
  quick review additionally found `isCommitMessage` / `isProposalMessage` limited
  to PrivateMessage, and `sortGroupCommits` uses epoch zero for other formats
  (`src/core/group-message-classify.ts`). The engine's wire support and green export
  snapshots do not prove these convenience helpers support PublicMessage; no
  selected requirement redesigned them.
- **Test-source typing and broader API documentation debt remain open:**
  ordinary configured TypeScript checks exclude tests. Plan 12-06's explicit audit
  with exclusions removed measured baseline 245/current 245/added 0 diagnostics.
  Current runtime tests and production compilation are separate evidence.
  TypeDoc currently reports 54 warnings and 0 errors; no clean baseline or
  warning-by-warning comparison establishes their origin or resolution.

Every original release-review bullet above is preserved. The old snapshot concern,
Phase 8 regression debt, unidentified Phase 9 observation, older formatting/export
findings, npm-version changelog preparation and unselected scope still require
individual disposition before release readiness is declared.


## v2.1 closeout — 2026-10-09

Both selected phases are complete: 23/23 requirements verified, 1,874 tests and current build/docs/lint/packed consumers passed. The user approved proceeding with debt for later cleanup. See the [milestone validation summary](milestones/v2.1-ROADMAP.md).

- Retain 246 expanded test-source diagnostics (no additions), 54 TypeDoc warnings and the optional WINDOWS table/JSON format mismatch. Earlier per-plan diagnostic counts are historical observations; 246 is the final same-compiler baseline comparison.
- Preserve individually undispositioned historical release findings and explicit PublicMessage classifier/tree-pruning deferrals.
- Review and integration findings introduced during v2.1 were fixed and rechecked, including private cache-reader ownership, operation cancellation through actual preparation/publication and strict optional/required image Welcome decoding before adoption or private-material retirement.
- Detailed phase reports, research, reviews and raw logs were removed on 2026-10-09. Their original records remain in Git history; the retained milestone summary records historical validation, not new runtime checks or release readiness.

## Compatibility and recovery boundaries retained from v2.1

- Canonical last-resort 0x0004 is emitted and accepted; MDK legacy-marker read fallback remains an intentional approved difference.
- Publication routes are local/configured, and stable slots must be 64 lowercase hex characters. Custom history backends require durable idempotent removal; absent ingestion/rewind persistence limits attribution to a session.
- Adoption receipts and KeyPackage stores are separate, not atomic; a crash can defer single-use secret retirement until recovery. Authenticated received-state admin validation does not prove intended-group first-contact continuity.
- Retention preserves the original signed wrap-time outer timestamp; MDK additionally binds it to the inner timestamp. General plaintext expiry enforcement remains deferred.
- Clearing image metadata does not delete remote blobs or revoke disclosed upload credentials. Endpoint/contact/resource policy is application configuration, separate from component validity.

Completed quick tasks retained by outcome: next-tag release script repaired (`4400c4c`); docs hero removal and accuracy review (`fb0008b`); nine review finding groups captured (`be2f307`); scope promoted (`e49f1b9`); unselected 999.2–999.7 removed (`19efb5d`); v2.1 initialized (`d39d079`). Selected findings were fixed, verified as existing protections or explicitly deferred above. The removal of their artifacts does not resolve historical debt.
