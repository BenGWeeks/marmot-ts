# Phase 11: Exports Snapshot & QA Gate - Research

**Researched:** 2026-09-28
**Domain:** Repo hygiene / QA gate verification (no new protocol behavior) — exports-surface auditing, cross-runtime test-suite verification, stale-reference cleanup, upstream reference review
**Confidence:** HIGH (every claim below is either a direct tool/command result captured in this session or a direct file:line read; nothing is drawn from training-data guesses about this codebase)

## Summary

This phase closes milestone v2.0. It adds no new protocol code; it verifies two things are true
(QA-04: six-runtime green suite; QA-05: exports snapshot reflects the v2 surface) and performs the
hygiene chores CONTEXT.md locked (D-08 Prettier, D-09 refs/mdk bump + review, D-10 MIP citation
rewrite). All ten decisions (D-01..D-10) were investigated directly against the live repo this
session — grepping, reading source, and *running* every gate command named in the phase
description, not just reading about them.

**The single most important finding:** `bash scripts/package-smoke/run.sh` (part of the D-06 gate)
**currently fails** on a real regression: `scripts/package-smoke/smoke.mjs` still calls
`generateKeyPackage({ credential, ciphersuiteImpl: impl })` without a `signer`, a call shape that
Phase 7 (07-02) made invalid — `generateKeyPackage` has required a `signer: AuthorizationProofSigner`
since the `0x8009` cutover. This is not a runtime-specific flake; it is a script that was never
migrated when the API changed, and it is exactly the kind of gap the QA-04 gate exists to catch. A
plan for this phase MUST include a task to fix `smoke.mjs` before QA-04's "green on six runtimes
plus build/lint/package-smoke" claim (D-06) can be true. Everything else in the gate is already
green: `pnpm vitest run` / `deno run … npm:vitest run` / `bun run vitest run` each report
**115 files, 1292 tests, 0 failures, 0 skipped**; `pnpm conformance:extended` passes; `pnpm build`
passes; `pnpm lint` (Prettier) **already passes with zero diffs** — meaning D-08's "fix the Prettier
drift" has no remaining work (it was silently fixed by commit `92bbdb8` during Phase 10, after the
`10-CONTEXT.md`/deferred-items.md entry was written). The D-09 upstream `refs/mdk` review (41
pinned commits) found no contradiction with shipped v2.0 behavior — the two commits that touch
`cgka-engine` are pure v5-audit instrumentation with zero wire/validation changes.

**Primary recommendation:** Structure Phase 11 as four independent, narrowly-scoped commits per
CONTEXT.md's own discretion note (chores separate from QA work): (1) a `fix` commit for the
package-smoke signer bug, discovered by this research, not named in CONTEXT.md but required for
D-06 to be true; (2) the QA-05 exports-snapshot work (D-02/D-03/D-04, plus the six stale
dead-pointer comments this research found); (3) the three chores (D-08 is a no-op verify-only step
now — confirm-and-skip; D-09 submodule bump — orchestrator performs this, not the plan; D-10 MIP
rewrite); (4) a verification pass that re-runs the full six-runtime + build + lint + package-smoke
gate and records the evidence D-05 asks for.

## Architectural Responsibility Map

This phase touches no runtime architecture — it is a test/export/documentation hygiene pass. For
completeness, the capabilities it verifies map as follows:

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Public export surface (`package.json` `exports`, barrel files) | Library (root `src/*/index.ts`) | — | The barrels are the only place export identity is decided; this phase adds snapshot tests, it does not move code between tiers |
| Cross-runtime test execution | CI (`.github/workflows/tests.yml`) | Local (Node/Deno/Bun installed on this machine) | CI is the authority per D-05; local runs are pre-flight evidence |
| Packed-tarball consumer smoke | `scripts/package-smoke/` (build-time / release-time check) | — | Simulates what a real downstream `npm install` sees; currently broken (see Summary) |
| Legacy-proof dead-code detection (D-01/D-02) | Library (`src/core/components/account-identity-proof.ts`) + test-time guard | — | Detection logic already lives in the current module; the new guard is a test-only addition |

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01: Remove only dead or misleading references.** `0xf2f1` must stay where it is part of the
  CUT-02 clean-cut rejection path:
  - the private `LEGACY_ACCOUNT_IDENTITY_PROOF_EXTENSION_TYPE` constant and the reject branches in
    `src/core/components/account-identity-proof.ts`;
  - the negative-case tests across the ~11 test files that assert legacy leaves, KeyPackages and
    groups are rejected;
  - the `docs/client/best-practices.md:76` note that legacy groups must be recreated.

  "Stale" means any of these:
  - a public export that names or carries the legacy extension;
  - a dead code path or unused helper;
  - a comment or doc that presents `0xf2f1` as supported or current;
  - a comment that points to a module that no longer exists. For example, check the
    `../account-identity-proof.js` reference at `account-identity-proof.ts:16`.

  *Rejected:* removing every mention (replacing the literal and rewriting the negative tests adds
  churn with no behavior gain and weakens the rejection tests).

- **D-02: Guard the export surface mechanically.** Add a test assertion that no public export on any
  subpath has a legacy-proof name, and that no exported constant equals `0xf2f1`. A literal-string
  grep is not enough, so the guard catches regressions.

- **D-03: Snapshot every public subpath except `./mls`.** Keep the existing root inline snapshot in
  `src/__tests__/exports.test.ts`. Add inline key-list snapshots for `./client`, `./core`,
  `./engine`, `./extra`, `./utils` and `./audit` (and the `./extra/audit/node` entry if it can be
  imported safely under every test runtime).
  - `./extra/audit/browser` may be skipped if it needs browser globals.
  - `./mls` is excluded because it re-exports all of ts-mls, which is noise and not our surface.
  - Snapshots import from the source barrels, the same way the existing root test does.

  The goal is to catch a legacy export leaking through a subpath, not just the root.

- **D-04: Review the snapshot diff.** Before accepting the updated snapshots, check them against
  Phases 6–10:
  - the Phase 6 envelope exports are present (`AUTHORIZATION_PROOF_*`, `AuthorizationProofError`);
  - the Phase 7 component exports are present (`ACCOUNT_IDENTITY_PROOF_COMPONENT*`,
    `AccountIdentityProofError`);
  - the legacy `0xf2f1` proof exports are absent.

  Record the reviewed diff in the plan summary.

- **D-05: Local runs plus CI.**
  - **Local:** run `pnpm vitest run` on the local Node, run
    `deno run -A --node-modules-dir=auto npm:vitest run`, and run `bun run vitest run` on Bun latest.
    All three are installed; local Node is v26.
  - **CI:** the GitHub Actions matrix is the authority for Node 20/22/24 and Bun 1.1. The verification
    report records both local and CI evidence (run IDs / links).
  - A runtime-specific failure is fixed in this phase if it is small. Otherwise it is escalated, not
    skipped or marked `.skip`.

- **D-06: The gate also includes `pnpm build`, `pnpm lint` and the package smoke.** The milestone is
  "shippable", so the verification must also pass three checks:
  - `pnpm build` (strict TS plus the vendor guard);
  - `pnpm lint` (Prettier);
  - `bash scripts/package-smoke/run.sh` after the build.

