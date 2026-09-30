---
phase: 260930-gpe-opentui-relay-list-guard-for-group-creat
plan: 01
subsystem: examples/opentui
tags: [opentui, relays, nip-65, key-package, discovery]
status: complete
dependency-graph:
  requires: []
  provides:
    - "examples/opentui/src/marmot/relay-lists.ts (pure relay-list status/choice helpers)"
  affects:
    - examples/opentui/src/marmot/controller.ts
    - examples/opentui/src/components/ModalHost.tsx
    - examples/opentui/src/components/RelaysModal.tsx
    - examples/opentui/src/components/App.tsx
tech-stack:
  added: []
  patterns:
    - "Pure decision-logic module (relay-lists.ts) kept free of controller/I-O imports so it unit-tests without a live controller"
    - "Counter-based UI handshake (relaySetupRequest) instead of a boolean flag, so a ref-tracked 'last handled value' can distinguish new requests from already-serviced ones"
key-files:
  created:
    - examples/opentui/src/marmot/relay-lists.ts
    - examples/opentui/src/marmot/relay-lists.test.ts
  modified:
    - examples/opentui/src/marmot/controller.ts
    - examples/opentui/src/components/ModalHost.tsx
    - examples/opentui/src/components/RelaysModal.tsx
    - examples/opentui/src/components/App.tsx
    - examples/opentui/README.md
decisions:
  - "Kept #requirePublishRelays() (profile save) as an outbox-only guard per the plan; it now re-attempts discovery automatically as a side effect of #ensureRelayListsLoaded's R2 fix, without its own code change beyond the JSDoc"
  - "#loadRelayLists refuses to adopt results when #relayListsAuthoritative is set (a saved list wins over a stale in-flight discovery pass), matching the plan's discretion-level wording literally"
  - "gap text in #requireKeyPackageRelays falls back to a generic 'relay lists are incomplete' string only in the type-theoretically unreachable case describeRelayListGap returns null for a non-complete, non-loading status — kept for type safety, never expected to fire"
metrics:
  duration: ~35min
  completed: 2026-09-30
---

# Quick Task 260930-gpe: OpenTUI Relay-List Guard For Group Create/KeyPackage Publish Summary

Fixed opentui's memoised-empty relay discovery and unguarded KeyPackage/new-group relay
defaults by adding a pure relay-list decision module, rewriting the controller's discovery
memoisation to require both lists (not just "a pass ran"), gating KeyPackage publish/rotate/
startup on both 10002+10050, and wiring the new-group prompt and a relay-setup-request signal
into the UI.

## What Was Built

**`examples/opentui/src/marmot/relay-lists.ts`** (new) — pure, no-I/O module exporting:
- `RelayListStatus` ("loading" | "missing-outbox" | "missing-inbox" | "ready")
- `relayListsComplete(outbox, inbox)` — true only when both non-empty
- `deriveRelayListStatus({ outbox, inbox, inFlight, attempted })` — the single source of truth
  for discovery state
- `describeRelayListGap(status)` — one-line gap text reused by both controller warn logs and
  (indirectly, via the setup choice) the UI
- `groupRelayChoices(outbox, status)` — builds the new-group relay prompt's options; **never**
  returns an "outbox" choice for an empty outbox list, for any status

**`examples/opentui/src/marmot/controller.ts`** (rewritten discovery/guard logic):
- `#ensureRelayListsLoaded()` now memoises only on `relayListsComplete(...)` — an empty or
  partial discovery pass is never treated as final; the in-flight promise's `.finally()` clears
  itself and marks `#relayListsAttempted = true` on both success and failure, rethrowing errors
  naturally.
- `#loadRelayLists()` passes `relaySet(this.#relays, LOOKUP_RELAYS)` as hints to both
  `directory.outboxes` and `directory.welcomeInboxes` (root cause fix — own-account lists
  hosted only on whitenoise/purplepag.es were timing out against bootstrap-only hints). It also
  refuses to adopt results once `#relayListsAuthoritative` is set, and logs
  `describeRelayListGap(...)` as a warning when the settled pass leaves a gap.
