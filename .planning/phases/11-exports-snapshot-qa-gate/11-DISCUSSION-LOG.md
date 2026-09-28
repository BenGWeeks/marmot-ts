# Phase 11: Exports Snapshot & QA Gate - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-28
**Phase:** 11-exports-snapshot-qa-gate
**Areas discussed:** Meaning of "no stale 0xf2f1", Exports snapshot scope, What counts as green, Phase cleanup & naming

Pre-discussion: the user dropped QA-03 (Rust-signed MDK `0x8009` fixture) from v2.0 (commit cde0a88).

---

## Meaning of "no stale 0xf2f1"

| Option | Description | Selected |
|--------|-------------|----------|
| Dead/misleading only | Keep the rejection constant, negative tests and docs note; remove exported, dead or misleading mentions; add an export guard | ✓ |
| Zero mentions anywhere | Replace the literal and rewrite the tests | |
| Tests and code only | Keep code and tests, drop it from user docs | |

## Exports snapshot scope

| Option | Description | Selected |
|--------|-------------|----------|
| All public subpaths | Inline snapshots for every subpath except ./mls | ✓ |
| Root only | Update only the existing root snapshot | |
| Root + core | Add ./core only | |

## What counts as green

| Option | Description | Selected |
|--------|-------------|----------|
| Local runs + CI | Local Node/Deno/Bun latest, CI for Node 20/22/24 and Bun 1.1 | ✓ |
| CI only | GitHub Actions is the gate | |
| Local only | Every version run locally | |

## Phase cleanup & naming (multi-select)

| Option | Description | Selected |
|--------|-------------|----------|
| Rename phase | "Exports Snapshot & QA Gate" | ✓ |
| Fix Prettier drift | `pnpm format` | ✓ |
| Bump refs/mdk | Review 41 commits, chore(refs) bump | ✓ |
| Fix MIP-NN citations | Rewrite ~26 comments to new spec paths | ✓ |

## Claude's Discretion

- Snapshot test structure, the legacy-export guard mechanism, plan/wave breakdown.

## Deferred Ideas

- QA-03 Rust fixture (Future Requirements); GroupFactory relay-less fail-fast (Phase 10 open question).