- **D-07: Phase renamed** to "Exports Snapshot & QA Gate" (ROADMAP.md and STATE.md already updated).
- **D-08: Fix the Prettier drift.** Run `pnpm format` repo-wide as its own `chore(11):` commit. It
  covers the three files Phase 10 deferred (`src/client/runtime/group-runtime.ts`,
  `src/client/runtime/__tests__/group-runtime.test.ts`,
  `src/client/transport/nostr/__tests__/welcome-delivery.test.ts`) plus anything else. The commit
  must contain whitespace and line-break changes only.
- **D-09: Bump `refs/mdk`** (41 commits behind `origin/HEAD` as of 2026-09-28; `refs/marmot` is
  current).
  - Review the diffs first for anything touching account-identity proof, `0x8009`, the
    GroupContext profile, founding creation or the Welcome wire format.
  - Record the findings in the phase research.
  - Fast-forward and commit as its own `chore(refs):` commit.
  - If upstream contradicts shipped v2.0 behavior, surface it to the user. Do not silently fix it.
- **D-10: Rewrite the stale `MIP-NN` citations** in `src/` (~26 occurrences) to the new
  topic-organized spec paths under `refs/marmot/{foundation,protocol-core,app-components,transports,features}/`,
  using `refs/marmot/mip-coverage.md` as the map. This is comment-only work with no code-behavior
  change, in its own commit.

### Claude's Discretion

- How to structure the per-subpath snapshot tests (one `describe` per subpath, or a table-driven
  loop).
- The exact mechanism of the D-02 legacy-export guard.
- The plan and wave breakdown and commit granularity, as long as the chores (D-08, D-09, D-10) stay
  in separate commits from the QA work.

### Deferred Ideas (OUT OF SCOPE)

- **QA-03**: a Rust-signed MDK Current-profile `0x8009` KeyPackage fixture. It was dropped from v2.0
  and is tracked in REQUIREMENTS.md Future Requirements. Do not build it or a substitute interop
  fixture in this phase.
- Phase 10 open question: should `GroupFactory` fail fast when `invitees` is given without `relays`?
  Currently a silent 100% Welcome failure. See Phase 10 `deferred-items.md`. Not in scope here.
- The existing pinned Rust fixtures in `src/__tests__/fixtures/` (`key-package-lifetime-rust.json`,
  `key-package-tags-rust.json`, `safe-aad-rust.json`) are untouched by this phase.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| QA-04 | The full suite is green on Node 20/22/24, Deno 2, and Bun latest/1.1 | Local baseline confirmed green on Node v26, Deno 2.9.6, Bun 1.3.14 (115/115 files, 1292/1292 tests each) plus `pnpm conformance:extended` green. `pnpm build` green. `pnpm lint` green (zero diff). **`bash scripts/package-smoke/run.sh` FAILS** — root cause isolated to `scripts/package-smoke/smoke.mjs:42`, fix direction documented below. CI matrix (`.github/workflows/tests.yml`, `build.yml`) documented verbatim; `gh run list` access path documented (default remote is nostr-based, needs `--repo marmot-protocol/marmot-ts`). |
| QA-05 | The public exports snapshot reflects the removed legacy proof exports and the added envelope/component exports, with no stale `0xf2f1` references remaining | Full D-01 stale-reference audit table below (6 stale comments found, all in one cluster: dead pointers to the Phase-7-deleted `src/core/account-identity-proof.ts`). D-02 guard design proposed. D-03/D-04: every subpath's current export list captured and reviewed against Phase 6/7 names; `./extra/audit/node` and `./extra/audit/browser` **both** confirmed safely importable under Node, Deno, and Bun (CONTEXT.md's "may be skipped" caveat for browser does not apply — it has no top-level browser-global access). |

</phase_requirements>

## Package Legitimacy Audit

Not applicable — this phase installs no new external packages. It touches only existing source,
tests, docs, and the `refs/mdk` submodule pointer (a repo-internal dependency, not an npm/PyPI/crates
package).

## D-01: `0xf2f1` / Legacy-Reference Inventory

Source of the removed-export list: `.planning/phases/07-account-identity-proof-component-0x8009-legacy-clean-cut/07-07-SUMMARY.md`,
coverage item D2 — the 15 legacy runtime exports removed in `ef756c8`: `ACCOUNT_IDENTITY_PROOF_EVENT_KIND`,
`ACCOUNT_IDENTITY_PROOF_EXTENSION_TYPE`, `accountIdentityProofEventId`, `accountIdentityProofEventJson`,
`accountIdentityProofSignatureFromSignedEvent`, `accountIdentityProofSigningDigest`,
`buildAccountIdentityProofEvent`, `buildAccountIdentityProofExtension`, `decodeAccountIdentityProof`,
`encodeAccountIdentityProof`, `makeAccountIdentityProofExtension`, `mlsSignatureScheme`,
`signAccountIdentityProof`, `verifyAllLeafAccountIdentityProofs`, `verifyLeafAccountIdentityProof`.
`[VERIFIED: git log ef756c8, 07-07-SUMMARY.md coverage D2, re-confirmed absent in current
src/__tests__/exports.test.ts inline snapshot this session]`

Full repo grep this session (`grep -rn -i -E "0xf2f1|f2f1|62193" src/ docs/ README.md CHANGELOG.md
.changeset/ examples/`) — no `62193` (decimal) literal anywhere; no legacy symbol name anywhere;
zero hits in `examples/`; zero hits in `CHANGELOG.md`. `[VERIFIED: grep, this session]`

