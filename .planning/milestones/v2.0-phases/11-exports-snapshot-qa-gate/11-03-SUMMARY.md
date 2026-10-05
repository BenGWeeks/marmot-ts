---
phase: 11-exports-snapshot-qa-gate
plan: 03
subsystem: testing
tags: [qa-04, qa-05, qa-gate, ci-evidence, d-05, d-06, d-07, d-08, d-09, milestone-v2.0]

requires:
  - phase: 11-exports-snapshot-qa-gate
    provides: "plans 11-01 (stale-reference/MIP-citation hygiene) and 11-02 (exports snapshot guard + package-smoke signer fix), both merged to master"
provides:
  - "Full local gate evidence (lint, build, package smoke, three-runtime suite + extended conformance) for candidate SHA 785a1df"
  - "GitHub Actions evidence: all nine required Tests/Build jobs green for pushed SHA c2f5a12 (a descendant of the candidate)"
  - "QA-04 verdict: green locally (Node v26.9.0, Deno 2.9.6, Bun 1.3.14) and in CI (Node 20/22/24, Deno v2.x, Bun latest/1.1, build, package smoke x2)"
  - "D-07/D-08/D-09 verification outcomes"
  - "0xf2f1 inventory confirming exactly the 14-path CUT-02 keep set"
affects: [11-exports-snapshot-qa-gate]

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified: []

key-decisions:
  - "D-07 STATE.md gap (title-case phase name absent, only kebab-case slug present) recorded as a caveat, not fixed — the orchestrator's instructions reserve STATE.md/ROADMAP.md writes for the orchestrator"
  - "No fix(11)/chore(11) commits were needed — every local gate step and every required CI job passed green on the first attempt"
  - "CI evidence is tied to PUSHED_SHA c2f5a12 (a descendant of the locally-gated candidate 785a1df, 23 later docs/quick-task commits including quick task 261005-dd6), not to 785a1df itself; ancestry of every Phase 11 commit was verified"

requirements-completed: [QA-04, QA-05]

coverage:
  - id: D-05-D-06
    description: "Full local gate (lint, build, package smoke, three-runtime Vitest suite, three-runtime extended conformance) green on Node v26.9.0, Deno 2.9.6, Bun 1.3.14"
    requirement: "QA-04"
    verification:
      - kind: other
        ref: "pnpm lint; pnpm build; bash scripts/package-smoke/run.sh; pnpm vitest run; deno run -A --node-modules-dir=auto npm:vitest run; bun run vitest run; pnpm conformance:extended (+Deno/Bun variants) — all exit 0, Task 1 session"
        status: pass
    human_judgment: false
  - id: D-05-CI
    description: "GitHub Actions Tests run (Node 20/22/24, Deno v2.x, Bun latest, Bun 1.1) and Build run (build, Package smoke Node 20.x/24.x) all conclude success for pushed SHA c2f5a1201f3199655e17513e62a7b3392ef85b66"
    requirement: "QA-04"
    verification:
      - kind: other
        ref: "gh run view 37328779021 / 37328778947 --repo marmot-protocol/marmot-ts --json jobs — nine jobs, all success; runs filtered by headSha == PUSHED_SHA"
        status: pass
    human_judgment: false
  - id: D-09
    description: "refs/mdk precondition verified at 798a3e07 (commit 4a7130d); no upstream drift on refs/marmot or refs/mdk's tracked branch since"
    requirement: "QA-04"
    verification:
      - kind: other
        ref: "git -C refs/mdk rev-parse HEAD; git log --oneline -1 4a7130d; git -C refs/marmot fetch + log HEAD..origin/HEAD; git -C refs/mdk fetch + log HEAD..origin/HEAD — Task 1 session"
        status: pass
    human_judgment: false
  - id: QA-05
    description: "Final tree has zero MIP-NN citations in src/, zero dead legacy-proof-module pointers, 0xf2f1 only in the 14-path CUT-02 keep set, exports snapshot guard in place, zero skipped tests"
    requirement: "QA-05"
    verification:
      - kind: other
        ref: "Task 1 audits (grep counts, 0xf2f1 inventory) plus plans 11-01/11-02 SUMMARYs; src/__tests__/exports.test.ts runs inside the green three-runtime and CI suites"
        status: pass
    human_judgment: false

duration: "~15m for Task 3 (continuation); Task 1 ran 2026-09-28, push checkpoint resolved 2026-10-05"
completed: 2026-10-05
status: complete
---

