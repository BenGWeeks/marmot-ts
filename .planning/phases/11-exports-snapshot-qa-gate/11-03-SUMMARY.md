---
phase: 11-exports-snapshot-qa-gate
plan: 03
subsystem: testing
tags: [qa-04, qa-05, qa-gate, ci-evidence, d-05, d-06, d-07, d-08, d-09, milestone-v2.0]

requires:
  - phase: 11-exports-snapshot-qa-gate
    provides: "plans 11-01 (stale-reference/MIP-citation hygiene) and 11-02 (exports snapshot guard + package-smoke signer fix), both merged to master"
provides:
  - "Full local gate evidence (lint, build, package smoke, three-runtime suite + extended conformance) for the pushed candidate SHA"
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
  - "D-07 STATE.md gap (title-case phase name absent, only kebab-case slug present) recorded as a caveat, not fixed — this executor's orchestrator instructions explicitly reserve STATE.md/ROADMAP.md writes for the orchestrator"
  - "No fix(11)/chore(11) commits were needed — every gate step (lint, build, package smoke, three-runtime suite, extended conformance, all integrity audits) passed green on the first attempt"

requirements-completed: []

coverage:
  - id: D-05-D-06
    description: "Full local gate (lint, build, package smoke, three-runtime Vitest suite, three-runtime extended conformance) green on Node v26.9.0, Deno 2.9.6, Bun 1.3.14"
    requirement: "QA-04"
    verification:
      - kind: other
        ref: "pnpm lint; pnpm build; bash scripts/package-smoke/run.sh; pnpm vitest run; deno run -A --node-modules-dir=auto npm:vitest run; bun run vitest run; pnpm conformance:extended (+Deno/Bun variants) — all exit 0, this session"
        status: pass
    human_judgment: false
  - id: D-09
    description: "refs/mdk precondition verified at 798a3e07 (commit 4a7130d); no upstream drift on refs/marmot or refs/mdk's tracked branch since"
    requirement: "QA-04"
    verification:
      - kind: other
        ref: "git -C refs/mdk rev-parse HEAD; git log --oneline -1 4a7130d; git -C refs/marmot fetch + log HEAD..origin/HEAD; git -C refs/mdk fetch + log HEAD..origin/HEAD — all this session"
        status: pass
    human_judgment: false

duration: pending (draft — Task 1 only; Task 2 checkpoint + Task 3 CI evidence remain)
completed: pending
status: in-progress
---

# Phase 11 Plan 03: QA Gate & CI Evidence Summary (DRAFT — Task 1 complete, awaiting push)

**This is a draft SUMMARY covering Task 1 (the full local gate) only.** Task 2 is a blocking
`checkpoint:human-action` — the user must push `master` — and Task 3 (CI evidence collection) has
not run yet. A continuation agent will complete this SUMMARY after the push.

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

**No `fix(11)` or `chore(11)` commits were required.** Every gate step listed above passed green on
the first attempt; the plan's failure-handling protocol (small fix inline, re-run gate; or escalate)
was never triggered.

**Runtime versions used:** Node v26.9.0, Deno 2.9.6, Bun 1.3.14, pnpm (per repo lockfile).

## D-07 Outcome (with caveat)

`grep -c 'Exports Snapshot & QA Gate' .planning/ROADMAP.md` returns 3 (matches the plan's acceptance
criterion). The same grep against `.planning/STATE.md` returns **0** — `STATE.md` consistently uses
the kebab-case slug `exports-snapshot-qa-gate` (in `current_phase_name`, "Current focus", and
"Current Position") rather than the title-case string `Exports Snapshot & QA Gate`. This is a real,
literal gap against the plan's acceptance criterion text, but it is benign: the phase is unambiguously
identified in STATE.md by its slug and number ("Phase 11 — exports-snapshot-qa-gate" /
"Phase: 11 (exports-snapshot-qa-gate)"), so D-07's underlying intent (the phase is renamed and
consistently tracked) is satisfied in substance. This executor did **not** edit STATE.md to add the
title-case string, because the orchestrator's instructions for this execution explicitly reserve
STATE.md/ROADMAP.md writes for the orchestrator. **Flagging for the orchestrator's attention**: either
accept the kebab-case slug as satisfying D-07, or add the title-case phrase to STATE.md in its own
pass.

## D-08 Outcome

Already resolved — no work performed. `pnpm lint` passes with zero diffs. Per 11-RESEARCH.md, the
drift documented in Phase 10's `deferred-items.md` was fixed by commit `92bbdb8` during Phase 10
itself, before this phase began. No `pnpm format` was run and no commit was made (running it would
have produced an empty/no-op commit, which the plan explicitly forbids).

## D-09 Verification

`refs/mdk` is confirmed at `798a3e07ede494d98c2ecf590c6e838a8c1dfcfe`, landed by commit `4a7130d`
(`chore(refs): fast-forward mdk to 798a3e07`) — this executor did not bump the submodule, only
verified the precondition, per the plan's explicit "already done by the orchestrator" instruction.

**Upstream drift since research:** `refs/marmot` shows 0 new commits (`HEAD..origin/HEAD` empty).
`refs/mdk` also shows 0 new commits on the tracked ref (`HEAD..origin/HEAD` empty); the fetch surfaced
two unrelated feature branches (`claude/recovery-audit-v5`, `claude/recovery-retire-inline-executor`)
that are not on the default/tracked branch and are not evaluated here. No new upstream commits require
a decision — 11-RESEARCH.md's verdict ("no contradiction with shipped v2.0 behavior" for the reviewed
range `73446bc9..798a3e07`) stands unchanged.

## 0xf2f1 Inventory

`grep -rl '0xf2f1' src docs README.md | sort` returned exactly 14 paths, matching the expected
CUT-02 keep set from 11-RESEARCH.md/the plan's interfaces block byte-for-byte:

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

## Push Hand-off (for Task 2 / continuation agent)

**Candidate SHA:** `785a1df80fd5d9be29a2e5253c94ded8888762d6`

**Unpushed commits** (`git log --oneline origin/master..master`, 18 total, oldest last):

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

**Nothing has been pushed.** Task 2 (`checkpoint:human-action`) is next: the user must push `master`
themselves. This executor stops here.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written for Task 1. No `fix(11)`/`chore(11)` commits were needed.

### Escalations (not auto-fixed)

**1. [Rule 4 boundary — documented, not fixed] D-07 STATE.md title-case gap**
- **Found during:** Task 1, step 2 (D-07 verification)
- **Issue:** `.planning/STATE.md` never contains the literal string `Exports Snapshot & QA Gate`;
  only the kebab-case slug `exports-snapshot-qa-gate` appears (3 locations).
- **Why not auto-fixed:** This execution's orchestrator instructions explicitly state "Do NOT update
  STATE.md or ROADMAP.md — the orchestrator owns those writes," overriding the plan's general
  failure-handling protocol (which would normally treat a small doc fix as auto-fixable).
- **Resolution:** Documented above under "D-07 Outcome (with caveat)" for the orchestrator to decide.

## Self-Check: IN PROGRESS

This SUMMARY will receive a final Self-Check section once Task 3 completes.

---
*Phase: 11-exports-snapshot-qa-gate*
*Task 1 completed: 2026-09-28 (this session) — Task 2 (push checkpoint) and Task 3 (CI evidence) pending*
