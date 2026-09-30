---
phase: 260930-gpe-opentui-relay-list-guard-for-group-creat
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - examples/opentui/src/marmot/relay-lists.ts
  - examples/opentui/src/marmot/relay-lists.test.ts
  - examples/opentui/src/marmot/controller.ts
  - examples/opentui/src/components/ModalHost.tsx
  - examples/opentui/src/components/RelaysModal.tsx
  - examples/opentui/src/components/App.tsx
  - examples/opentui/README.md
autonomous: true
requirements: [QUICK-260930-gpe]

must_haves:
  truths:
    - "R1: when the account's outbox list (kind 10002) is empty (never loaded, discovery failed, or lost) the new-group relay prompt offers only manual entry plus a path into the relay editor; it never offers the account's outbox relays as a choice"
    - "R1: createGroup has no implicit relay default — an empty relay list (after normalisation) throws an error that names manual entry and the r relay editor"
    - "R2: a relay-list discovery pass that ends with either list empty is NOT memoised; the next caller that needs relays (KeyPackage publish/rotate, startup KeyPackage path, profile save, new-group prompt) runs discovery again"
    - "R3: publishKeyPackage, rotateKeyPackage and the startup fresh-KeyPackage path publish only when BOTH the 10002 outbox and 10050 inbox lists are known, and publish to the outbox relays; otherwise they log which list is missing and open the relay editor instead of publishing to bootstrap relays or throwing an opaque error"
    - "R3: an outbox list found without a 10050 inbox list is surfaced as a warning (welcomes cannot reach the account) and blocks KeyPackage publish the same way a missing outbox does"
    - "R3: saving relay lists while the account holds no unused KeyPackage publishes a fresh KeyPackage to the newly saved outbox relays"
    - "Own-account relay-list discovery includes LOOKUP_RELAYS in its relay hints, so lists hosted only on whitenoise / purplepag.es resolve inside Directory's 10 s window"
  artifacts:
    - path: "examples/opentui/src/marmot/relay-lists.ts"
      provides: "Pure helpers: RelayListStatus type, deriveRelayListStatus, relayListsComplete, describeRelayListGap, groupRelayChoices"
      exports: ["RelayListStatus", "GroupRelayChoice", "deriveRelayListStatus", "relayListsComplete", "describeRelayListGap", "groupRelayChoices"]
    - path: "examples/opentui/src/marmot/relay-lists.test.ts"
      provides: "bun:test coverage for status derivation and new-group choice construction"
    - path: "examples/opentui/src/marmot/controller.ts"
      provides: "Non-memoised-when-incomplete discovery, KeyPackage relay guard, relaySetupRequest + relayListStatus snapshot fields, refreshRelayLists()"
      contains: "relaySetupRequest"
    - path: "examples/opentui/src/components/ModalHost.tsx"
      provides: "new-group prompt built from groupRelayChoices; relays modal setup mode"
      contains: "groupRelayChoices"
    - path: "examples/opentui/src/components/App.tsx"
      provides: "Opens the relays modal when snapshot.relaySetupRequest increases"
      contains: "relaySetupRequest"
  key_links:
    - from: "examples/opentui/src/components/ModalHost.tsx"
      to: "examples/opentui/src/marmot/relay-lists.ts"
      via: "groupRelayChoices(outboxRelays, relayListStatus) drives the new-relays ChoicePrompt options and onSelect dispatch"
      pattern: "groupRelayChoices\\("
    - from: "examples/opentui/src/marmot/controller.ts"
      to: "examples/opentui/src/components/App.tsx"
      via: "ChatSnapshot.relaySetupRequest counter -> useEffect -> setModal({ kind: 'relays', setup: true })"
      pattern: "relaySetupRequest"
    - from: "examples/opentui/src/marmot/controller.ts"
      to: "examples/opentui/src/helpers/discovery.ts"
      via: "#loadRelayLists passes relaySet(bootstrap, LOOKUP_RELAYS) as hints to Directory.outboxes / welcomeInboxes"
      pattern: "LOOKUP_RELAYS"
---

<objective>
Stop the opentui example from memoising an empty relay-list discovery, from offering (or silently using) an empty "outbox" relay set for new groups, and from publishing KeyPackages without the account's 10002 outbox and 10050 inbox lists in place. When lists are missing, the user is routed into the existing relay editor (RelaysModal / saveRelayLists) instead of getting an opaque error.

