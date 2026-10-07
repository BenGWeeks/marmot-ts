# Phase 10 — Deferred Items

Out-of-scope discoveries logged during plan execution, per the executor's scope-boundary rule
(only auto-fix issues directly caused by the current task's changes; log everything else here
rather than fixing it).

## Pre-existing `pnpm lint` (Prettier) failure — 3 files from plan 10-02

**Discovered during:** 10-04, Task 3 (`pnpm lint` acceptance check)

**Files:**

- `src/client/runtime/group-runtime.ts`
- `src/client/runtime/__tests__/group-runtime.test.ts`
- `src/client/transport/nostr/__tests__/welcome-delivery.test.ts`

**Issue:** `pnpm lint` (`prettier --check .`) reports these three files as not matching Prettier's
expected formatting (a handful of line-wrap-length differences, confirmed via `pnpm format
--write` producing only whitespace/line-break diffs, no logic changes). `git diff HEAD` on each
file is empty before any local edit — the drift is already present in the committed state as of
`ba57071 feat(10-02): per-recipient welcomeDelivery on GroupPublishResult` (10-02's commit that
last touched `group-runtime.ts`), not introduced by 10-03 or 10-04.

**Why not fixed here:** 10-04 is a test-and-docs-only plan (`files_modified` in its frontmatter
names only `src/client/__tests__/founding-create.test.ts`,
`src/__tests__/integration/founding-group-create-join-message.test.ts`,
`docs/client/marmot-client.md`, `docs/client/marmot-group.md`) and its own project notes are
explicit: "Do not change production code under src/ (other than the declared test files)." These
three files are none of the above.

**Recommended fix:** `pnpm format` (repo-wide) will resolve all three in one mechanical,
zero-behavior-change commit. A follow-up `chore(10):` commit (or folded into a later phase's
housekeeping) should apply it so the phase's own `<verification>` block ("`pnpm lint` exits 0")
is satisfied at the phase level, not just per-plan.

**Verified not caused by 10-04:** `pnpm exec prettier --check docs/client/marmot-client.md
docs/client/marmot-group.md src/client/__tests__/founding-create.test.ts
src/__tests__/integration/founding-group-create-join-message.test.ts` — all four files 10-04
actually touches are Prettier-clean.

## Discrepancy: D-09/R-05's relay-less founding-create behavior is more severe than described

**Discovered during:** 10-04, Task 1 (writing the D-09/R-05 relay-less behavioural test)

**Claim in CONTEXT.md `<specifics>`/Pinned expectations and RESEARCH.md "The D-09 footgun,
confirmed precisely":** a relay-less founding create still delivers Welcomes successfully to
invitees who have published their own NIP-65 inbox relays; only invitees without one fail.

**Actual verified behavior:** `createWelcomeRumor()` (`src/core/welcome-event.ts`) unconditionally
throws `"Welcome rumor requires a non-empty relays tag with no empty relay URLs"` whenever the
founding group has no relays — before `NostrWelcomeDelivery.deliver()`'s inbox-relay resolution or
publish step is ever reached. This means a relay-less founding create's Welcome delivery fails for
**every** invitee, unconditionally, regardless of whether that invitee has published their own
inbox relays. RESEARCH.md's analysis considered only `deliver()`'s relay-resolution fallback, not
`createWelcomeRumor()`'s own unconditional non-empty-relays-tag requirement.

**Disposition:** not a code bug — `createWelcomeRumor()`'s requirement is plausibly the *correct*,
spec-motivated behavior (a Welcome that advertises no group relays gives the joiner nowhere useful
to connect for group traffic), but the phase's own planning documents describe the wrong
consequence. `src/client/__tests__/founding-create.test.ts` Test 13 and both `docs/client/*.md`
pages were written/updated to state the verified (100%-failure) behavior, not the CONTEXT/RESEARCH
prediction (partial failure). No production code was changed for this — see the 10-04 SUMMARY.md
"Deviations" section for the full analysis and the option this phase deliberately left open (a
`GroupFactory`-level fail-fast throw when `invitees` is supplied without `relays`, versus the
current silent 100%-Welcome-failure-but-group-still-created behavior).