| File:line | Snippet | Disposition | Proposed fix |
|---|---|---|---|
| `src/core/__tests__/group.test.ts:136` | `expect(required!.extensionData.extensionTypes.includes(0xf2f1)).toBe(false)` | **KEEP** — CUT-02 negative assertion | none |
| `src/core/__tests__/darkmatter-invite-compat.test.ts:36,72,98,107,130` | comment context + `const LEGACY_ACCOUNT_IDENTITY_PROOF_EXTENSION_TYPE = 0xf2f1` + rejection assertions | Line 72 is **STALE** (dead pointer, see below); lines 36/98/107/130 **KEEP** (negative assertions) | Line 72: rewrite comment, see below |
| `src/core/__tests__/capabilities.test.ts:22,25,125,142,152,160` | comment + local const + 3 negative assertions | Line 22 is **STALE**; lines 25/125/142/152/160 **KEEP** | Line 22: rewrite comment |
| `docs/client/best-practices.md:76` | "Groups whose `GroupContext` still requires the legacy `0xf2f1` proof extension … must be recreated." | **KEEP** — explicit CONTEXT.md instruction | none |
| `src/client/__tests__/join-account-identity-proof.test.ts:54,56,260,264,272,294` | comment + local const + GRP-03 mixed-profile rejection test | Line 54 references the legacy extension by hex only (no dead path) — **KEEP**; 56/260/264/272/294 **KEEP** | none |
| `src/core/__tests__/key-package.test.ts:44,47,92,124` | comment + local const + 2 assertions | Line 44 is **STALE**; 47/92/124 **KEEP** | Line 44: rewrite comment |
| `src/core/components/account-identity-proof.ts:16` | module docstring: `"...custom LeafNode extension (`0xf2f1`, `../account-identity-proof.js`), which this module does not import from or modify."` | **STALE** — dead pointer. `../account-identity-proof.js` resolves (relative to `src/core/components/`) to `src/core/account-identity-proof.js`, which was deleted outright in Phase 7 (`git log` shows `ef756c8 feat(07-07): delete legacy 0xf2f1 module...`; `test ! -e src/core/account-identity-proof.ts` passes). A reader following this "path" finds nothing. | Rewrite to describe the module as deleted (e.g. "the legacy … extension, whose module was deleted in Phase 7 (`ef756c8`)"), not as a resolvable relative import path |
| `src/core/components/account-identity-proof.ts:69` | doc comment: `"...re-homed verbatim from the verified legacy table (`../account-identity-proof.js`'s `MLS_SIGNATURE_SCHEME_BY_CIPHERSUITE`)..."` | **STALE** — same dead-pointer pattern | Same fix pattern — describe provenance without presenting a resolvable path |
| `src/core/components/account-identity-proof.ts:235` | doc comment: `"...(`../account-identity-proof.js`). Not exported: CUT-01 forbids any legacy export from this module..."` | **STALE** — same dead-pointer pattern | Same fix pattern |
| `src/core/components/account-identity-proof.ts:238,361-372,499-534,559-592,619-704` | `LEGACY_ACCOUNT_IDENTITY_PROOF_EXTENSION_TYPE` constant + every reject branch that uses it | **KEEP** — this is the live CUT-02 detection/rejection logic (private, never exported) | none |
| `src/core/components/__tests__/account-identity-proof.test.ts:346,348,531,544,782,869,876` | fixture builder + 4 rejection assertions | **KEEP** — negative-case tests | none |
| `src/engine/__tests__/group-engine.test.ts:415,420` | `"rejects an Add whose leaf carries only legacy 0xf2f1 material"` | **KEEP** | none |
| `src/client/__tests__/unsupported-profile-groups.test.ts:49,51,96,110` | comment + local const + mixed-profile group builder | **KEEP** (comment at 49 references the hex only, no dead path) | none |
| `src/client/__tests__/key-package-manager.test.ts:71,88` | comment + fixture extension | **KEEP** | none |
| `src/client/group/proposals/__tests__/invite-user.test.ts:139,147` | rejection test | **KEEP** | none |
| `src/client/group/__tests__/marmot-group.test.ts:740,742` | rejection test | **KEEP** | none |
| `.changeset/account-identity-proof-v2.md` (8 `0xf2f1` mentions) | Pending, **unreleased** major-version changeset (present in `.changeset/`, not yet folded into `CHANGELOG.md` — `package.json` is already `0.6.0` but `CHANGELOG.md`'s newest entry is `0.5.1`, confirming a pending release) | **KEEP** — every mention is present-tense-accurate ("is neither emitted nor accepted anywhere", "throws `AccountIdentityProofError`", lists the 15 removed exports) | none. When this changeset is eventually consumed into `CHANGELOG.md` by the release workflow, the resulting entry is historical and must never be rewritten even though it will describe something no longer present |
| `CHANGELOG.md` | — | **N/A — zero occurrences currently.** The account-identity-proof-v2 changeset has not yet been released. `[VERIFIED: grep -n -i -E "0xf2f1|legacy" CHANGELOG.md — only two unrelated hits about kind-443/legacy decryption fallback from prior (v1) releases, both correctly historical]` | none |

**Total: 6 STALE comments, all in one cluster** (dead pointers to the Phase-7-deleted
`src/core/account-identity-proof.ts`, referenced as `../account-identity-proof.js` from three
different files). All other `0xf2f1` references across the ~11 test files plus
`account-identity-proof.ts`'s own rejection logic are live CUT-02 machinery and must not be touched,
matching CONTEXT.md's explicit "~11 test files" figure exactly.

**Additional non-`0xf2f1` observation (adjacent, same D-10 comment-hygiene spirit, not itself
`0xf2f1`):** `src/core/default-capabilities.ts:14,19` still says *"According to MIP-01, key packages
MUST signal support for the **Marmot Group Data Extension** and ratchet_tree..."* — "Marmot Group
Data Extension" is the pre-split monolithic MIP-01 extension name; per `refs/marmot/mip-coverage.md`'s
field-split table that name no longer exists as a single extension (its fields moved to app
components: `group.profile.v1`, `group.admin-policy.v1`, `transport.nostr.routing.v1`, etc). This is
not a functional bug (the code calls `ensureMarmotCapabilities`, which is correct), only a
terminology drift adjacent to the D-10 MIP rewrite. Flagging for the planner's discretion — worth
fixing in the same D-10 comment-only commit since it is directly beside a MIP-01 citation being
touched anyway.

## D-02: Legacy-Export Guard Design

**Recommended mechanism** (works identically under Node/Deno/Bun in Vitest — pure JS, no
runtime-specific API):

1. **Exact denylist of the 15 removed names** (frozen historical list, safe as an exact-match
   check — do not use a fuzzy/regex name pattern: legitimate *current* exports
   (`AccountIdentityProofError`, `ACCOUNT_IDENTITY_PROOF_COMPONENT`, `accountIdentityProofTemplate`,
   `produceAccountIdentityProof`, `validateKeyPackageAccountIdentityProof`, etc.) all legitimately
   contain the substring `AccountIdentityProof`, so a substring/regex rule on that token would
   false-positive on the entire current surface. An exact `Set` membership check against the frozen
   15-name list has zero false-positive risk and catches the literal regression scenario D-02
   describes (someone re-introduces one of the exact removed names).
   ```ts
   const REMOVED_LEGACY_EXPORT_NAMES = new Set([
     "ACCOUNT_IDENTITY_PROOF_EVENT_KIND", "ACCOUNT_IDENTITY_PROOF_EXTENSION_TYPE",
     "accountIdentityProofEventId", "accountIdentityProofEventJson",
     "accountIdentityProofSignatureFromSignedEvent", "accountIdentityProofSigningDigest",
     "buildAccountIdentityProofEvent", "buildAccountIdentityProofExtension",
     "decodeAccountIdentityProof", "encodeAccountIdentityProof",
     "makeAccountIdentityProofExtension", "mlsSignatureScheme",
     "signAccountIdentityProof", "verifyAllLeafAccountIdentityProofs",
     "verifyLeafAccountIdentityProof",
   ]);
   ```
2. **Recursive value scan for the literal `0xf2f1` (62193).** Must check: (a) top-level exported
   `number` and `bigint` constants directly; (b) one level of nesting into exported
   object/enum-like namespaces, since this codebase's convention (per `src/core/index.ts` and the
   root export list) includes plain-object "enum" exports (`groupLifecycleStates`,
   `convergenceOutcomeToCategory`, `deferredReasons`, `disposition`, `ingestResultDisposition`,
   `inputCategories`, `DEFAULT_GROUP_COMPONENT_IDS`, `SUPPORTED_APP_COMPONENT_IDS`,
   `extendedExtensionTypes`) whose values could theoretically carry a raw numeric extension-type id;
   (c) both `Number` (`62193`) and `BigInt` (`62193n`) representations, since MLS wire types
   sometimes use `bigint` (e.g. epoch is `bigint` elsewhere in this codebase — `groupContext.epoch`
   is `0n` in the package-smoke script). A depth-1-or-shallow-recursive walk is sufficient; this
   codebase's exported namespace objects are flat (verified by reading their definitions this
   session — none nest an object inside an object).
   ```ts
   function assertNoLegacyValue(value: unknown, path: string): void {
     if (typeof value === "number" && value === 0xf2f1)
       throw new Error(`export ${path} equals the legacy 0xf2f1 constant`);
     if (typeof value === "bigint" && value === 62193n)
       throw new Error(`export ${path} equals the legacy 0xf2f1 constant`);
     if (Array.isArray(value)) {
       value.forEach((v, i) => assertNoLegacyValue(v, `${path}[${i}]`));
     } else if (value !== null && typeof value === "object" && value.constructor === Object) {
       for (const [k, v] of Object.entries(value)) assertNoLegacyValue(v, `${path}.${k}`);
     }
   }
   ```