Purpose: Verified root cause (debug.log + live relay queries, 2026-09-30). The account's 10002/10050 events live only on relay.us.whitenoise.chat / relay.ditto.pub / purplepag.es. Discovery via bootstrap relays (damus failing, nos.lol flapping) exceeded Directory's 10 s `$first` window and returned []. `#ensureRelayListsLoaded` then memoised that empty result for the rest of the session. The results: invites listened on the bootstrap fallback, KeyPackage publish/rotate failed with "no outbox relays configured", and the new-group modal offered an empty default that threw "group needs at least one relay".

Output: a new pure helper module with bun tests, plus controller, ModalHost, RelaysModal, App and README changes. Scope is limited to examples/opentui; no library `src/` changes.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@examples/opentui/src/marmot/controller.ts
@examples/opentui/src/components/ModalHost.tsx
@examples/opentui/src/helpers/discovery.ts

<interfaces>
<!-- Extracted from the codebase so the executor does not need to explore. -->

controller.ts, current relevant members (line numbers are approximate):
- L12  `import { relaySet } from "applesauce-core/helpers/relays";`
- L56  `import type { Directory } from "../helpers/discovery.js";` (type-only today; LOOKUP_RELAYS is a value export of the same module)
- L122 module-private `normalizeRelays(relays: string[]): string[]` (normalizeRelayUrl + relaySet, drops invalid)
- L490 `export interface ChatSnapshot { ... outboxRelays: string[]; inboxRelays: string[]; keyPackages: KeyPackageSummary; ... busy: boolean; audit: AuditStatus }`
- L588 `#outboxRelays: string[] = []`, L590 `#inboxRelays: string[] = []`
- L595 a boolean memo field set true after the first discovery pass regardless of result; L598 `#relayListsPromise?: Promise<void>`
- L707 `start()`: awaits `#ensureKeyPackage()`, then `#restoreGroups()`, `connectAll`, `#relistenInvites()`, then `void this.#ensureRelayListsLoaded().catch(...)`
- L763 `async createGroup(name: string, relays = <outbox default>)` wrapped in `#withBusy`, throws "group needs at least one relay" when normalised list is empty
- L1263 `publishKeyPackage()` / L1274 `rotateKeyPackage()`: both call `#requirePublishRelays()` (throws when outbox empty)
- L1300 `saveRelayLists(outbox, inbox)`: validates both non-empty, publishes 10002 + 10050 to `relaySet(nextOutbox, this.#outboxRelays)`, adopts them, sets the memo flag true, relistens invites if the inbox changed
- L1382 `#withBusy(fn)`: sets busy, runs fn, catches and logs errors via `logError`
- L1402 `#ensureRelayListsLoaded()`: shares `#relayListsPromise`; on success sets the memo flag true (even when both lists came back empty); on failure clears the promise
- L1426 `#requirePublishRelays()`: outbox-only guard used by saveProfile / KeyPackage publish
- L1438 `#loadRelayLists()`: `Promise.all([directory.outboxes(pubkey, this.#relays), directory.welcomeInboxes(pubkey, this.#relays)])`, adopts non-empty results, relistens invites on inbox change, `#publish()`
- L1493 `#ensureKeyPackage()`: returns early if an unused KeyPackage exists; else awaits discovery, warns + returns when outbox empty, else `keyPackages.create({ relays })`
- L1641 `#relistenInvites()`: `client.invites.listen(relaySet(this.#inboxRelays))` (RelayPool falls back to bootstrap relays when the list is empty)
- L1990 `#buildSnapshot()`: builds ChatSnapshot from private fields
- `log(text, level: "info" | "warn" | "error")`, `logError(err)`, `#publish()` (rebuild snapshot + notify)

discovery.ts:
- `export const LOOKUP_RELAYS = ["wss://relay.us.whitenoise.chat", "wss://relay.eu.whitenoise.chat", "wss://purplepag.es", "wss://index.hzrd149.com"]`
- `Directory.outboxes(pubkey, hints?)`, `Directory.welcomeInboxes(pubkey, hints?)` → `string[]` ([] on 10 s timeout)
- applesauce address loader order: cache → relay hints on pointer → extraRelays (bootstrap) → lookupRelays. Hints are therefore queried BEFORE the bootstrap/lookup fallback chain.

