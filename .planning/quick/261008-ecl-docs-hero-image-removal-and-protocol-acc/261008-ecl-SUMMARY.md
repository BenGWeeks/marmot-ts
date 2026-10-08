---
status: complete
quick_id: 261008-ecl
date: 2026-10-08
commits: [5227069, ec51dbf, fb0008b]
---

# Quick Task 261008-ecl: Docs hero image removal and protocol accuracy review

## Done
- `chore(refs)` 5227069: refs/mdk fast-forwarded to 7692e266 (reaction targets, Markdown timestamps — no docs impact); refs/marmot already current (7fabb81).
- ec51dbf: removed `heroImage` frontmatter (5 pages), `PageHero.vue` + layout slot, and 7 `docs/public/images/*.png`.
- fb0008b: reviewed all 22 docs pages against src/, refs/marmot, refs/mdk (4 parallel reviewers) and applied fixes (4 parallel fixers, shared conventions). `vitepress build` clean, Prettier clean.

## Deviation from quick workflow
Planner/executor agents were replaced by orchestrator-run review + fix subagents; no PLAN.md was written (task scope was a docs review, fully described above).

## Library follow-ups (code, not docs — documented as "Spec deviation" callouts)
1. Last-resort marker uses legacy MLS ext `0x000a`; spec/MDK use app_data component `0x0004`.
2. kind 30443 emits a non-spec `relays` tag (MDK asserts absent); `KeyPackageManager.rotate` reads relays back from it.
3. `joinGroupFromWelcome` only marks consumed KeyPackages used; spec MUST deletes private material (rotate() does delete).
4. `clientId` / `d` accepted unvalidated; JSDoc in marmot-client.ts / key-package-manager.ts recommends device labels; `convergencePolicy` JSDoc recommends `Infinity`.
5. `extraProposals` type only accepts single-proposal actions and the engine pushes array results as one entry — `proposeRemoveUser` / `proposeUpdateMetadata` / `proposeLeaveGroup` cannot be passed directly (flatten in engine?).
6. `groups.connect()` starts `void drain([event])` per live event — possible concurrent `ingest()` generators.
7. `connect()`/`connectAll()` swallow `invalidated` / `stateInvalidated`; `GroupRumorHistory` has no remove API.
8. Possibly unenforced: Welcome author must be an active admin (protocol-core/joining.md step 8).
9. `marmotAuthService` not exported; PrivateMessage-only classifiers exported but drop real (PublicMessage) commits.
10. No NIP-40 `expiration` tag on kind 445 in retention-enabled groups (SHOULD).
11. `watch()` can't be cancelled until next update (needs AbortSignal).
