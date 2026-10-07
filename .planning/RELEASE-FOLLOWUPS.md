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

## Backlog to re-scope

See [BACKLOG.md](BACKLOG.md); historical context has been removed. Group-image 999.1 has
contradictory 3/3-complete and TBD markers, with no matching plan/summary evidence in
its directory; re-evaluate before promotion. Documentation review (999.2), invite-only
mode (999.7), and shelved audit/closure 999.3–999.6 remain candidates, not active phases.
Re-check them against current code and upstream references before planning.
The original v1.0 deferred items (memory retention, removal-marker and tombstone
convergence follow-ups) remain candidates for re-evaluation.