ModalHost.tsx:
- `Modal` union includes `{ kind: "new" }`, `{ kind: "new-relays"; name }`, `{ kind: "new-manual-relays"; name }`, `{ kind: "relays" }`, `{ kind: "keypkg" }`
- `const { me, outboxRelays, inboxRelays, keyPackages } = useChat();`
- `ChoicePrompt` props: `{ title; options: SelectOption[] /* {name, description} */; onSelect(index: number); onCancel() }`
- `RelaysModal` props: `{ outbox: string[]; inbox: string[]; onSave(outbox, inbox); onCancel() }`. It renders FormModal with the hard-coded title "edit relay lists".

App.tsx: `AppContent` owns `const [modal, setModal] = useState<Modal>(null)`; already imports `useEffect`, `useRef`; `useController()` in scope; `useChat` is exported from `../hooks/use-marmot.js`.

use-app-keybindings.ts checks `modal?.kind === "relays"` only (adding an optional field to that variant is compatible).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pure relay-list helpers + bun tests (status derivation, gap text, new-group choices)</name>
  <files>examples/opentui/src/marmot/relay-lists.ts, examples/opentui/src/marmot/relay-lists.test.ts</files>
  <behavior>
    - deriveRelayListStatus({ outbox: ["wss://a"], inbox: ["wss://b"], inFlight: true, attempted: false }) === "ready" (both lists known always wins)
    - deriveRelayListStatus({ outbox: [], inbox: [], inFlight: false, attempted: false }) === "loading" (discovery not yet run)
    - deriveRelayListStatus({ outbox: [], inbox: [], inFlight: true, attempted: true }) === "loading" (re-attempt in flight)
    - deriveRelayListStatus({ outbox: [], inbox: ["wss://b"], inFlight: false, attempted: true }) === "missing-outbox"
    - deriveRelayListStatus({ outbox: ["wss://a"], inbox: [], inFlight: false, attempted: true }) === "missing-inbox"
    - relayListsComplete(["wss://a"], []) === false; relayListsComplete(["wss://a"], ["wss://b"]) === true
    - describeRelayListGap("ready") and describeRelayListGap("loading") return null; "missing-outbox" returns text containing "10002"; "missing-inbox" returns text containing "10050"
    - groupRelayChoices([], s) for every status s returns kinds ["manual", "setup"] (never "outbox")
    - groupRelayChoices(["wss://a", "wss://b"], "ready") returns kinds ["outbox", "manual"]; the outbox choice description lists both relays
    - groupRelayChoices(["wss://a"], "missing-inbox") still offers "outbox" first (group relays do not depend on the 10050 list)
  </behavior>
  <action>
Create examples/opentui/src/marmot/relay-lists.ts. It is a pure module: no imports from controller.ts, no I/O, named exports only, and a JSDoc on every export in the style of discovery.ts. It holds the decision logic for R1/R2/R3 so it can be unit-tested without a live controller.

Exports:
- `RelayListStatus`: string-literal union "loading" | "missing-outbox" | "missing-inbox" | "ready".
- `relayListsComplete(outbox: string[], inbox: string[]): boolean`: true only when both arrays are non-empty.
- `deriveRelayListStatus(input: { outbox: string[]; inbox: string[]; inFlight: boolean; attempted: boolean }): RelayListStatus`. Rules in order: complete → "ready"; inFlight or not yet attempted → "loading"; outbox empty → "missing-outbox"; otherwise "missing-inbox".
- `describeRelayListGap(status: RelayListStatus): string | null`. Returns null for "ready" and "loading". For "missing-outbox", a one-line sentence saying no outbox relay list (kind 10002) was found for this account. For "missing-inbox", a one-line sentence saying an outbox list was found but no inbox relay list (kind 10050), so invites (welcomes) cannot reach the account. The controller reuses this text in its warn log lines.
- `GroupRelayChoice`: `{ kind: "outbox" | "manual" | "setup"; name: string; description: string }`.
- `groupRelayChoices(outbox: string[], status: RelayListStatus): GroupRelayChoice[]` (per R1). When outbox is non-empty, return two choices. First: kind "outbox", name "Use my outbox relays", description = outbox joined with ", ". Second: kind "manual", name "Enter relays manually", description "space or comma separated relay URLs/domains" (the existing wording). When outbox is empty, return two choices. First: the same "manual" choice. Second: kind "setup", name "Set up my relay lists". Its description depends on status: when status is "loading", say discovery is still running and the user can set the lists now; otherwise say no outbox relays were found and this opens the relay editor. Never return an "outbox" choice for an empty outbox, whatever the status.