3. **Type-only exports.** CONTEXT.md and D-02 both note a name check cannot see a type-only export
   at runtime (erased by `tsc`). This codebase has no legacy *type* names left to guard (the 15
   removed exports were all runtime values — functions and `const`s — per the 07-07 SUMMARY's own
   list; no interface/type alias was in that removal list). Recommend: **do not** attempt a `.d.ts`
   regex check — CONTEXT.md calls this "out of scope unless cheap," and there is no known type-only
   legacy name to guard against, so building the check would have zero present value. Document this
   as a known, accepted gap (type-only regressions are not covered) rather than silently omitting
   it.
4. **Wire this into every per-subpath snapshot test** (or once, at the root, iterating over all
   subpath modules) — run it against `Object.keys(exports)` immediately after the inline-snapshot
   assertion, for every subpath in D-03's scope, not just root.

## D-03 / D-04: Exports Snapshot Scope

**Root inline snapshot status:** `src/__tests__/exports.test.ts` currently **passes** — confirmed by
the `pnpm vitest run` baseline this session (`src/__tests__/exports.test.ts (2 tests) 17ms`, both
green). `[VERIFIED: vitest run, this session]`

**Current sorted key count per subpath** (captured this session via a throwaway probe test that
imported each barrel and logged `Object.keys(mod).sort()`; probe file was deleted after use, not
committed):

| Subpath | Barrel(s) | Key count | Notes |
|---|---|---|---|
| `.` (root) | `src/index.ts` (+ selected `./engine`, `./audit` re-exports) | 245 (existing inline snapshot) | Already snapshotted |
| `./client` | `src/client/index.ts` | 29 | Includes `ingestResultDisposition` (also re-exported from `./engine`) |
| `./core` | `src/core/index.ts` | 245 | Confirms `AUTHORIZATION_PROOF_LENGTH`, `AUTHORIZATION_PROOF_MAX_CREATED_AT`, `AuthorizationProofError`, `ACCOUNT_IDENTITY_PROOF_COMPONENT`, `ACCOUNT_IDENTITY_PROOF_COMPONENT_ID`, `AccountIdentityProofError` all present (D-04 satisfied); zero legacy names present |
| `./engine` | `src/engine/index.ts` | 32 | |
| `./extra` | `src/extra/index.ts` | 4 | Does **not** re-export `./extra/audit/*` — those are separate `package.json` `exports` subpaths with their own barrels (`src/extra/audit/node.ts`, `src/extra/audit/browser.ts`), not aggregated through `src/extra/index.ts` |
| `./utils` | `src/utils/index.ts` | 16 | |
| `./audit` | `src/audit/index.ts` | 21 | |
| `./extra/audit/node` | `src/extra/audit/node.ts` (no barrel `index.ts` — subpath points directly at this file) | 3 (`NodeJsonlAuditRecorder`, `NodeJsonlAuditWriter`, `uploadAuditLogFile`) | See import-safety finding below |
| `./extra/audit/browser` | `src/extra/audit/browser.ts` | 3 (`AutoBrowserAuditWriter`, `IndexedDbAuditWriter`, `OpfsAuditWriter`) | See import-safety finding below |

None of the above lists contain any of the 15 removed legacy names, `0xf2f1`, or `62193` in any
form — `[VERIFIED: probe-test output, this session]`.

**Import-safety finding for `./extra/audit/node` and `./extra/audit/browser` (overrides CONTEXT.md's
cautious framing):** CONTEXT.md D-03 says `./extra/audit/browser` "may be skipped if it needs
browser globals." Reading `src/extra/audit/browser.ts` shows `navigator`/`indexedDB`/
`FileSystemFileHandle` are referenced **only inside function bodies** (`openAuditDatabase`,
`supportsOpfs`, `openOpfsFile`), never at module top level; `IDBDatabase`/`FileSystemFileHandle` are
used only as TypeScript **types** (erased at runtime, and `lib: ["ES2022", "DOM"]` in
`tsconfig.build.json` already supplies these ambient types for compilation). This session ran a
probe test that `import()`s both `../extra/audit/node.js` and `../extra/audit/browser.js` under
`pnpm vitest run`, `deno run -A --node-modules-dir=auto npm:vitest run`, and `bun run vitest run` —
**all three succeeded with zero errors**, logging the exact 3-key export lists shown above.
`[VERIFIED: three-runtime probe run, this session]` **Recommendation: snapshot both
`./extra/audit/node` and `./extra/audit/browser`**, not just `node` — CONTEXT.md's opt-out for
`browser` does not apply.

**Full current key lists are reproducible on demand** (not inlined here to keep this document
focused — the planner/executor should regenerate them live via `pnpm vitest run -u` once the new
snapshot tests are written, per the existing root test's own pattern of using
`toMatchInlineSnapshot()` with no argument and letting Vitest populate it).

## Upstream Reference Review (D-09)

**`refs/marmot` status:** confirmed current — `git -C refs/marmot fetch origin && git -C refs/marmot
log --oneline HEAD..origin/HEAD` returns 0 commits. No action needed on this submodule.
`[VERIFIED: git fetch + log, this session]`

**`refs/mdk` reviewed range** (exactly the pinned 41-commit range, not `origin/HEAD`):
`73446bc91c7100df4d35866f36b9cf8ccceabbd6..798a3e07ede494d98c2ecf590c6e838a8c1dfcfe`.
`git -C refs/mdk log --oneline <range>` confirms exactly 41 commits.
`[VERIFIED: git log, this session]`

