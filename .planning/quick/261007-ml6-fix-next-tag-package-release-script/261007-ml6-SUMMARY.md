---
status: complete
---

# Next release script

Fixed authentication with npm whoami. Generate the temporary prerelease directly
without version hooks or Git tags, build and pack once, verify the resulting
tarball and publish that exact artifact with the next dist-tag. Restore package
files on failure, success, SIGINT and SIGTERM. Documented the local release flow.

Validation: nine mocked release scenarios, bash syntax check, formatting check,
pnpm build and real package tarball verification with the fork publishing guard
passed. The tarball verifier required escalation because sandbox restrictions
blocked child-process execution. No npm publication was performed.

Both protocol references were fetched and already at origin/HEAD; no pointer
updates were needed. No protocol or public library behavior changed.
