# Phase 11: Exports Snapshot & QA Gate - Context

**Gathered:** 2026-09-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Close out milestone v2.0 (Account identity proof v2) as shippable:

- **QA-04** — the full Vitest suite is green on Node 20/22/24, Deno 2, and Bun latest/1.1.
- **QA-05** — the public exports snapshot reflects the removed legacy proof exports and the added
  envelope/component exports, with no *stale* `0xf2f1` references.

QA-03 (Rust-signed MDK `0x8009` KeyPackage fixture) was **dropped from v2.0 on 2026-09-28** and moved
to Future Requirements. Do not build that fixture in this phase. The phase was renamed from
"Interop Fixtures, Exports Snapshot & QA Gate" to "Exports Snapshot & QA Gate" to match.

This is a verification-and-hygiene phase. It adds no new protocol behavior.

</domain>

<decisions>
## Implementation Decisions

### Meaning of "no stale 0xf2f1 references" (QA-05)

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

### Exports snapshot scope (QA-05)

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

### What counts as "green on six runtimes" (QA-04)

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

### Phase cleanup & naming

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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — QA-04, QA-05 (QA-03 is listed under Future Requirements as dropped)
- `.planning/ROADMAP.md` §Phase 11 — goal and success criteria

### Legacy clean cut (what `0xf2f1` handling must stay)
- `.planning/phases/07-account-identity-proof-component-0x8009-legacy-clean-cut/` — CUT-* decisions and
  the removal of the legacy exports
- `src/core/components/account-identity-proof.ts` — rejection constant and branches (lines ~16, 142,
  238, 361–370, 501, 561–585, 622, 690–700)
- `docs/client/best-practices.md:76` — the legacy-groups-must-be-recreated note (keep it)

### Exports
- `src/__tests__/exports.test.ts` — the existing root inline snapshot plus the type-level assertions
- `package.json` `exports` — the authoritative list of public subpaths
- `src/index.ts`, `src/{client,core,engine,extra,utils,audit}/index.ts` — the barrels to snapshot

### Runtime / CI gate
- `.github/workflows/*.yml` — test matrix (Node 20/22/24, Deno v2.x, Bun latest/1.1) and package-smoke
- `scripts/package-smoke/run.sh` — packed-tarball consumer smoke

### Deferred cleanup inputs
- `.planning/phases/10-founding-group-creation-via-welcome/deferred-items.md` — the Prettier drift entry
- `refs/marmot/mip-coverage.md` — mapping from MIP numbers to new spec paths
- `refs/mdk` — 41 upstream commits to review before the pointer bump

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/__tests__/exports.test.ts`: already uses the `Object.keys(exports).sort()` +
  `toMatchInlineSnapshot` pattern. Copy it for each subpath.
- `src/__tests__/conformance/`: the conformance runner (`pnpm conformance:extended` in CI) is part of
  the green gate.

### Established Patterns
- Inline snapshots, not snapshot files.
- Chores go in separate `chore(...)` commits; submodule bumps use `chore(refs):`.
- Commit directly on master for GSD phase work (per the user's memory).

### Integration Points
- CI is in `.github/workflows/`. Local runtimes: node v26, deno, bun (latest). Bun 1.1 is not
  installed locally, so CI covers it.

</code_context>

<specifics>
## Specific Ideas

- The user dropped the Rust fixture outright. Do not reintroduce it or a substitute interop fixture.
- The existing pinned Rust fixtures in `src/__tests__/fixtures/` (`key-package-lifetime-rust.json`,
  `key-package-tags-rust.json`, `safe-aad-rust.json`) are untouched by this phase.

</specifics>

<deferred>
## Deferred Ideas

- **QA-03**: a Rust-signed MDK Current-profile `0x8009` KeyPackage fixture. It was dropped from v2.0
  and is tracked in REQUIREMENTS.md Future Requirements.
- Phase 10 open question: should `GroupFactory` fail fast when `invitees` is given without `relays`?
  It is currently a silent 100% Welcome failure. See the Phase 10 `deferred-items.md`. Not in scope
  here.

</deferred>

---

*Phase: 11-exports-snapshot-qa-gate*
*Context gathered: 2026-09-28*