- New `#requestRelaySetup(reason)` increments `#relaySetupRequest` and logs a warning.
- New `#requireKeyPackageRelays()` awaits discovery, and returns `null` (after requesting setup)
  unless both lists are known; otherwise returns the outbox relay set.
  `publishKeyPackage()`, `rotateKeyPackage()`, and `#ensureKeyPackage()` (the startup path) all
  route through it instead of the old outbox-only `#requirePublishRelays()` guard (which remains,
  narrowed to profile-save use).
- `createGroup(name, relays)` dropped its `= this.#outboxRelays` default; an empty normalised
  list throws a message naming manual entry and the relay editor.
- `saveRelayLists()` sets `#relayListsAuthoritative = true` (renamed from the old
  `#relayListsLoaded` memo flag) and calls `await this.#ensureKeyPackage()` afterwards, so saving
  fresh lists with no unused KeyPackage publishes one immediately.
- New public `refreshRelayLists()` — a non-`#withBusy` background re-attempt for UI callers.
- `ChatSnapshot` gained `relayListStatus` and `relaySetupRequest` fields, filled in
  `#buildSnapshot()`.

**UI wiring:**
- `ModalHost.tsx`'s `new-relays` case is now built from `groupRelayChoices(outboxRelays,
  relayListStatus)`, dispatching on each choice's `kind` ("outbox" / "manual" / "setup")
  instead of a hard-coded index-0 default. Submitting a group name with an empty outbox also
  fires `controller.refreshRelayLists()` in the background.
- `RelaysModal.tsx` takes an optional `title` prop (defaults to "edit relay lists").
- `App.tsx` tracks the last-handled `relaySetupRequest` value in a ref and opens
  `{ kind: "relays", setup: true }` when the counter advances and no other modal is open.
- `README.md`'s "Managing your relays" section documents the retry-on-incomplete-discovery
  behavior, the KeyPackage relay guard, and the new-group prompt's outbox-conditional choice.

## Verification

- `cd examples/opentui && pnpm typecheck` — clean (both before Task 2/3 edits as a baseline, and
  after).
- `cd examples/opentui && bun test` — 21 pass / 0 fail across 2 files (4 pre-existing discovery
  tests + 17 new relay-lists tests).
- `pnpm exec prettier --check` on all seven touched files — passes.
- Code read confirms `#ensureRelayListsLoaded` returns early only on `relayListsComplete(...)`,
  and its settle handler (`.finally()`) unconditionally clears `#relayListsPromise` and sets
  `#relayListsAttempted = true` on both success and failure paths.
- Manual live-relay smoke was not run (would require a real account with lists hosted only on
  whitenoise per the plan's "optional" note); the fix directly addresses the documented root
  cause (10s `$first` timeout against bootstrap-only hints) and is covered by the automated
  gates above.

## Environment Notes (not deviations, but worth recording)

The worktree had no `node_modules` and the `ts-mls` git submodule was uninitialized (present
only as an empty `node_modules`-containing directory from a prior pnpm run). Neither is a code
change: `pnpm install --frozen-lockfile --offline` populated dependencies, and
`git submodule update --init ts-mls` (after temporarily relocating its stray `node_modules`)
populated the fork from the already-fetched `.git/modules/ts-mls` object store — no network
clone of the submodule content was actually needed. `pnpm build` then vendored the fork so
`examples/opentui`'s `workspace:*` dependency on `@internet-privacy/marmot-ts` resolved. This
was purely local environment setup to run the plan's verification gates; no `src/` library code
was touched, matching the plan's scope boundary.

## Deviations from Plan

None — plan executed as written. All four tasks' automated verification gates (typecheck, bun
test, targeted greps, prettier --check) passed as specified.

## Self-Check: PASSED

- FOUND: examples/opentui/src/marmot/relay-lists.ts
- FOUND: examples/opentui/src/marmot/relay-lists.test.ts
- FOUND: examples/opentui/src/marmot/controller.ts (modified)
- FOUND: examples/opentui/src/components/ModalHost.tsx (modified)
- FOUND: examples/opentui/src/components/RelaysModal.tsx (modified)
- FOUND: examples/opentui/src/components/App.tsx (modified)
- FOUND: examples/opentui/README.md (modified)
- Commit 8943c0a (test): present in `git log --oneline`
- Commit e58ce0f (feat, relay-lists.ts): present in `git log --oneline`
- Commit 6d83753 (feat, controller.ts): present in `git log --oneline`
- Commit c1c2999 (feat, UI wiring): present in `git log --oneline`
