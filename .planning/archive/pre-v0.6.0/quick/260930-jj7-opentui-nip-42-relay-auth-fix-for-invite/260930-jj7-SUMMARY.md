---
phase: 260930-jj7-opentui-nip-42-relay-auth-fix-for-invite
plan: 01
subsystem: nostr-relay
tags: [nip-42, applesauce-relay, opentui, relay-auth, key-package, nip-65]

requires: []
provides:
  - "autoAuthenticateRelays(pool, signer, log?) — on-demand NIP-42 auto-auth watcher for the shared applesauce RelayPool"
  - "RelayPool wrapper { authSigner } option + request() waitForAuth passthrough"
  - "loadInviteCandidates LOOKUP_RELAYS outbox hints + waitForAuth:false KeyPackage lookup"
affects: [opentui-example, relay-discovery, invite-flow]

tech-stack:
  added: []
  patterns:
    - "On-demand NIP-42 auth: authenticate only after a relay flags auth-required for REQ/EVENT, never on a bare challenge — privacy-preserving default for example clients"
    - "Structural typing over applesauce-relay's Relay/RelayPool (no rxjs import in the example) so bun:test can use hand-rolled fake subjects instead of real sockets"

key-files:
  created:
    - examples/opentui/src/helpers/relay-auth.ts
    - examples/opentui/src/helpers/relay-auth.test.ts
  modified:
    - examples/opentui/src/helpers/relay-pool.ts
    - examples/opentui/src/marmot/setup.ts
    - examples/opentui/src/marmot/controller.ts
    - examples/opentui/README.md

key-decisions:
  - "On-demand (not eager-on-challenge) auto-auth: only authenticate once a relay has refused a REQ/EVENT with auth-required, so relays that merely send a challenge never see the account pubkey"
  - "Kept waitForAuth:false on the invite KeyPackage lookup even with auto-auth wired, since KeyPackages are public and the auth-required flag is per-connection, not per-filter — an unrelated gated REQ (or a rejected auth attempt) must not withhold them"
  - "Stayed local to examples/opentui rather than touching library src/, per user decision: applesauce-relay is expected to add granular auth controls upstream"

requirements-completed: [QUICK-260930-jj7]

coverage:
  - id: D1
    description: "autoAuthenticateRelays answers NIP-42 AUTH only after a relay flags auth-required for REQ or EVENT (never on a bare challenge), at most once per (relay, challenge), and covers relays added to the pool later via add$"
    requirement: "QUICK-260930-jj7"
    verification:
      - kind: unit
        ref: "examples/opentui/src/helpers/relay-auth.test.ts (9 behavior groups, 37 expect() calls)"
        status: pass
      - kind: other
        ref: "live probe against wss://relay.ditto.pub (throwaway script, not committed): authenticated to wss://relay.ditto.pub/ logged, confirming the real applesauce Relay/RelayPool satisfy the helper's structural types end-to-end"
        status: pass
    human_judgment: false
  - id: D2
    description: "RelayPool wrapper starts auto-auth when constructed with authSigner (setup.ts passes account.signer) and unsubscribes it in close() before the pool itself closes; request() forwards an optional waitForAuth"
    requirement: "QUICK-260930-jj7"
    verification:
      - kind: unit
        ref: "cd examples/opentui && pnpm typecheck (proves real applesauce RelayPool/Relay + PrivateKeyAccount signer satisfy AuthWatchablePool/AuthSigner)"
        status: pass
      - kind: other
        ref: "cd examples/opentui && timeout 90 bun run scripts/probe-shutdown.ts — exits 0 on its own after teardown complete, confirming auto-auth adds no residual handles"
        status: pass
    human_judgment: false
  - id: D3
    description: "Invite KeyPackage lookup returns ditto's public KeyPackages even when that socket is flagged auth-required, via LOOKUP_RELAYS outbox hints + waitForAuth:false"
    requirement: "QUICK-260930-jj7"
    verification:
      - kind: other
        ref: "live probe against wss://relay.ditto.pub for pubkey 266815e0c9210dfa324c6cba3573b14bee49da4209a9456f9484e5106cd408a5 (throwaway script, not committed): auto-auth authenticated to the relay, and a waitForAuth:false kind-30443 request returned 5 KeyPackages"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-09-30
status: complete
---

# Quick Task 260930-jj7: OpenTUI NIP-42 Relay Auth Fix for Invite Summary

**Auto-answers NIP-42 AUTH challenges for auth-gated relays (e.g. relay.ditto.pub) and makes the invite KeyPackage lookup resilient to a connection that another subscription has already flagged auth-required.**

## Performance

- **Duration:** ~25 min (includes worktree environment setup: pnpm install, ts-mls submodule init, and library build)
- **Tasks:** 3 completed
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments

- Added `autoAuthenticateRelays` (`examples/opentui/src/helpers/relay-auth.ts`): an on-demand NIP-42 watcher over the shared `applesauce-relay` pool, using structural types (no rxjs import) so tests run against hand-rolled fake subjects — no sockets. Authenticates a relay only after it has demonstrably refused a REQ/EVENT with `auth-required`, at most once per (relay, challenge), and follows `add$`/`remove$` so relays created after startup are covered too.
- Wired the watcher into the opentui `RelayPool` wrapper (`{ authSigner }` constructor option, detached in `close()` before the underlying pool closes) and into `setup.ts` (`authSigner: account.signer`). `RelayPool.request()` now forwards an optional `waitForAuth`.
- Fixed `loadInviteCandidates` in `controller.ts`: invitee NIP-65 outbox discovery now hints `LOOKUP_RELAYS` (mirroring the existing `#loadRelayLists` precedent), and the KeyPackage REQ passes `waitForAuth: false` so an auth-gated connection (flagged by the unrelated kind-1059 gift-wrap subscription) can't withhold public KeyPackages.
- Documented the behavior and its privacy trade-off in the README.

## Task Commits

Each task was committed atomically:

1. **Task 1: autoAuthenticateRelays helper (on-demand NIP-42) with fake-subject tests** - `4f2a8ee` (feat)
2. **Task 2: Wire auto-auth into the RelayPool wrapper + setup; add request waitForAuth option** - `d2d8a80` (feat)
3. **Task 3: loadInviteCandidates LOOKUP_RELAYS hints + waitForAuth-false KeyPackage lookup; README note** - `3aa11ef` (feat, includes Prettier formatting of relay-pool.ts and relay-auth.test.ts per the plan's explicit final step)

_No plan-metadata commit: per this quick task's constraints, SUMMARY.md/STATE.md/PLAN.md are not committed._

## Files Created/Modified

- `examples/opentui/src/helpers/relay-auth.ts` - `autoAuthenticateRelays`, `AuthWatchableRelay`, `AuthWatchablePool`, `Unsubscribable`, `Subscribable<T>` — on-demand NIP-42 auto-auth watcher
- `examples/opentui/src/helpers/relay-auth.test.ts` - 9 behavior-group bun:test suite covering privacy/on-demand gating, dedup, reconnect, add$/remove$ tracking, quiet-failure handling, and teardown
- `examples/opentui/src/helpers/relay-pool.ts` - `RelayPoolOptions { authSigner }`, `#relayAuth` field wired in constructor and torn down in `close()`, `request()` forwards `waitForAuth`
- `examples/opentui/src/marmot/setup.ts` - constructs `RelayPool` with `{ authSigner: account.signer }`
- `examples/opentui/src/marmot/controller.ts` - `loadInviteCandidates` hints `LOOKUP_RELAYS` for outbox discovery and passes `{ waitForAuth: false }` to the KeyPackage `request()`
- `examples/opentui/README.md` - new "Relay authentication (NIP-42)" section documenting the auto-auth behavior and the pubkey-disclosure trade-off

## Decisions Made

- On-demand auto-auth (authenticate only after auth-required is flagged, never on a bare challenge) was the planner's explicit discretion choice for privacy; documented in `relay-auth.ts`'s module doc comment and the README.
- Kept `waitForAuth: false` on the KeyPackage lookup even with auto-auth wired — KeyPackages are public, and the auth-required flag is per relay *connection*, not per filter, so an unrelated gated REQ would otherwise stall this lookup regardless of auto-auth.
- Scope stayed entirely inside `examples/opentui`; no `src/` (library) changes, matching the plan's objective and the user's stated preference to wait for applesauce-relay's own upcoming granular auth controls.

## Deviations from Plan

None — plan executed exactly as written. The one incidental change beyond the plan's explicit file list was Prettier reformatting two already-in-progress files (`relay-pool.ts`, `relay-auth.test.ts`) when Task 3's final instruction ("run Prettier on every file this plan touched") was executed — both files were already on the plan's `files_modified` list, so this is not scope creep, just the plan's own formatting step touching lines written in an earlier task's commit.

## Issues Encountered

- The worktree had no `node_modules` and an uninitialized `ts-mls` submodule (a stray `ts-mls/` directory containing only a leftover `node_modules` from the pnpm workspace install, with no git checkout). Resolved by moving that `node_modules` aside, running `git submodule update --init ts-mls` (which reused the shared `.git/modules/ts-mls` object store), then restoring `node_modules` and running `pnpm build` to vendor `ts-mls` and make `@internet-privacy/marmot-ts` resolvable from `examples/opentui`. This was expected per the dispatch prompt's environment-setup note.
- Ran the optional live network probe from the plan's `<verification>` section using a throwaway, uncommitted script (`tmp-probe-nip42.ts`, deleted immediately after the run — working tree is clean). It confirmed the real fix end-to-end: `autoAuthenticateRelays` logged `authenticated to wss://relay.ditto.pub/`, and a `waitForAuth:false` kind-30443 request for `266815e0c9210dfa324c6cba3573b14bee49da4209a9456f9484e5106cd408a5` returned all 5 expected KeyPackages.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

This is a standalone quick task with no downstream phase dependency. The fix is scoped entirely to `examples/opentui` and is independently verified (unit tests, typecheck, prettier, shutdown probe, and a live network probe against the originally-reported relay). No blockers or concerns carried forward.

---
*Task: 260930-jj7-opentui-nip-42-relay-auth-fix-for-invite*
*Completed: 2026-09-30*

## Self-Check: PASSED

All 7 files (6 code/doc + this SUMMARY) found on disk. All 3 task commits (`4f2a8ee`, `d2d8a80`, `3aa11ef`) confirmed present in `git log`.