Create examples/opentui/src/marmot/relay-lists.test.ts with `bun:test` (`describe`/`test`/`expect`, the same style as src/helpers/discovery.test.ts). It covers every case in the behavior block. Import from "./relay-lists.js". Assert on `choices.map((c) => c.kind)` for the choice tests.

RED first: write the test file and confirm `bun test src/marmot/relay-lists.test.ts` fails because the module does not exist yet. GREEN: implement the module until the tests pass.
  </action>
  <verify>
    <automated>cd examples/opentui && bun test src/marmot/relay-lists.test.ts</automated>
  </verify>
  <done>relay-lists.ts exports RelayListStatus, GroupRelayChoice, relayListsComplete, deriveRelayListStatus, describeRelayListGap, and groupRelayChoices. All behavior cases pass under bun test, and no choice list for an empty outbox contains kind "outbox".</done>
</task>

<task type="auto">
  <name>Task 2: Controller — non-memoised incomplete discovery, lookup-relay hints, KeyPackage relay guard, setup request signal, explicit createGroup relays</name>
  <files>examples/opentui/src/marmot/controller.ts</files>
  <action>
All edits are in examples/opentui/src/marmot/controller.ts. Keep native `#` private fields, named exports, and the existing JSDoc density. Update any JSDoc that describes the old "exactly once" memo behaviour.

(a) Imports. Change the type-only discovery import to a mixed import that brings in the `LOOKUP_RELAYS` value alongside `type Directory`. Import `deriveRelayListStatus`, `describeRelayListGap`, `relayListsComplete` and `type RelayListStatus` from "./relay-lists.js".

(b) Snapshot fields. Add two fields to `ChatSnapshot`, each with a JSDoc line:
- `relayListStatus: RelayListStatus`: the discovery state of the account's 10002/10050 lists.
- `relaySetupRequest: number`: a counter that increments each time the controller needs the user to set up relay lists. The UI opens the relay editor when it increases; 0 means never requested.
In `#buildSnapshot`, fill `relayListStatus` from `deriveRelayListStatus` with `outbox: this.#outboxRelays`, `inbox: this.#inboxRelays`, `inFlight: this.#relayListsPromise !== undefined` and `attempted: this.#relayListsAttempted`. Fill `relaySetupRequest` from a new private counter.

(c) Memo state (R2). Delete the existing boolean "loaded" memo field that is declared beside `#relayListsPromise`, along with every assignment to it. Add three private fields:
- `#relayListsAttempted = false`: at least one discovery pass has settled.
- `#relayListsAuthoritative = false`: the user saved lists this session, so a stale discovery pass must not overwrite them.
- `#relaySetupRequest = 0`.

(d) Rewrite `#ensureRelayListsLoaded()` (R2):
- Return immediately when `relayListsComplete(this.#outboxRelays, this.#inboxRelays)`. Memoisation is now "both lists known", never "a pass ran".
- Otherwise, reuse an in-flight `#relayListsPromise` if one exists, or start a new pass with `#loadRelayLists()` and call `#publish()` right away so the snapshot shows "loading".
- When the pass settles, whether it succeeds or fails: clear `#relayListsPromise`, set `#relayListsAttempted = true`, and call `#publish()`. Rethrow any error so callers still see it.
An empty or partial result therefore leaves the lists incomplete, and the next caller runs discovery again.

(e) `#loadRelayLists()`:
- Build `const hints = relaySet(this.#relays, LOOKUP_RELAYS)` and pass it to both `this.#directory.outboxes` and `this.#directory.welcomeInboxes` in place of the bootstrap-only list. This is my discretion, and it targets the verified root cause: own-account lists live only on whitenoise, ditto and purplepag.es. The applesauce address loader queries pointer hints before its extras→lookup fallback, so the 10 s `$first` window is no longer spent waiting on dead bootstrap relays.
- Log an info line at the start of each pass (e.g. "looking up your relay lists (kind 10002 / 10050)…") so re-attempts are visible.
- After the lookups, return without adopting anything if `#watchAbort` or `#relayListsAuthoritative` is set.
- Keep the existing adopt-when-non-empty, inbox-changed relisten, and "loaded your advertised relay lists" logic.
- Afterwards, compute the gap with `describeRelayListGap(deriveRelayListStatus({ outbox, inbox, inFlight: false, attempted: true }))` using the adopted fields. If it is non-null, log it at "warn" level with the suffix " — press r to set up your relay lists". This surfaces a found-outbox / missing-10050 state per R3.