**Files touched, by crate** (via `git -C refs/mdk diff --stat <range>`): the overwhelming majority
of the 241 changed files are in `crates/marmot-app` (account-recovery sync/worker/audit-v5 logic),
`crates/transport-nostr-adapter` (relay-plane delivery-spill/selective-history acquisition),
`crates/cgka-conformance-simulator` (MDK's own internal scorecard/simulator harness),
`crates/marmot-account` (local account home/secret-store/routing), `crates/marmot-c` /
`crates/marmot-uniffi` (FFI bindings for chat-window commands), and forensics/docs. These are all
app-SDK/recovery/audit layers that marmot-ts does not implement or consume.

**Targeted review of the two crates that could plausibly touch wire format or validation logic
marmot-ts mirrors:**

1. **`crates/cgka-engine`** (2 files changed, 23 insertions / 2 deletions — the smallest diff of any
   touched crate):
   - `crates/cgka-engine/src/engine.rs`: adds a `v5_welcome_refs: Vec::new()` field to an existing
     audit-recording struct literal, plus three new methods (`audit_v5_event`,
     `audit_v5_enabled`, `finish_audit_v5_recording`) that delegate to the recorder for MDK's own
     forensic-audit "v5" event schema. Pure additive audit instrumentation; touches no
     validation, no wire encoding, no `account_identity_proof.rs`, no group-context/required-component
     logic. `[VERIFIED: git diff, this session]`
   - `crates/cgka-engine/src/group_lifecycle.rs`: a **doc-comment-only** rewording — "temporary
     full-history subscription" → "temporary post-join history subscription" — zero code change.
     `[VERIFIED: git diff, this session]`
2. **`crates/transport-nostr-peeler/src/peeler.rs`** (176-line diff — the Welcome/group-message
   unwrapping layer, MDK's rough analogue of marmot-ts's `NostrGroupPeeler`): adds a new
   `peel_welcome_with_provenance()` method that returns the *same* `PeeledMessage` the existing
   `peel_welcome()` produced, plus a new `WelcomePeelProvenance { rumor_event_id,
   key_package_event_id }` struct for MDK's own audit trail. The existing `peel_welcome()` now
   simply delegates to the new method and discards the provenance tuple — **every validation step
   is byte-identical** (kind check, routing match, gift-wrap unwrap, rumor-kind check, `e`-tag /
   relay-tag validation, base64 decode, empty-welcome-bytes check): confirmed by diffing the two
   function bodies directly, which are line-for-line the same logic moved, not rewritten. One
   behavioral refinement worth noting for future awareness (not a contradiction): the new code
   computes `rumor_event_id` via `unwrapped.rumor.compute_id()` (recomputed from authenticated
   fields) rather than trusting a self-reported `id` on the unsigned rumor — this is MDK
   hardening its *own* forensic-audit provenance, not a change to Welcome wire validation.
   `[VERIFIED: git diff, this session]`
3. **`crates/cgka-conformance-simulator`** (recovery-scorecard/app-runtime additions; MDK's internal
   test harness, not a conformance-vector format marmot-ts consumes) and the founding-Welcome
   commits found by keyword search (`e9819692`, `ff409109`, `42e8eeb7` — all in
   `crates/marmot-app/src/client/audit_v5_probe.rs`): these add *test-only* v5-audit-probe assertions
   that observe an already-completed founding-Welcome flow's KeyPackage-event-id/recipient
   associations for MDK's audit trail. They do not touch `cgka-engine`'s actual founding-creation
   logic (the `FoundingSelection`/`begin_founding`/`founding_prepared` code the keyword grep
   surfaced lives in `crates/marmot-account/src/runtime.rs`, MDK's own app-level founding-Welcome
   *dispatch* orchestration, not the engine-level FOUND-01..05 semantics marmot-ts mirrors).
   `[VERIFIED: git diff --stat + targeted grep, this session]`

**Verdict: no contradiction with shipped v2.0 behavior.** Every change in this 41-commit range
either (a) lives entirely in marmot-app/transport-adapter/simulator/FFI layers marmot-ts does not
implement, or (b) is additive forensic-audit ("v5") instrumentation layered on top of
already-shipped `cgka-engine`/`transport-nostr-peeler` logic with zero change to the underlying
account-identity-proof validation, GroupContext required-component profile, founding-Welcome
protocol semantics, or Welcome/KeyPackage wire format. No fix or follow-up is required in
marmot-ts. The orchestrator should fast-forward `refs/mdk` to `798a3e07ede494d98c2ecf590c6e838a8c1dfcfe`
and commit the pointer bump as `chore(refs):` per D-09 (this research does not perform that bump).

## D-10: Stale `MIP-NN` Citation Inventory

`grep -rn -E "MIP-[0-9]{2}" src/` finds **26 occurrences across 22 lines** (matches CONTEXT.md's "~26
occurrences" exactly). `[VERIFIED: grep -c, this session]` All are in comments or test
`describe`/`it` titles — **zero occurrences are in string literals that affect runtime behavior or
test assertions** (confirmed by reading every hit's surrounding line; none is a value compared
against, only descriptive text). Rewriting them is purely cosmetic as CONTEXT.md states.

| File:line | MIP cited | Content | Recommended new-path citation | Confidence |
|---|---|---|---|---|
| `src/client/group/__tests__/marmot-group.test.ts:489,546,603` | MIP-03 | admin-only commit enforcement | `protocol-core/group-messaging.md` | HIGH |
| `src/client/group/__tests__/marmot-group.test.ts:771` | MIP-02 | "accepts non-admin self-update commits (no proposals)" | **AMBIGUOUS** — see note below | LOW |
| `src/client/key-package-store.ts:211` | MIP-00 | kind-30443 `i` tag == KeyPackageRef | `transports/nostr.md` (primary, Nostr-specific `i` tag semantics) + `foundation/key-packages.md` (secondary) | HIGH |
| `src/client/__tests__/key-package-manager.test.ts:670` | MIP-00 | `i` tag mismatch rejection | `transports/nostr.md` | HIGH |
| `src/core/auth-service.ts:11` | MIP-00 | credential policy — **already dual-cited** as `(MIP-00 / \`foundation/identity.md\`)` | Drop the `MIP-00 /` prefix, keep `foundation/identity.md` only | HIGH |
| `src/core/capabilities.ts:69,94` | MIP-03 | self_remove / member departure | `protocol-core/member-departure.md` (mip-coverage.md explicitly names this as MIP-03's departure sub-topic) | HIGH |
| `src/core/default-capabilities.ts:14` | MIP-01 | KeyPackage capability requirement | `protocol-core/group-setup.md` — plus see the adjacent "Marmot Group Data Extension" terminology-drift note in the D-01 section above | HIGH |
| `src/core/extensions.ts:17` | MIP-00 | KeyPackage compliance | `foundation/key-packages.md` | HIGH |
| `src/core/group-event.ts:44` | MIP-03 | ephemeral signing keypair for kind-445 | `protocol-core/group-messaging.md` (primary) + `transports/nostr.md` (secondary, Nostr-specific signing detail) | MEDIUM |
| `src/core/group-message-crypto.ts:44,120` | MIP-03 | group-event encryption key derivation / content encryption | `protocol-core/group-messaging.md` | HIGH |
| `src/core/key-package-event-decode.ts:158,161` | MIP-00 | kind-30443 `i` tag decode | `transports/nostr.md` (primary) + `foundation/key-packages.md` | HIGH |
| `src/core/key-package-event-encode.ts:44` | MIP-00 | `i` tag omission default | `transports/nostr.md` | HIGH |
| `src/core/key-package.ts:128` | MIP-00 | `last_resort` capability | `foundation/key-packages.md` | HIGH |
| `src/core/__tests__/credential.test.ts:235` | MIP-00 | basic credential acceptance | `foundation/identity.md` | HIGH |
| `src/core/__tests__/group-message.test.ts:46,47` | MIP-03 | group message encryption test | `protocol-core/group-messaging.md` | HIGH |
| `src/core/__tests__/key-package-event.test.ts:619` | MIP-00 | "spec compliance" describe block | `foundation/key-packages.md` + `transports/nostr.md` (test covers both KeyPackage structure and the kind-30443 event encoding — check test body before picking one) | MEDIUM |
| `src/engine/__tests__/group-engine.test.ts:202` | MIP-03 | admin verification | `protocol-core/group-messaging.md` | HIGH |
| `src/__tests__/integration/end-to-end-invite-join-message.test.ts:143` | MIP-02 | "MIP-02 self-update is the caller's responsibility" | **AMBIGUOUS** — same pattern as the marmot-group.test.ts:771 hit below | LOW |
| `src/__tests__/integration/ingest-commit-race.test.ts:60,214` | MIP-03 | admin-only commit race ordering | `protocol-core/group-messaging.md` | HIGH |

**Two ambiguous mappings flagged, not silently resolved:** `marmot-group.test.ts:771` and
`end-to-end-invite-join-message.test.ts:143` both label **self-update** commit behavior as MIP-02.
Per `refs/marmot/mip-coverage.md`, MIP-02 maps only to "Welcome Events"
(`protocol-core/joining.md`, `transports/nostr.md`); self-update (a commit type, not a join event)
reads as MIP-03 (`protocol-core/group-messaging.md`) territory under the *current* topic split. This
research cannot confirm whether the original (pre-split) monolithic MIP-02 text actually covered
self-update — that text is not available locally (only the topic-reorganized spec is checked out).
**Recommend the planner treat this as a genuine open question for the D-10 commit**: either (a) map
both to `group-messaging.md` on the reading that self-update is fundamentally a commit-type concern,
or (b) leave a `TODO`/ask-the-user checkpoint rather than guess. Do not silently reinterpret intent.

## QA-04 Baseline (this session, all commands actually run)

| Check | Command | Result |
|---|---|---|
| Node vitest | `pnpm vitest run` (local Node v26.9.0) | **PASS** — 115 files, 1292 tests, 0 failed, 20.52s |
| Deno vitest | `deno run -A --node-modules-dir=auto npm:vitest run` (Deno 2.9.6) | **PASS** — 115 files, 1292 tests, 0 failed, 21.44s |
| Bun vitest | `bun run vitest run` (Bun 1.3.14) | **PASS** — 115 files, 1292 tests, 0 failed, 20.60s |
| Extended conformance | `pnpm conformance:extended` (`vitest.extended.config.ts`, `src/__tests__/conformance/extended.spec.ts`) | **PASS** — 1 file, 1 test, 2.72s |
| `.skip`/`.todo`/`skipIf` audit | `grep -rn -E "\.(skip\|todo)\(\|skipIf\(" src/ --include="*.test.ts"` | **Zero matches** — no weakened "green" claim anywhere |
| Prettier | `pnpm lint` (`prettier --check .`) | **PASS, zero diffs** — see D-08 note below |
| Build | `pnpm build` (clean → ts-mls build → `tsc -b` → vendor) | **PASS** — 6.5s, vendor step "copied 208 files, rewrote 103 files" |
| Package smoke | `bash scripts/package-smoke/run.sh` | **FAIL** — see finding below |

**D-08 is already satisfied — no work remains.** `pnpm lint` passes with zero diffs right now.
`git log --oneline -3 -- src/client/runtime/group-runtime.ts
src/client/runtime/__tests__/group-runtime.test.ts
src/client/transport/nostr/__tests__/welcome-delivery.test.ts` shows commit `92bbdb8 style(10-02):
apply prettier to Welcome fanout files`, which post-dates the Phase 10 deferred-items.md entry that
first reported the drift. The drift was fixed during Phase 10 itself. **Recommend the D-08 task in
the plan become "verify `pnpm lint` is clean; if it is, note as already-resolved and skip
`pnpm format`" rather than blindly running `pnpm format` (which would produce an empty/no-op
commit).** `[VERIFIED: pnpm lint output + git log, this session]`

### Package-smoke failure — root cause and fix direction (new finding, not named in CONTEXT.md)

```
package-smoke: running Node runtime smoke...
file:///…/dist/core/authorization-proof.js:220
    const signed = await params.signer.signEvent(draft);
                                       ^
TypeError: Cannot read properties of undefined (reading 'signEvent')
    at produceAuthorizationProof (…/dist/core/authorization-proof.js:220:40)
    at produceAccountIdentityProof (…/dist/core/components/account-identity-proof.js:109:25)
    at generateKeyPackage (…/dist/core/key-package.js:52:25)
    at async file:///…/consumer/smoke.mjs:42:12
```

Root cause: `scripts/package-smoke/smoke.mjs:42` still calls
`generateKeyPackage({ credential, ciphersuiteImpl: impl })` with no `signer`. Since Phase 7
(`src/core/key-package.ts`'s `GenerateKeyPackageOptions.signer: AuthorizationProofSigner` is
required, not optional — confirmed by reading the current source), every call must supply an
object exposing `signEvent`. This script was never updated when that API became mandatory,
and it is not covered by the main `pnpm vitest run` suite because it only runs against a real
packed tarball, not source. `[VERIFIED: direct run + source read, this session]`

Fix direction (a design decision for the plan, not fully prescribed here): the script must build
a real `AuthorizationProofSigner` (`Pick<EventSigner, "signEvent">`) whose `signEvent` returns a
validly BIP-340-signed event over a real secp256k1 keypair — `produceAuthorizationProof` (via
`verifyAuthorizationProof` downstream, and the leaf's own on-curve check in
`validateLeafAccountIdentityProof`) needs a genuine signature, not a stub. The current `smoke.mjs`
deliberately avoids `node:`-prefixed imports and any devDependency (it exercises a bare `npm
install` of the packed tarball plus TypeScript only — see its own header comment) and does not
install `applesauce-accounts` (the package this repo's own test helper,
`src/__tests__/helpers/test-accounts.ts`, uses to build a `PrivateKeyAccount` — that package is a
marmot-ts **devDependency**, not a `dependencies`/`peerDependencies` entry, so it will not be
present in a bare tarball-consumer install). `@noble/curves` (which has `schnorr` and is a marmot-ts
runtime `dependencies` entry, hence guaranteed present via npm hoisting in the consumer install) is
the right primitive to hand-roll a minimal raw-key signer directly in the smoke script, mirroring
the shape `src/core/authorization-proof.ts`'s own `AuthorizationProofSigner` type expects. Also
replace the placeholder `pubkey = "a".repeat(64)` (not a valid on-curve x-only point) with the
real derived pubkey from that keypair, since `credential.identity` must be `schnorr`-liftable
(`validateLeafAccountIdentityProof` step 1 checks this) if the smoke test is ever extended to touch
the leaf-validation path.

## CI Evidence (D-05)

**`.github/workflows/tests.yml`** — three jobs, all triggered on `push`/`pull_request` to any branch
(`branches: ["**"]`):
- `test-node`: matrix `[20.x, 22.x, 24.x]`, runs `pnpm vitest run` then `pnpm conformance:extended`.
- `test-deno`: matrix `[v2.x]`, runs `deno run -A --node-modules-dir=auto npm:vitest@3.2.6 run` then
  the same with `--config vitest.extended.config.ts`. **Note:** CI pins `npm:vitest@3.2.6` exactly;
  this session's local Deno run resolved unpinned `npm:vitest` to **3.2.7** (the version already in
  `pnpm-lock.yaml`/`node_modules`) — both passed identically, but flag the version-pin mismatch as a
  latent drift risk worth a one-line note in the verification report, not a blocker.
- `test-bun`: matrix `[latest, "1.1"]`, runs `bun run vitest run` then the extended-conformance
  variant. This is where Bun 1.1 (not locally installed — only 1.3.14 is) gets covered, matching
  CONTEXT.md D-05's own statement.

**`.github/workflows/build.yml`** — `build` job (Node 24 only) runs `pnpm build`, uploads
`dist/` as an artifact; a dependent `package-smoke` job (matrix `[20.x, 24.x]`) reinstalls, rebuilds,
and runs `bash scripts/package-smoke/run.sh`, with `PACKAGE_SMOKE_REQUIRE_BUN`/`_DENO=1` on the
24.x leg only. **This CI job will fail once merged, given the local reproduction above, until the
smoke-script signer fix lands** — worth calling out explicitly in the plan's verification
checkpoint.

**How to actually obtain CI run evidence — a real gap the planner must account for.** The repo's
`origin` git remote is **not** a plain GitHub URL:
```
$ git remote -v
origin  nostr://npub1ye5ptcxfyyxl5vjvdjar2ua3f0hynkjzpx552mu5snj3qmx5pzjscpknpr/git.shakespeare.diy/marmot-ts
```
This is an `ngit` (Nostr-native git) remote, not `github.com`. Consequently `gh run list` (with no
flags) **fails**: `failed to determine base repo: none of the git remotes configured for this
repository point to a known GitHub host.` `[VERIFIED: gh run list, this session]` The fix is
trivial and already confirmed working: pass the GitHub slug explicitly (it is published in
`package.json`'s `repository`/`bugs`/`homepage` fields as `marmot-protocol/marmot-ts`):
```
gh run list --repo marmot-protocol/marmot-ts --limit 10
```
This succeeded this session and returned real recent runs, including a **`Build` failure** on the
most recent `master` push (`docs(phase-10): evolve PROJECT.md after phase completion`, run
`36487656126`, `completed / failure`, 1m51s) alongside a green `Tests` run on the same push — i.e.
CI's own `build.yml` (which includes package-smoke) is *currently red on `master`* even before this
phase's work, independently corroborating the local package-smoke reproduction above.
`git status -sb` shows local `master` is **2 commits ahead of `origin/master`** (both from Phase 10
completion docs), so this CI failure is on already-pushed work, not blocked on anything local.
**Pushing to `origin` to get a fresh CI run reflecting this phase's fixes is an outward-facing
action — the plan must gate it behind an explicit user checkpoint, not do it automatically.**

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Node.js | QA-04 gate, build | ✓ | v26.9.0 | — |
| Deno | QA-04 gate | ✓ | 2.9.6 | — |
| Bun | QA-04 gate (`latest` leg) | ✓ | 1.3.14 | — |
| Bun 1.1 | QA-04 gate (`1.1` leg, D-05) | ✗ (only `latest`/1.3.14 installed locally) | — | CI's `test-bun` matrix covers this leg; D-05 already designates CI as authority for it |
| pnpm | build/test tooling | ✓ | 12.4.2 (CI pins pnpm 10 via `pnpm/action-setup@v4`) | Local version mismatch from CI is pre-existing (noted in STATE.md Phase 05-01 decisions); not a new risk, build/tests pass locally regardless |
| `gh` CLI | D-05 CI evidence gathering | ✓ (authenticated as `hzrd149`) | — | Must pass `--repo marmot-protocol/marmot-ts` explicitly — see CI Evidence section |
| GitHub Actions (remote) | D-05 CI authority | Indirect — local `origin` remote is `nostr://…` (ngit), not `github.com` directly | — | `gh --repo` flag works regardless of local remote config |

**No missing dependency blocks execution.** The Bun-1.1 and CI-run-ID gaps both have documented,
already-verified workarounds (CI matrix coverage; explicit `--repo` flag).

## Security Domain

`security_enforcement` is not explicitly disabled in `.planning/config.json` (absent = enabled per
policy), so this section is included, but the phase itself introduces **no new attack surface**:
CONTEXT.md states explicitly "this is a verification-and-hygiene phase; it adds no new protocol
behavior," which this research's own audit confirms — every change is either (a) test-only
(snapshot/guard tests), (b) comment-only (D-10, the D-01 dead-pointer fixes), (c) a submodule
pointer bump, or (d) the package-smoke script fix (a build/release-time test script, not shipped
library code — it is excluded from `package.json` `files`).

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | No | No new auth surface |
| V3 Session Management | No | N/A |
| V4 Access Control | No | N/A |
| V5 Input Validation | Indirectly | The D-02 export guard is itself a lightweight input-validation-style check on the library's *own* public surface (not user input); no new external-input path is introduced |
| V6 Cryptography | No | The package-smoke fix will construct a real BIP-340 signer using `@noble/curves` (already the project's standard, vetted primitive per every other phase's research) — no new crypto is hand-rolled, an existing library call is reused |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---|--------|---|
| Legacy/removed API resurfacing silently in a future PR (export regression) | Tampering / Information Disclosure | D-02's mechanical guard (this phase's own deliverable) |
| Dependency confusion via the vendored `ts-mls` fork | Spoofing | Already covered by `scripts/verify-package-tarball.mjs` (run inside `package-smoke/run.sh`, confirmed to run successfully this session up to the point of the signer bug) — out of scope to re-verify here, not touched by this phase |

## Common Pitfalls

### Pitfall 1: Treating "`pnpm lint` is currently clean" as evidence D-08 was never a real issue
**What goes wrong:** A plan author reads CONTEXT.md's D-08 description (3 named files, confirmed
drift) and assumes the drift is still present, scheduling a `pnpm format` commit that will be an
empty no-op.
**Why it happens:** The CONTEXT.md was written before Phase 10's later commits (`92bbdb8`) quietly
fixed the drift as a side effect of unrelated work.
**How to avoid:** Always re-run `pnpm lint` fresh at plan-execution time before assuming a
documented-in-context problem still exists; this research already did so and confirmed clean.
**Warning signs:** `git diff` after `pnpm format` shows zero changes — stop, do not commit an empty
commit.

