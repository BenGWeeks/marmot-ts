# Roadmap: marmot-ts

## Milestones

- v1.0 Catchup — completed 2026-09-11; 53 plans. [Summary](MILESTONES.md).
- v2.0 Account identity proof v2 — completed 2026-10-05; 27 plans, 27/27 requirements. [Summary](MILESTONES.md).
- Next milestone — not yet planned.

## Current Position

Preparing npm v0.6.0. No active implementation phases or unexecuted phase plans.
Milestone versions are planning identifiers, separate from npm package versions.

## Next Action

Review [release follow-ups](RELEASE-FOLLOWUPS.md) before declaring release readiness.
Review [backlog candidates](BACKLOG.md), then use `$gsd-new-milestone` to define the next scope.
See [milestone summary](MILESTONES.md).

## Backlog

Existing candidates retain their details in [BACKLOG.md](BACKLOG.md).

### Phase 999.1: Group image display and update (BACKLOG)

See [backlog candidates](BACKLOG.md) for preserved context; re-scope before promotion.

### Phase 999.2: Documentation review before release (BACKLOG)

See [backlog candidates](BACKLOG.md) for preserved context; re-scope before promotion.

### Phase 999.3: Exhaustive protocol gap audit (BACKLOG)

See [backlog candidates](BACKLOG.md) for preserved context; re-scope before promotion.

### Phase 999.4: Blocker and security closure (BACKLOG)

See [backlog candidates](BACKLOG.md) for preserved context; re-scope before promotion.

### Phase 999.5: Wire conformance and docs (BACKLOG)

See [backlog candidates](BACKLOG.md) for preserved context; re-scope before promotion.

### Phase 999.6: Runtime and reference quality gate (BACKLOG)

See [backlog candidates](BACKLOG.md) for preserved context; re-scope before promotion.

### Phase 999.7: Invite-only client without KeyPackage identifier (BACKLOG)

See [backlog candidates](BACKLOG.md) for preserved context; re-scope before promotion.

### Phase 999.8: Protocol and client review follow-ups (BACKLOG)

**Goal:** Review and address the protocol and client findings captured below.
**Requirements:** TBD
**Plans:** 0 plans
**Captured:** 2026-10-08
**Source:** User capture following [quick task 261008-ecl](quick/261008-ecl-docs-hero-image-removal-and-protocol-acc/261008-ecl-SUMMARY.md).

These are captured findings for future validation and planning. The Welcome admin
check is explicitly unconfirmed. Capture does not resolve the existing release findings.

1. **Last-resort marker:** The marker uses legacy extension `0x000a`; the spec and
   MDK use component `0x0004`. Migrate the representation to the adopted component.
2. **KeyPackage relay tag:** Kind `30443` events carry a `relays` tag absent from
   the spec; MDK checks that it is absent. `rotate()` reads the tag back, so replace
   that dependency when removing the tag.
3. **Consumed KeyPackage private material:** Joining marks the used KeyPackage but
   does not delete its private key, although the spec requires deletion.
   `rotate()` already deletes it; align the join path with the required cleanup.
4. **Client identity validation and comments:** `clientId` is accepted without
   validation. Code comments still suggest a device label, and the
   `convergencePolicy` comment still suggests `Infinity`. Review validation and
   correct the guidance.
5. **Multiple extra proposals:** `extraProposals` cannot accept builders returning
   several proposals because the engine stores the entire array as one proposal.
   Decide whether to flatten results in the engine or change the type.
6. **Live ingestion serialization:** `groups.connect()` starts a new `ingest()` run
   for each live event. Runs may overlap and violate the requirement to drain one
   batch fully before starting another. Serialize the live ingestion path.
7. **Fork invalidation and history removal:** `connect()` hides fork-invalidation
   results, and history has no way to remove a message. Expose the invalidation
   results and provide a way to reconcile removed messages in history.
8. **Welcome admin authorization — unconfirmed:** Investigate whether joining
   verifies that the Welcome author is an active admin. Confirm the current
   behavior against `protocol-core/joining.md` before deciding on a fix.
9. **Smaller API and retention follow-ups:**
   - `marmotAuthService` is not exported; review its intended public surface.
   - Messages in groups with retention enabled receive no NIP-40 `expiration` tag.
   - `watch()` cannot be cancelled until the next update arrives; support prompt
     cancellation.

Plans:

- [ ] TBD (promote with `$gsd-review-backlog` when ready)