# Phase 11 Plan 03: QA Gate & CI Evidence Summary

**Full local gate green on Node v26.9.0 / Deno 2.9.6 / Bun 1.3.14, and all nine required GitHub Actions jobs (Node 20/22/24, Deno v2.x, Bun latest/1.1, build, Package smoke x2) green for pushed SHA `c2f5a1201f3199655e17513e62a7b3392ef85b66` — QA-04 and QA-05 satisfied; no fix commits needed.**

## Local Gate Evidence (Task 1)

| Check | Command | Runtime | Result | Exit |
|---|---|---|---|---|
| D-09 precondition | `git -C refs/mdk rev-parse HEAD` | — | `798a3e07ede494d98c2ecf590c6e838a8c1dfcfe` | 0 |
| D-09 precondition | `git log --oneline -1 4a7130d` | — | `4a7130d chore(refs): fast-forward mdk to 798a3e07` | 0 |
| D-09 upstream drift | `git -C refs/marmot fetch origin && git -C refs/marmot log --oneline HEAD..origin/HEAD` | — | 0 new commits | 0 |
| D-09 upstream drift | `git -C refs/mdk fetch origin && git -C refs/mdk log --oneline HEAD..origin/HEAD` | — | 0 new commits on the tracked branch (fetch surfaced two unrelated feature branches: `claude/recovery-audit-v5`, `claude/recovery-retire-inline-executor` — neither is `HEAD`'s tracked ref, so `HEAD..origin/HEAD` stays empty) | 0 |
| D-07 phase rename | `grep -c 'Exports Snapshot & QA Gate' .planning/ROADMAP.md` | — | 3 | 0 |
| D-07 phase rename | `grep -c 'Exports Snapshot & QA Gate' .planning/STATE.md` | — | **0 — see caveat below** | 1 |
| D-08 verify-first | `pnpm lint` | — | "All matched files use Prettier code style!" — zero diffs | 0 |
| D-06 build | `pnpm build` | — | clean → ts-mls build → `tsc -b` → vendor ("copied 208 files, rewrote 103 files") | 0 |
| D-06 package smoke | `bash scripts/package-smoke/run.sh` | Node v26.9.0 + Bun + Deno | `package smoke OK (node v26.9.0)`, `package smoke OK (Bun)`, `package smoke OK (Deno)`, `package-smoke: PASSED` | 0 |
| D-05 suite | `pnpm vitest run` | Node v26.9.0 | 115 files, 1310 tests, 0 failed | 0 |
| D-05 suite | `deno run -A --node-modules-dir=auto npm:vitest run` | Deno 2.9.6 | 115 files, 1310 tests, 0 failed (resolved vitest 3.2.7; CI pins `npm:vitest@3.2.6` — latent version-pin drift, not a blocker) | 0 |
| D-05 suite | `bun run vitest run` | Bun 1.3.14 | 115 files, 1310 tests, 0 failed | 0 |
| D-06 extended conformance | `pnpm conformance:extended` | Node v26.9.0 | 1 file, 1 test, passed | 0 |
| D-06 extended conformance | `deno run -A --node-modules-dir=auto npm:vitest run --config vitest.extended.config.ts` | Deno 2.9.6 | 1 file, 1 test, passed | 0 |
| D-06 extended conformance | `bun run vitest run --config vitest.extended.config.ts` | Bun 1.3.14 | 1 file, 1 test, passed | 0 |
| Skip/only audit | `grep -rnE '\.(skip\|todo\|only)\(\|skipIf\(\|runIf\(' src --include='*.test.ts' \| wc -l` | — | 0 | 0 |
| MIP-NN audit | `grep -rnE 'MIP-[0-9]{2}' src/ \| wc -l` | — | 0 | 0 |
| Dead-pointer audit | `grep -cF '../account-identity-proof.js' src/core/components/account-identity-proof.ts` | — | 0 | 0 |
| Dead-pointer audit | `grep -rnF '../account-identity-proof.js' src/core/__tests__ \| wc -l` | — | 0 | 0 |
| Working tree | `git status --porcelain -- src scripts docs .github package.json pnpm-lock.yaml tsconfig.json tsconfig.build.json` | — | empty (clean) | 0 |
| Opentui isolation | `git log 4a7130d..HEAD --format= --name-only \| grep -c '^examples/opentui/package.json$'` | — | 0 | 0 |

**No `fix(11)` or `chore(11)` commits were required.** Every gate step passed green on the first
attempt; the plan's failure-handling protocol was never triggered.

**Runtime versions used:** Node v26.9.0, Deno 2.9.6, Bun 1.3.14, pnpm (per repo lockfile).

## CI evidence (Task 3)

**PUSHED_SHA:** `c2f5a1201f3199655e17513e62a7b3392ef85b66` (GitHub `marmot-protocol/marmot-ts` master, verified via
`gh api repos/marmot-protocol/marmot-ts/commits/master`; pushed by the user — Claude never pushed).

**Ancestry check (plan Task 3 step 1):** `git merge-base --is-ancestor 785a1df c2f5a12` exits 0, and every one of
the 14 commits in `git log 4a7130d..785a1df --format=%H` is an ancestor of `c2f5a12` (zero non-ancestors). The
pushed SHA is a descendant of the locally-gated candidate with 23 later commits (docs/tracking and quick task
261005-dd6, mls_proposals GREASE parity — `7b59a72`, `162239d`, `c2f5a12`). The CI evidence below therefore covers the
Phase 11 code plus those later commits; the candidate `785a1df` itself was not a separate CI target.

Runs were located with `gh run list --repo marmot-protocol/marmot-ts --commit c2f5a12… --json …` and every row below
has `headSha == PUSHED_SHA`, `headBranch == master`, `status == completed`.

| Workflow | Run ID | Job URL | Job name | Conclusion | SHA |
|---|---|---|---|---|---|
| Tests | 37328779021 | https://github.com/marmot-protocol/marmot-ts/actions/runs/37328779021/job/111826194437 | Test on Node.js 20.x | success | c2f5a12 |
| Tests | 37328779021 | https://github.com/marmot-protocol/marmot-ts/actions/runs/37328779021/job/111826194436 | Test on Node.js 22.x | success | c2f5a12 |
| Tests | 37328779021 | https://github.com/marmot-protocol/marmot-ts/actions/runs/37328779021/job/111826194553 | Test on Node.js 24.x | success | c2f5a12 |
| Tests | 37328779021 | https://github.com/marmot-protocol/marmot-ts/actions/runs/37328779021/job/111826194222 | Test on Deno v2.x | success | c2f5a12 |
| Tests | 37328779021 | https://github.com/marmot-protocol/marmot-ts/actions/runs/37328779021/job/111826194465 | Test on Bun latest | success | c2f5a12 |
| Tests | 37328779021 | https://github.com/marmot-protocol/marmot-ts/actions/runs/37328779021/job/111826194614 | Test on Bun 1.1 | success | c2f5a12 |
| Build | 37328778947 | https://github.com/marmot-protocol/marmot-ts/actions/runs/37328778947/job/111826194352 | build | success | c2f5a12 |
| Build | 37328778947 | https://github.com/marmot-protocol/marmot-ts/actions/runs/37328778947/job/111826642674 | Package smoke (Node 20.x) | success | c2f5a12 |
| Build | 37328778947 | https://github.com/marmot-protocol/marmot-ts/actions/runs/37328778947/job/111826642522 | Package smoke (Node 24.x) | success | c2f5a12 |

Run URLs: Tests https://github.com/marmot-protocol/marmot-ts/actions/runs/37328779021 ; Build https://github.com/marmot-protocol/marmot-ts/actions/runs/37328778947 .

All job names match the plan's expected spelling exactly; no name mapping was needed. Acceptance checks, run live:
`gh run list --commit c2f5a12… --json workflowName,conclusion` filtered to Tests/Build prints `success` twice and
nothing else; `gh run view … --json jobs --jq '.jobs[] | select(.conclusion != "success") | .name'` prints nothing for
both runs.

### Informational runs (not gating)

| Workflow | Run ID | Run URL | Conclusion | Note |
|---|---|---|---|---|
| GitHub Pages | 37328779179 | https://github.com/marmot-protocol/marmot-ts/actions/runs/37328779179 | success | docs deploy for PUSHED_SHA |
| Release | 37328779187 | https://github.com/marmot-protocol/marmot-ts/actions/runs/37328779187 | success | Updated the changesets "Version Packages" PR — #75 (https://github.com/marmot-protocol/marmot-ts/pull/75), `updatedAt` 2026-10-05T14:57:38Z, i.e. after the commit time of `c2f5a12` (14:52:59Z). No npm publish (changesets still pending). |

Also present on GitHub, informational only: `changeset-release/master` workflow runs (head `d4de504`) in state
`action_required` — that branch is the Version Packages PR's, whose workflows await maintainer approval. Not a
Phase 11 gate and unrelated to PUSHED_SHA.

## QA-04 verdict

**QA-04: PASSED.** The full Vitest suite is green on every required runtime:

- **Local (Task 1):** Node v26.9.0, Deno 2.9.6, Bun 1.3.14 — 115 files / 1310 tests / 0 failed on each, plus extended conformance on each.
- **CI (Task 3, PUSHED_SHA `c2f5a12`):** Node 20.x, 22.x, 24.x; Deno v2.x; Bun latest; Bun 1.1 — all `success` (Tests run 37328779021).
- **Build / lint / package smoke (D-06):** `pnpm lint` clean and `pnpm build` + `bash scripts/package-smoke/run.sh` green locally (Node/Bun/Deno); CI `build` plus `Package smoke (Node 20.x)` and `Package smoke (Node 24.x)` all `success` (Build run 37328778947).
- Zero skipped/only/todo tests; no test weakened (T-11-12).

**QA-05: PASSED.** Zero `MIP-NN` citations in `src/`, zero dead legacy-proof-module pointers, `0xf2f1` appears only in the
14-path CUT-02 keep set (see inventory), and the exports snapshot guard (`src/__tests__/exports.test.ts`, plan 11-02)
runs green in every local and CI runtime. Local evidence is from Task 1 plus plans 11-01/11-02; the CI suite
exercising the guard is part of the green Tests run above.

## D-07 Outcome (with caveat)

`grep -c 'Exports Snapshot & QA Gate' .planning/ROADMAP.md` returns 3 (matches the plan's acceptance
criterion). The same grep against `.planning/STATE.md` returns **0** — `STATE.md` consistently uses
the kebab-case slug `exports-snapshot-qa-gate` (in `current_phase_name`, "Current focus", and
"Current Position") rather than the title-case string `Exports Snapshot & QA Gate`. This is a real,
literal gap against the plan's acceptance criterion text, but it is benign: the phase is unambiguously
identified in STATE.md by its slug and number, so D-07's underlying intent (the phase is renamed and
consistently tracked) is satisfied in substance. The executor did **not** edit STATE.md because the
orchestrator's instructions reserve STATE.md/ROADMAP.md writes for the orchestrator. **Flagging for the
orchestrator:** either accept the kebab-case slug as satisfying D-07, or add the title-case phrase to
STATE.md in its own pass.