(f) Add a private `#requestRelaySetup(reason: string): void`. It logs `${reason} — opening the relay editor` at "warn", increments `#relaySetupRequest`, and calls `#publish()`. It is a no-op when `#watchAbort` is set.

(g) Add a private `async #requireKeyPackageRelays(): Promise<string[] | null>` (R3). It awaits `#ensureRelayListsLoaded()` and returns null if `#watchAbort`. If the lists are still incomplete, it derives the status (settled, attempted true) and calls `#requestRelaySetup` with the `describeRelayListGap` text plus " — set up your relay lists before publishing a KeyPackage", then returns null. Otherwise it returns `relaySet(this.#outboxRelays)`, so KeyPackages go to the outbox; the library writes those same relays into the KeyPackage relays tag.
- `publishKeyPackage()`: replace `#requirePublishRelays()` with `#requireKeyPackageRelays()`. When it returns null, return from the `#withBusy` callback without throwing, so the user is routed to setup instead of seeing an error line.
- `rotateKeyPackage()`: the same replacement. Keep the existing "no KeyPackage to rotate" check ahead of it.
- `#ensureKeyPackage()` (startup path): replace the manual outbox-only check and its warn log with `#requireKeyPackageRelays()`. On null, return; the setup request has already been logged and signalled. Keep the early return when an unused KeyPackage exists, and keep the `#watchAbort` checks.
- Leave `#requirePublishRelays()` (profile save) as an outbox-only guard. It now re-attempts discovery automatically through (d); update its JSDoc accordingly.

(h) `saveRelayLists()`:
- Where the old code set the memo flag, set `#relayListsAuthoritative = true` instead.
- After the success log line and still inside the `#withBusy` callback, `await this.#ensureKeyPackage()`. It is idempotent: it returns early when an unused KeyPackage exists. So a startup that skipped the fresh-KeyPackage publish for missing relays now publishes to the newly saved outbox (R3). Nothing re-enters `#withBusy`, since `#ensureKeyPackage` does not use it.

(i) createGroup (R1): remove the default value from the `relays` parameter, so the signature is `createGroup(name: string, relays: string[])` and callers must choose relays explicitly. Keep the normalise-then-throw guard. Change its message to "group needs at least one relay — enter relays manually, or press r to set up your relay lists".

(j) Add a public `async refreshRelayLists(): Promise<void>`. It awaits `#ensureRelayListsLoaded()` inside try/catch and passes errors to `logError` unless `#watchAbort` is set. It does NOT use `#withBusy`, because it is a background re-attempt that the new-group prompt fires.

Do not touch any library `src/` file. Do not change `start()` ordering. Its background `#ensureRelayListsLoaded()` call stays, and it now surfaces incompleteness through the warn in (e).
  </action>
  <verify>
    <automated>cd examples/opentui && pnpm typecheck && grep -c '#relayListsLoaded' src/marmot/controller.ts | grep -qx 0 && grep -c 'relays = this.#outboxRelays' src/marmot/controller.ts | grep -qx 0 && grep -q 'LOOKUP_RELAYS' src/marmot/controller.ts && test "$(grep -c 'requireKeyPackageRelays' src/marmot/controller.ts)" -ge 4 && grep -q 'relaySetupRequest' src/marmot/controller.ts && grep -q 'refreshRelayLists' src/marmot/controller.ts && bun test</automated>
  </verify>
  <done>typecheck passes. The old boolean memo field is gone, and discovery is memoised only when both lists are non-empty. #loadRelayLists passes bootstrap+LOOKUP_RELAYS hints. publish, rotate and the startup KeyPackage path all go through #requireKeyPackageRelays, which requests relay setup rather than throwing or publishing to bootstrap relays. createGroup has no relay default. saveRelayLists runs #ensureKeyPackage afterwards. ChatSnapshot exposes relayListStatus and relaySetupRequest, and bun test still passes.</done>