### Pitfall 2: Assuming `pnpm vitest run` green implies the full D-06 gate is green
**What goes wrong:** QA-04's headline suite (115/115, 1292/1292) is fully green on all three local
runtimes, which could be mistaken for "the gate passes."
**Why it happens:** `bash scripts/package-smoke/run.sh` is a separate script, not part of
`pnpm vitest run`, and it fails on a regression the main suite structurally cannot see (it only runs
against a *packed tarball* of the built `dist/`, simulating a real consumer install).
**How to avoid:** D-06 explicitly names three additional checks (`pnpm build`, `pnpm lint`,
`bash scripts/package-smoke/run.sh`) beyond the vitest suite — all three must be run and green, not
assumed from the suite's own result.
**Warning signs:** Any plan verification step that only cites vitest pass counts as evidence of
"QA-04 done."

### Pitfall 3: Fixing the smoke-script signer bug by importing a devDependency
**What goes wrong:** The obvious fix — reuse `src/__tests__/helpers/test-accounts.ts`'s
`PrivateKeyAccount.fromKey(...)` pattern — depends on `applesauce-accounts`, which is a marmot-ts
**devDependency**, not shipped to consumers. Installing it inside the smoke script's throwaway
consumer project would mask the exact class of bug the smoke test exists to catch (relying on a dev
tool a real consumer would not have).
**Why it happens:** It is the path of least resistance since that pattern is already used
everywhere else in this codebase's tests.
**How to avoid:** Build the signer using only packages already in marmot-ts's `dependencies` (e.g.
`@noble/curves`'s `schnorr`), which npm guarantees are present via hoisting in any real consumer
install — matching `smoke.mjs`'s own documented intent ("Deliberately uses no `node:` imports so it
stays runtime-neutral").
**Warning signs:** `npm install`-ing anything extra inside `scripts/package-smoke/run.sh`'s
`$WORK/consumer` beyond the packed tarball + `typescript`.