## D-08 Outcome

Already resolved — no work performed. `pnpm lint` passes with zero diffs. Per 11-RESEARCH.md, the
drift documented in Phase 10's `deferred-items.md` was fixed by commit `92bbdb8` during Phase 10
itself, before this phase began. No `pnpm format` was run and no commit was made (it would have
produced an empty/no-op commit, which the plan explicitly forbids).

## D-09 Verification

`refs/mdk` is confirmed at `798a3e07ede494d98c2ecf590c6e838a8c1dfcfe`, landed by commit `4a7130d`
(`chore(refs): fast-forward mdk to 798a3e07`) — this executor did not bump the submodule, only
verified the precondition.

**Upstream drift since research:** `refs/marmot` shows 0 new commits (`HEAD..origin/HEAD` empty).
`refs/mdk` also shows 0 new commits on the tracked ref; the fetch surfaced two unrelated feature
branches (`claude/recovery-audit-v5`, `claude/recovery-retire-inline-executor`) that are not on the
tracked branch and are not evaluated here. No new upstream commits require a decision —
11-RESEARCH.md's verdict ("no contradiction with shipped v2.0 behavior" for `73446bc9..798a3e07`)
stands unchanged.

## 0xf2f1 Inventory

`grep -rl '0xf2f1' src docs README.md | sort` returned exactly 14 paths, matching the expected
CUT-02 keep set byte-for-byte:

