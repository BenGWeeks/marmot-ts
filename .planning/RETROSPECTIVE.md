# Project Retrospective

## Milestone: v2.1 — Protocol hardening and group images

**Completed:** 2026-10-09 | **Phases:** 2 | **Plans:** 17

### What Was Built

Conformant KeyPackage/Welcome lifecycle, ordered proposals, serialized ingestion, durable history retractions and retention envelopes; encrypted image read/upload/replace/clear with strict metadata and guarded existing MLS operations.

### What Worked

Independent review and real asynchronous interleavings found cache ownership, cancellation and Welcome-admission gaps that the initial green suite missed. Cross-phase revalidation preserved earlier lifecycle guarantees; 23/23 requirements and eight end-to-end flows passed.

### What Was Inefficient

Repeated foreground handoffs and reports increased elapsed time. The optional window ledger and summary-stat parser required explicit bookkeeping corrections. Test-source and TypeDoc baseline debt remained visible instead of being mistaken for clean typing.

### Patterns Established and Key Lessons

- Registering a supported component requires all admission paths, including tentative Welcome validation, to decode it.
- Retain private copies before asynchronous policy checks; cache eviction may wipe only cache-owned bytes.
- Carry operation lifetime through queue, crypto preparation and immediate publication admission; preserve outcomes once publication begins.
- Revalidate earlier phases after shared code changes and use the owning fingerprint/status CLI.
- Separate development milestone completion from package release readiness.

### Cost Observations

Exact session counts/model cost are unavailable. Existing focused and full evidence was reused when no source change justified another run. No cost percentages are inferred.

## Cross-Milestone Trends

| Milestone | Tests | Requirement coverage | Process lesson |
| --- | --- | --- | --- |
| v2.1 | 1,874 / 122 files | 23/23 | Real race and full-admission matrices complement green suites |

Historical follow-ups remain individually tracked; one milestone's green verification does not waive them.