</task>

<task type="auto">
  <name>Task 3: UI wiring — new-group choices without empty default, auto-open relay editor on setup request, README note</name>
  <files>examples/opentui/src/components/ModalHost.tsx, examples/opentui/src/components/RelaysModal.tsx, examples/opentui/src/components/App.tsx, examples/opentui/README.md</files>
  <action>
ModalHost.tsx (R1):
- Change the `relays` variant of the `Modal` union to `{ kind: "relays"; setup?: boolean }`.
- Destructure `relayListStatus` from `useChat()` as well.
- In the "new" case's onSubmit: when the trimmed name is non-empty and `outboxRelays.length === 0`, also fire `void controller.refreshRelayLists()` before switching to "new-relays". That re-attempts discovery (R2), and the prompt re-renders with the outbox choice once lists arrive.
- Rewrite the "new-relays" case to compute `const choices = groupRelayChoices(outboxRelays, relayListStatus)` (import from "../marmot/relay-lists.js"). Pass `choices.map(({ name, description }) => ({ name, description }))` as the ChoicePrompt options. In onSelect, look up `choices[index]` and dispatch on its `kind`:
  - "outbox" → `setModal(null)` then `void controller.createGroup(modal.name, outboxRelays)`.
  - "manual" → `setModal({ kind: "new-manual-relays", name: modal.name })`.
  - "setup" → `setModal({ kind: "relays", setup: true })`.
  - A missing entry is a no-op.
  This replaces the existing hard-coded index-0 default-outbox option and its "none loaded" fallback description entirely.
- In the "relays" case, pass `title={modal.setup ? "set up your relay lists" : undefined}` to RelaysModal.

RelaysModal.tsx: add an optional `title?: string` prop and pass `props.title ?? "edit relay lists"` to FormModal's title. Nothing else changes.

App.tsx (R3 routing): in `AppContent`, read `relaySetupRequest` from `useChat()` (import `useChat` from "../hooks/use-marmot.js" next to `useController`). Keep a `useRef(0)` holding the last handled request. Add a `useEffect` keyed on `[relaySetupRequest, modal]`: when `relaySetupRequest` is greater than the ref and `modal === null`, store the new value in the ref and call `setModal({ kind: "relays", setup: true })`. If another modal is open, the request stays pending until that modal closes, so an in-progress form is never clobbered. The KeyPackage modal already closes itself before calling publish/rotate, so those flows open the editor immediately. Add a short comment explaining the counter handshake.

README.md: in the "Managing your relays" section, after the paragraph that starts "After the UI is ready, the app loads whatever you've already published…", add one short paragraph covering four points:
- If discovery finds no lists (or only the outbox list), the app does not treat that as final and retries the next time you create a group or publish or rotate a KeyPackage.
- Publishing or rotating a KeyPackage requires both lists, and opens the Relays editor when either is missing.
- The new-group prompt offers "Use my outbox relays" only when the outbox list is known; otherwise it offers manual entry or relay setup.
- Saving your lists publishes a fresh KeyPackage if you have none.

Then run `pnpm exec prettier --write` from the repo root on all seven touched files, per CLAUDE.md, since there is no pre-commit hook.
  </action>
  <verify>
    <automated>cd examples/opentui && pnpm typecheck && bun test && grep -c 'Use default outbox relays' src/components/ModalHost.tsx | grep -qx 0 && grep -q 'groupRelayChoices(' src/components/ModalHost.tsx && grep -q 'relaySetupRequest' src/components/App.tsx && cd ../.. && pnpm exec prettier --check examples/opentui/src/marmot/relay-lists.ts examples/opentui/src/marmot/relay-lists.test.ts examples/opentui/src/marmot/controller.ts examples/opentui/src/components/ModalHost.tsx examples/opentui/src/components/RelaysModal.tsx examples/opentui/src/components/App.tsx examples/opentui/README.md</automated>
  </verify>
  <done>The new-group prompt is built from groupRelayChoices and never offers an outbox choice for an empty outbox; with none, it offers manual entry plus "Set up my relay lists". A controller setup request opens the relays modal titled "set up your relay lists" once no other modal is open. The README documents the retry, the KeyPackage guard and the new-group behaviour. typecheck, bun test and the prettier check all pass.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Nostr relays → controller | Relay-list events (kinds 10002/10050) come from untrusted relays (bootstrap + LOOKUP_RELAYS) |