```
docs/client/best-practices.md
src/client/group/proposals/__tests__/invite-user.test.ts
src/client/group/__tests__/marmot-group.test.ts
src/client/__tests__/join-account-identity-proof.test.ts
src/client/__tests__/key-package-manager.test.ts
src/client/__tests__/unsupported-profile-groups.test.ts
src/core/components/account-identity-proof.ts
src/core/components/__tests__/account-identity-proof.test.ts
src/core/__tests__/capabilities.test.ts
src/core/__tests__/darkmatter-invite-compat.test.ts
src/core/__tests__/group.test.ts
src/core/__tests__/key-package.test.ts
src/engine/__tests__/group-engine.test.ts
src/__tests__/exports.test.ts
```

No extra or missing paths — QA-05's "0xf2f1 only in the CUT-02 keep set" criterion holds.

## Push Hand-off (history)

**Candidate SHA (locally gated):** `785a1df80fd5d9be29a2e5253c94ded8888762d6`

Commits unpushed at the time of Task 1 (`git log --oneline origin/master..master`, 18 total, oldest last):

```
785a1df docs(phase-11): update tracking after wave 1
6687f68 chore: merge executor worktree (worktree-agent-a1b3b14dcee692624)
8ae359e chore: merge executor worktree (worktree-agent-a6901bd927ac2e8b2)
55cba4d docs(11-02): append self-check result to plan summary
8a88927 docs(11-02): complete exports snapshot guard + package-smoke signer fix plan
8dcb428 docs(11-01): record self-check result in plan summary
f4d1d16 docs(11-01): add plan summary
e736c70 fix(11): give package-smoke a real AuthorizationProofSigner (QA-04, D-06)
e857449 chore(11): cite topic spec paths instead of deprecated MIP numbers (D-10)
a3fbe1e test(11): snapshot every public subpath and guard against legacy proof exports (QA-05)
7837d95 docs(11): drop dead pointers to the deleted legacy proof module (QA-05, D-01)
e0ee492 docs(phase-11): begin phase execution
aa0ed81 docs(11): create phase plan
bec6cef docs(11): create phase plan
4a7130d chore(refs): fast-forward mdk to 798a3e07
15b8182 docs(11): research exports snapshot and QA gate phase
49895d2 docs(11): capture phase context; rename phase to Exports Snapshot & QA Gate
cde0a88 docs(planning): drop QA-03 Rust-signed fixture requirement from v2.0
```

