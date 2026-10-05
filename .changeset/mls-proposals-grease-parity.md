---
"@internet-privacy/marmot-ts": minor
---

KeyPackage events (kind 30443) now publish the `mls_proposals` tag exactly as the leaf
advertises its proposals, GREASE ids included (deduplicated, in leaf order). MDK requires
that tag to match the decoded leaf exactly and does not strip GREASE from proposals, so it no
longer rejects marmot-ts KeyPackages whose leaf drew a GREASE proposal. `mls_extensions` is
still GREASE-filtered.

New `checkKeyPackageProposalsTag` helper and `KeyPackageProposalsTagCheck` type compare an
event's `mls_proposals` tag to its decoded KeyPackage. They accept an exact match with GREASE
or an exact match with GREASE removed from both sides (KeyPackages from older marmot-ts), and
report `malformed` or `mismatch` otherwise.

`createInviteIntent` now rejects, and `evaluateKeyPackageForGroup` reports, KeyPackage events
whose `mls_proposals` tag is absent, malformed, or does not match the leaf's advertised
proposals.