| User input → controller | Relay URLs typed into the new-group prompt and the relay editor |
| Controller → Nostr relays | KeyPackages (kind 30443), relay lists and the profile are published to relays the account controls |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-gpe-01 | Information Disclosure | publishKeyPackage / rotateKeyPackage / #ensureKeyPackage | medium | mitigate | #requireKeyPackageRelays publishes only to the account's own discovered or saved 10002 outbox, never to bootstrap defaults (RelayPool's empty-list fallback is never reached because an empty outbox returns null before publish) |
| T-gpe-02 | Spoofing | #loadRelayLists relay-list events from LOOKUP_RELAYS | low | accept | Events are author-bound to the account pubkey. The applesauce EventStore / loader filter by kind+pubkey and verify signatures, so adding lookup relays as hints widens the sources but not what is trusted |
| T-gpe-03 | Denial of Service | repeated discovery on every relay-needing action | low | accept | Each pass is bounded by Directory's 10 s `$first` timeout and shares one in-flight promise, so concurrent callers never stack passes |
| T-gpe-04 | Tampering | createGroup with user-typed relays | low | mitigate | The existing normalizeRelays (normalizeRelayUrl + relaySet) drops invalid URLs, and an empty result throws. No implicit default relay list remains |
</threat_model>

<verification>
- `cd examples/opentui && pnpm typecheck` passes.
- `cd examples/opentui && bun test` passes: the 4 existing discovery tests plus the new relay-lists tests.
- `pnpm exec prettier --check` passes on all touched files (repo root).
- Code read of controller.ts confirms that `#ensureRelayListsLoaded` returns early only when `relayListsComplete(...)` is true, and that the settle handler clears `#relayListsPromise` on both success and failure.
- Manual smoke (optional, needs live relays): start `bun run src/index.tsx` for an account whose lists live only on whitenoise. The status log shows "looking up your relay lists…" and then "loaded your advertised relay lists"; the new-group prompt shows "Use my outbox relays" with real URLs. With no lists published, K → publish opens "set up your relay lists" instead of logging an error.
</verification>

<success_criteria>
- R1: an empty outbox never yields an outbox choice or a silent default. createGroup requires explicit relays and throws a clear message when they are empty.
- R2: incomplete discovery (either list empty) is never memoised, and later actions re-run it.
- R3: KeyPackage publish, rotate and the startup path require both 10002 and 10050, publish to the outbox, and otherwise route the user into the relay editor. A missing 10050 alone is surfaced and blocks the same way. Saving lists with no unused KeyPackage publishes one.
- Only examples/opentui files are changed. Each task is committed on master, with files staged by explicit path only (no `git add -A` / `.`).
</success_criteria>

## Source Coverage Audit

| Source | Item | Covered by |
|--------|------|-----------|
| GOAL | Relay-list guard for group create and KeyPackage publish/rotate | Tasks 1-3 |
| REQ | R1: no "use outbox" option when the outbox is empty; createGroup has no empty default | Task 1 (groupRelayChoices), Task 2 (i), Task 3 (ModalHost) |
| REQ | R2: do not memoise empty/incomplete discovery; later actions re-attempt | Task 2 (c)(d)(j), Task 3 (refreshRelayLists on new-group) |
| REQ | R3: KeyPackage create/publish/rotate require 10002 + 10050; route to relay setup when missing | Task 2 (f)(g)(h), Task 3 (App.tsx effect, RelaysModal setup title) |
| REQ | R3: startup #ensureKeyPackage path | Task 2 (g) + (h) resume after save |
| REQ | R3: surface outbox-found / 10050-missing | Task 1 (describeRelayListGap), Task 2 (e) warn + (g) block |
| DIAGNOSIS | 10 s `$first` timeout exceeded because own lists live only on lookup relays | Task 2 (e): LOOKUP_RELAYS in hints (discretion) |
| CONSTRAINT | Scope limited to examples/opentui; typecheck + bun test + prettier; commit on master with explicit paths | All tasks, verification, success_criteria |

<output>
Create `.planning/quick/260930-gpe-opentui-relay-list-guard-for-group-creat/260930-gpe-SUMMARY.md` when done
</output>