**Task 2 resolution:** the user pushed master themselves (resume signal: "pushed c2f5a1201f3199655e17513e62a7b3392ef85b66").
Claude did not push (T-11-10). The pushed SHA descends from the candidate; see CI evidence above.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written. No `fix(11)`/`chore(11)` commits were needed and the CI failure protocol was never triggered.

### Notes / Escalations (not auto-fixed)

**1. [Informational] PUSHED_SHA is a descendant of, not equal to, the locally-gated candidate**
- The user pushed after 23 additional commits landed (docs/tracking plus quick task 261005-dd6). Per Task 2's acceptance criteria a descendant is valid; the ancestry check passed for every Phase 11 commit. CI therefore validated a superset of the locally gated tree.

**2. [Rule 4 boundary — documented, not fixed] D-07 STATE.md title-case gap**
- **Found during:** Task 1, step 2 (D-07 verification)
- **Issue:** `.planning/STATE.md` never contains the literal string `Exports Snapshot & QA Gate`; only the kebab-case slug `exports-snapshot-qa-gate` appears.
- **Why not auto-fixed:** orchestrator instructions explicitly reserve STATE.md/ROADMAP.md writes for the orchestrator.
- **Resolution:** left for the orchestrator (see "D-07 Outcome").

**3. [Informational] Latent version-pin drift:** local Deno run resolved vitest 3.2.7 while CI pins `npm:vitest@3.2.6`. Both green; not a blocker.

## Self-Check: PASSED

- Ancestry: all 14 commits in `4a7130d..785a1df` are ancestors of `c2f5a12` — verified this session (`bad=0`).
- Runs: Tests (37328779021) and Build (37328778947) both `success`, `headSha == c2f5a12…` — verified via `gh run list --commit`.
- Jobs: all nine required jobs listed with `success`; zero non-success jobs in either run — verified via `gh run view --json jobs`.
- Pages (37328779179) and Release (37328779187) recorded as informational; Version Packages PR #75 confirmed updated after the push.
- No STATE.md/ROADMAP.md edits and no push performed by this executor.

---
*Phase: 11-exports-snapshot-qa-gate*
*Task 1 completed: 2026-09-28 — Task 2 (user push) resolved and Task 3 (CI evidence) completed: 2026-10-05*
