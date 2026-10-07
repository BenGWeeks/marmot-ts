---
status: complete
---

# Changesets removal complete

Consolidated all ten master changesets into the Unreleased changelog with customer-facing descriptions and migration guidance. Removed Changesets configuration, CLI, lockfile dependencies, and release action. Releases now use version tags and version-specific changelog notes; contributor and agent guidance requires Unreleased entries.

Validation: build; package smoke tests in Node, Bun, and Deno and consumer type checks; release tag/notes success and rejection cases; shell syntax; focused Prettier and git whitespace checks; pnpm 10 frozen lockfile check. No packages published or notifications sent.

Protocol references refreshed in a separate chore(refs) commit. No protocol implementation changes. Work executed inline under the skill's spawn-restriction fallback. Unrelated planning cleanup changes belong to separate ongoing work.