## Code Examples

### The existing exports-snapshot pattern to replicate per subpath (D-03)
```ts
// Source: src/__tests__/exports.test.ts (existing, verified passing this session)
import * as exports from "../index.js";

it("should export the expected members", () => {
  expect(Object.keys(exports).sort()).toMatchInlineSnapshot(`[...]`);
});
```
Replicate once per subpath barrel (`../client/index.js`, `../core/index.js`, `../engine/index.js`,
`../extra/index.js`, `../utils/index.js`, `../audit/index.js`, `../extra/audit/node.js`,
`../extra/audit/browser.js`), each with its own `toMatchInlineSnapshot()` (empty, then
`vitest run -u` populates it) plus the D-02 guard call.

### The `AuthorizationProofSigner` shape the package-smoke fix must satisfy
```ts
// Source: src/core/authorization-proof.ts (current, this session)
export type AuthorizationProofSigner = Pick<EventSigner, "signEvent">;
// signEvent(draft: EventTemplate) => Promise<NostrEvent>
```

## State of the Art

Not applicable in the "library/framework churn" sense this section usually covers — this phase
touches no external libraries. The one relevant "drift" is internal: `generateKeyPackage`'s signer
requirement (Phase 7) is the new state of the art within this codebase, and `smoke.mjs` is the one
remaining caller that was not migrated to it.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The two ambiguous MIP-02/self-update citations (`marmot-group.test.ts:771`, `end-to-end-invite-join-message.test.ts:143`) should map to `group-messaging.md` rather than reflecting some legitimate historical MIP-02 scope this research could not verify (old monolithic MIP text unavailable locally) | D-10 table | Low — worst case, the planner leaves these two exactly as named or asks the user, rather than acting on an unverified guess; flagged explicitly as ambiguous, not asserted as fact |
| A2 | The package-smoke fix should use `@noble/curves`'s `schnorr` directly rather than any other already-a-dependency primitive | Package-smoke fix direction | Low — this is a direction, not a locked decision; the plan is free to pick a different already-a-dependency primitive (e.g. `applesauce-core` may also expose event-hashing helpers) as long as it avoids the devDependency-leakage pitfall this research identified |

