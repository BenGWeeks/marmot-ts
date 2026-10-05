---
phase: 261005-dd6-mls-proposals-keep-grease-decode-accepts
plan: 01
subsystem: core/key-package-event, client/group/invite
tags: [wire-format, mdk-parity, grease, key-package, kind-30443]
status: complete
provides: [checkKeyPackageProposalsTag, KeyPackageProposalsTagCheck]
affects: [createKeyPackageEvent mls_proposals output, createInviteIntent new rejection, evaluateKeyPackageForGroup new reasons]
key-files:
  created: [.changeset/mls-proposals-grease-parity.md]
  modified: [src/core/key-package-event-encode.ts, src/core/key-package-event-decode.ts, src/core/key-package-eligibility.ts, src/client/group/invite.ts, src/core/__tests__/key-package-event.test.ts, src/core/__tests__/key-package-tag-parity.test.ts, src/client/group/__tests__/invite.test.ts, src/__tests__/exports.test.ts]
decisions:
  - mls_proposals carries GREASE exactly as the leaf advertises it (deduped, leaf order); mls_extensions stays GREASE-filtered, matching MDK's asymmetric handling
  - Receive side accepts exact (GREASE included) or grease-stripped (GREASE removed from both sides) matches; absent/repeated/empty/duplicate = malformed, anything else = mismatch
  - Hard reject only at createInviteIntent (third-party trust boundary), mirrored as a reason in evaluateKeyPackageForGroup; NOT wired into KeyPackageManager.track()/KeyPackageStore.addPublished()
metrics: {completed: 2026-10-05, tasks: 3, commits: 2}
---
# Quick 261005-dd6: mls_proposals GREASE parity Summary

KeyPackage events now publish mls_proposals with GREASE kept, so MDK's require_multi_value_key_package_tag_matches accepts them. The new never-throwing checkKeyPackageProposalsTag accepts exact-with-GREASE and GREASE-stripped tags. It is enforced at createInviteIntent and mirrored in evaluateKeyPackageForGroup.

## Tasks

| # | Task | Commit |
| - | ---- | ------ |
| 1 | Keep GREASE + add check | 7b59a72 |
| 2 | Invite/eligibility enforcement + changeset | 162239d |
| 3 | Verification gate | no changes, no commit |

## Verification

- build OK; full vitest 115 files / 1336 tests pass; exports snapshot +2 lines only; lint/format clean; compile + root tsc clean; opentui typecheck OK; Rust fixture checks as exact; no submodule pointer changes.
- Post-merge on master: the 4 touched test files pass (148 tests).

## Deviations from Plan

None in library code. Worktree setup only: cleared ts-mls/node_modules before submodule init; checked out refs/mdk at its pinned 798a3e07 because 3 suites failed with ENOENT on refs/mdk conformance vectors (not a regression).

## Not verified

Live interop against a running MDK peer; Deno/Bun test legs.

## Self-Check: PASSED
