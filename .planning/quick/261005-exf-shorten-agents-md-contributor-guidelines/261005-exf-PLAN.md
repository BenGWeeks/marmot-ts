---
mode: quick
files_modified: [AGENTS.md]
---
# Shorten contributor guidelines

1. Replace duplicated generated sections and empty headings with a concise contributor guide; retain operational constraints and the managed developer profile.
2. Verify commands against package.json, check Markdown formatting and word count, then commit.

Verification: `pnpm exec prettier --check AGENTS.md`; `git diff --check`.