**Everything else in this document is `[VERIFIED]`** — every command shown was actually executed
this session against the live repo, or is a direct file:line read; no npm-registry/package-legitimacy
claims apply (no new packages), so no `[ASSUMED]`-tagged registry claims exist to log.

## Open Questions

1. **Should the D-10 MIP rewrite also fix the `default-capabilities.ts:14` "Marmot Group Data
   Extension" terminology drift?**
   - What we know: it is directly adjacent to a MIP-01 citation being touched anyway, and the term
     is stale per `mip-coverage.md`'s own field-split table.
   - What's unclear: CONTEXT.md's D-10 scope is specifically "MIP-NN citations," not general
     terminology; this is adjacent but technically a different kind of edit.
   - Recommendation: include it in the same comment-only commit (zero behavior risk either way) but
     call it out separately in the plan/summary so it is not conflated with the MIP-number rewrite
     itself.

2. **Should Phase 11 push to `origin` to get a fresh CI run reflecting this phase's own fixes, given
   D-05 designates CI as the runtime-matrix authority?**
   - What we know: local `master` is 2 commits ahead of `origin/master` already (pre-existing, from
     Phase 10); CI's own `build.yml` is currently failing on `master` from that pre-existing state,
     independent of this phase.
   - What's unclear: whether the user wants an explicit checkpoint before every push, or a single
     checkpoint at the end of the phase covering all of its commits at once.
   - Recommendation: a single `checkpoint:human-verify`-style gate immediately before the phase's
     final push, covering all of this phase's commits together, rather than one per commit.

## Sources

### Primary (HIGH confidence — direct tool/command output or file reads, this session)
- Live repo: `git log`, `git diff`, `git status`, `pnpm vitest run`, `deno run … vitest run`,
  `bun run vitest run`, `pnpm conformance:extended`, `pnpm build`, `pnpm lint`,
  `bash scripts/package-smoke/run.sh`, `gh run list --repo marmot-protocol/marmot-ts`
- `refs/mdk` submodule: `git -C refs/mdk log/diff` over the exact pinned range
- `refs/marmot/mip-coverage.md`, `refs/marmot/{foundation,protocol-core,app-components,transports,features}/`
- `.planning/phases/07-account-identity-proof-component-0x8009-legacy-clean-cut/07-07-SUMMARY.md`
- Direct source reads: `src/core/components/account-identity-proof.ts`,
  `src/core/authorization-proof.ts`, `src/core/key-package.ts`, `src/extra/audit/{node,browser}.ts`,
  `src/{index,core/index,client/index,engine/index,extra/index,utils/index,audit/index}.ts`,
  `scripts/package-smoke/{run.sh,smoke.mjs}`, `.github/workflows/*.yml`, `package.json`

### Secondary (MEDIUM confidence)
- `.planning/phases/10-founding-group-creation-via-welcome/deferred-items.md` (D-08's original
  drift report, since superseded by direct re-verification)

### Tertiary (LOW confidence)
- None — no WebSearch was used or needed for this phase; it is entirely repo-internal investigation.

## Metadata

**Confidence breakdown:**
- D-01 stale-reference inventory: HIGH — exhaustive grep + line-by-line read
- D-02 guard design: HIGH — grounded in the actual current export list and actual codebase
  conventions (enum-object exports), not a generic pattern
- D-03/D-04 exports scope: HIGH — every subpath actually imported and its keys actually enumerated
  under all three runtimes
- D-05/D-06 QA-04 baseline: HIGH — every command actually run this session, including the
  package-smoke failure, which is a genuine, reproduced regression
- D-09 upstream review: HIGH — full diff read for the two crates that could plausibly matter;
  broad `--stat` read for everything else
- D-10 MIP mapping: HIGH except the two flagged self-update ambiguities (LOW, explicitly called out)

**Research date:** 2026-09-28
**Valid until:** This research is tied to a specific git state (local `master` HEAD at research
time, `refs/mdk` at `798a3e07`) and a specific CI run snapshot (`gh run list` as of 2026-09-28). Any
new commits to `master`, `refs/mdk`, or CI runs after this date should be treated as unverified by
this document — re-run the baseline commands rather than trusting stale numbers if more than a few
days pass before execution.
