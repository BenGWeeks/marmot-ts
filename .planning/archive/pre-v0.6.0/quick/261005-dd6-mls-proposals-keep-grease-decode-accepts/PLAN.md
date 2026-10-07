---
phase: 261005-dd6-mls-proposals-keep-grease-decode-accepts
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/core/key-package-event-encode.ts
  - src/core/key-package-event-decode.ts
  - src/core/key-package-eligibility.ts
  - src/client/group/invite.ts
  - src/core/__tests__/key-package-event.test.ts
  - src/core/__tests__/key-package-tag-parity.test.ts
  - src/client/group/__tests__/invite.test.ts
  - src/__tests__/exports.test.ts
  - .changeset/mls-proposals-grease-parity.md
autonomous: true
requirements: [QUICK-261005-dd6]

must_haves:
  truths:
    - "createKeyPackageEvent emits an mls_proposals tag whose values are the leaf's capabilities.proposals INCLUDING GREASE ids: lowercase 0x%04x, deduplicated, in leaf order. MDK's require_multi_value_key_package_tag_matches then accepts marmot-ts KeyPackage events because MDK does not strip GREASE from proposals."
    - "createKeyPackageEvent still removes GREASE ids from the mls_extensions tag. MDK strips GREASE from extensions on both its publish and validate sides."
    - "checkKeyPackageProposalsTag(event, keyPackage) never throws. It returns { kind: 'match', mode: 'exact' } when the tag's value set equals the leaf proposals set with GREASE included. It returns { kind: 'match', mode: 'grease-stripped' } when the two sets are equal only after GREASE ids are removed from both sides (the legacy marmot-ts tag). It returns { kind: 'mismatch' } when a real proposal is missing or extra, or when a value is not spelled canonically. It returns { kind: 'malformed' } when the tag is absent, repeated, empty, has an empty value, or repeats a value."
    - "createInviteIntent throws a createInviteIntent:-prefixed Error that names mls_proposals when the check is malformed or mismatch. It still accepts the MDK/new-marmot-ts raw tag and the legacy GREASE-stripped tag."
    - "evaluateKeyPackageForGroup adds a reason containing 'mls_proposals' when the check is malformed or mismatch. It adds no such reason for either match mode."
    - "The pinned Rust fixture tags (key-package-tags-rust.json) validate as { kind: 'match', mode: 'exact' } against the Rust fixture KeyPackage (key-package-lifetime-rust.json)."
    - "No error message or eligibility reason echoes attacker-controlled tag values."
  artifacts:
    - path: "src/core/key-package-event-decode.ts"
      provides: "checkKeyPackageProposalsTag + KeyPackageProposalsTagCheck discriminated union"
      exports: ["checkKeyPackageProposalsTag", "KeyPackageProposalsTagCheck"]
    - path: "src/core/key-package-event-encode.ts"
      provides: "mls_proposals tag built from raw leaf proposals (GREASE kept, deduped); mls_extensions still GREASE-filtered"
    - path: "src/client/group/invite.ts"
      provides: "createInviteIntent hard-rejects malformed/mismatched mls_proposals after the lifetime and credential checks"
      contains: "checkKeyPackageProposalsTag"
    - path: "src/core/key-package-eligibility.ts"
      provides: "evaluateKeyPackageForGroup mirrored mls_proposals reason"
      contains: "checkKeyPackageProposalsTag"
    - path: ".changeset/mls-proposals-grease-parity.md"
      provides: "minor changeset describing the wire fix + new helper + new invite rejection"
  key_links:
    - from: "src/client/group/invite.ts"
      to: "src/core/key-package-event-decode.ts"
      via: "checkKeyPackageProposalsTag(keyPackageEvent, keyPackage) after getKeyPackage + credential identity check"
      pattern: "checkKeyPackageProposalsTag\\(keyPackageEvent"
    - from: "src/core/key-package-eligibility.ts"
      to: "src/core/key-package-event-decode.ts"
      via: "checkKeyPackageProposalsTag(keyPackageEvent, keyPackage) inside the existing try block"
      pattern: "checkKeyPackageProposalsTag\\(keyPackageEvent"
    - from: "src/core/key-package-event-decode.ts"
      to: "src/utils/tag-cardinality.ts"
      via: "getListTag(event, KEY_PACKAGE_PROPOSALS_TAG) for absent/repeated/empty/duplicate rejection"
      pattern: "getListTag\\(event, KEY_PACKAGE_PROPOSALS_TAG\\)"
---

<objective>
Make marmot-ts KeyPackage events (kind 30443) interoperate with MDK by publishing the `mls_proposals` tag exactly as the leaf advertises it, GREASE included. Add a marmot-ts receive-side check that accepts either an exact match with GREASE or an exact match without GREASE.

User request: "Lets not filter our grease values from the mls_proposals tag so that it matches the key package. however in our marmot-ts implementation we should support checking exact matches with grease and without grease".

Purpose: ts-mls `defaultCapabilities()` adds GREASE proposal ids at random, each of the 15 values with 10% probability (ts-mls/src/grease.ts). So most fresh marmot-ts leaves advertise something like [0x4a4a, 0xeaea, 0x0008, 0x000a]. `createKeyPackageEvent` currently removes GREASE from `mls_proposals`. MDK requires the `mls_proposals` value SET to equal the leaf's advertised proposals exactly (refs/mdk crates/marmot-app/src/key_package_records.rs `key_package_from_borrowed_record` → `require_multi_value_key_package_tag_matches`, present at the pinned submodule HEAD and origin/HEAD, introduced in MDK 5fe0c8f7 on 2026-07-24). MDK's `advertised_capabilities_from_caps` (crates/cgka-engine/src/capabilities.rs) strips GREASE from extensions but NOT from proposals. As a result MDK rejects every marmot-ts KeyPackage whose leaf drew any GREASE proposal, with "mls_proposals tag does not exactly match decoded KeyPackage metadata". Today marmot-ts does not verify `mls_proposals` against the decoded KeyPackage at all.

Wiring decision (requirement 2, justified):
- The hard check goes in `createInviteIntent` (src/client/group/invite.ts). This is the marmot-ts trust boundary for third-party KeyPackage events, the "second 30443 consumption path". It already checks the signature, d/i/version cardinality, Lifetime, and credential identity against the event author, all with `createInviteIntent:`-prefixed throws. That makes it the direct analog of MDK's fetch-time `key_package_from_borrowed_record`, which checks the id-list tags next to credential-vs-author and the i tag. The new check runs AFTER the Lifetime check and AFTER the credential-identity check. The existing lifetime tests in invite.test.ts build events with only d/i/mls_protocol_version tags and must keep failing on lifetime, not on mls_proposals.
- A mirrored, non-throwing reason goes in `evaluateKeyPackageForGroup` (src/core/key-package-eligibility.ts). This follows the WIRE-01 defense-in-depth pattern already used there for Lifetime, and lets the opentui invite modal (`group.evaluateKeyPackage`) show the reason before an invite is attempted.
- The check is deliberately NOT wired into `KeyPackageManager.track()` or `KeyPackageStore.addPublished()`. Those take in the account's OWN published KeyPackages for lifecycle bookkeeping (rotation, purge, kind-5 deletion). A hard reject there would hide self-published events that predate the `mls_proposals` tag from deletion. That is a regression with no interop benefit, because MDK's check sits on the fetch-for-invite path.
- The helper is a public named export from the decode module, next to `getKeyPackageExtensions`, `getKeyPackageReference`, etc. That module already holds the public kind-30443 tag readers, and downstream apps doing their own KeyPackage discovery need the same check. Because it is a public export, the `.` and `./core` inline export snapshots get one new entry each.
- Absent tag = malformed = rejected. This matches the spec ("the current tag set" includes mls_proposals, and id-list tags MUST carry at least one value), MDK ("missing mls_proposals tag"), and `TAG_CARDINALITY[30443].mls_proposals = "list"`. Legacy KeyPackages without the tag cannot be invited, which matches MDK. They expire within the 84-day Lifetime cap anyway.
- The grease-stripped mode removes GREASE from both the tag and the leaf, as the request specifies. So a tag carrying a different GREASE id than the leaf still matches in that mode. This is accepted: GREASE ids carry no semantics (RFC 9420 §13.5), and this mode exists to accept KeyPackages published by older marmot-ts.

Output: encoder fix, `checkKeyPackageProposalsTag` + `KeyPackageProposalsTagCheck`, invite and eligibility wiring, tests, an exports snapshot update, and a changeset.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@src/core/key-package-event-encode.ts
@src/core/key-package-event-decode.ts
@src/core/grease.ts
@src/core/protocol.ts
@src/utils/tag-cardinality.ts
@src/core/key-package-eligibility.ts
@src/client/group/invite.ts
@src/core/__tests__/key-package-event.test.ts
@src/core/__tests__/key-package-tag-parity.test.ts
@src/client/group/__tests__/invite.test.ts
@src/__tests__/exports.test.ts

Interfaces the executor needs (all already exist; do not change them):
- `getListTag<T extends { tags: string[][] }>(event: T, name: string): string[] | undefined` in src/utils/tag-cardinality.ts. It returns undefined when the tag is absent, repeated, empty, has an empty value, or has duplicate values. It never throws.
- `GREASE_VALUE_SET: ReadonlySet<number>` and `isGreaseValue(value: number): boolean` in src/core/grease.ts. Note: grease.ts is NOT re-exported from src/core/index.ts.
- `KEY_PACKAGE_PROPOSALS_TAG = "mls_proposals"` in src/core/protocol.ts.
- `generateKeyPackage({ credential, ciphersuiteImpl, signer, capabilities? })` in src/core/key-package.ts. When `capabilities` is given it is passed through `ensureMarmotCapabilities`, which appends 0x0008 (app_data_update) and then 0x000a (self_remove) if they are missing. Passing `capabilities: { ...defaultCapabilities(), proposals: [0x4a4a, 0xeaea] }` gives a deterministic leaf proposal list of [0x4a4a, 0xeaea, 0x0008, 0x000a]. Passing `proposals: []` gives [0x0008, 0x000a] with no GREASE. `defaultCapabilities` comes from src/core/default-capabilities.ts.
- The leaf in the Rust fixture `src/__tests__/fixtures/key-package-lifetime-rust.json` (`lifetime.key_package_tls_hex`, MLSMessage-framed) advertises proposals [0x0008] with no GREASE. The fixture `key-package-tags-rust.json` carries `["mls_proposals", "0x0008"]`, so the existing production-parity test keeps passing after the encoder change. This was verified while planning by decoding the fixture with ts-mls.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Keep GREASE in the mls_proposals tag and add checkKeyPackageProposalsTag</name>
  <files>src/core/key-package-event-encode.ts, src/core/key-package-event-decode.ts, src/core/__tests__/key-package-event.test.ts, src/core/__tests__/key-package-tag-parity.test.ts, src/__tests__/exports.test.ts</files>
  <behavior>
    - Encoder: a KeyPackage generated with capabilities.proposals [0x4a4a, 0xeaea] produces a tag equal to ["mls_proposals", "0x4a4a", "0xeaea", "0x0008", "0x000a"]. More generally, the tag values equal the leaf proposals mapped to lowercase 0x%04x in leaf order.
    - Encoder dedup: a publicPackage whose leafNode.capabilities.proposals is [0x0008, 0x4a4a, 0x0008] (tamper the leaf with an object spread; createKeyPackageEvent does not verify leaf signatures) produces ["mls_proposals", "0x0008", "0x4a4a"].
    - Encoder: a GREASE id present in leafNode.capabilities.extensions still does not appear in the mls_extensions tag. The existing test for GREASE in keyPackage.extensions must keep passing unchanged.
    - checkKeyPackageProposalsTag, using a leaf with proposals [0x4a4a, 0xeaea, 0x0008, 0x000a]:
      - The encoder's own tag returns {kind:"match", mode:"exact"}.
      - The same values in a different order return {kind:"match", mode:"exact"}.
      - ["mls_proposals","0x0008","0x000a"] (legacy marmot-ts, GREASE stripped) returns {kind:"match", mode:"grease-stripped"}.
      - ["mls_proposals","0x4a4a","0xeaea","0x0008"], which is missing the real 0x000a, returns {kind:"mismatch"}. So does ["mls_proposals","0x0008"].
      - ["mls_proposals","0x4a4a","0xeaea","0x0008","0x000a","0x0003"], which has an extra real proposal, returns {kind:"mismatch"}. So does ["mls_proposals","0x0008","0x000a","0x0003"].
      - ["mls_proposals","0x0008","0x0008","0x000a"], a duplicate value, returns {kind:"malformed"}.
      - No mls_proposals tag returns {kind:"malformed"}. Two mls_proposals tags return {kind:"malformed"}. ["mls_proposals"] with no values returns {kind:"malformed"}.
      - ["mls_proposals","0x0008","0x000A"], a non-canonical uppercase spelling, returns {kind:"mismatch"}, because the spec compares id-list values as exact strings.
    - checkKeyPackageProposalsTag with a no-GREASE leaf (proposals: [] → [0x0008, 0x000a]) and tag ["mls_proposals","0x0008","0x000a"] returns {kind:"match", mode:"exact"}.
    - MDK parity: decoding the Rust fixture KeyPackage (same decode as expectProductionTags in key-package-tag-parity.test.ts) and checking it against `{ tags: rust.tags }` returns {kind:"match", mode:"exact"}.
    - None of the calls above throw.
  </behavior>
  <action>
    RED first. Add the behavior tests above.
    - In src/core/__tests__/key-package-event.test.ts, add the encoder cases inside the existing "createKeyPackageEvent" describe. Add a new describe "checkKeyPackageProposalsTag". Build the GREASE-bearing KeyPackage with generateKeyPackage and an explicit `capabilities` override, as described in the context section. Never rely on ts-mls random GREASE for any assertion. Build test events by taking the createKeyPackageEvent template and replacing or removing the mls_proposals tag in `tags`. No signing is needed because the helper only reads `tags`. Import checkKeyPackageProposalsTag from "../key-package-event.js" and defaultCapabilities from "../default-capabilities.js".
    - In src/core/__tests__/key-package-tag-parity.test.ts, add one MDK-parity case in the "MDK kind-30443 tag parity" describe. Reuse the existing fixture decode.
    - Run the tests and confirm they fail.

    GREEN, encoder (src/core/key-package-event-encode.ts):
    - Replace the proposalTypes computation. Map `keyPackage.leafNode.capabilities?.proposals ?? []` to lowercase 0x-prefixed 4-digit hex, keep the first occurrence of each value (dedupe in leaf order), and drop the GREASE filter.
    - Rewrite the comment above it to explain the MDK exact-match parity. MDK validates the mls_proposals value set against the decoded leaf's advertised proposals without stripping GREASE (cite refs/mdk crates/marmot-app/src/key_package_records.rs `require_multi_value_key_package_tag_matches` and crates/cgka-engine/src/capabilities.rs `advertised_capabilities_from_caps`), so the tag must carry GREASE ids exactly as the leaf does. Also say that values are deduplicated because refs/marmot transports/nostr.md "KeyPackage publication" forbids repeated id-list values.
    - Leave the mls_extensions GREASE filtering logic unchanged. Extend its comment to say MDK strips GREASE from extensions on both publish and validate, which is why extensions and proposals are treated differently.
    - isGreaseValue stays imported because the extensions filter still uses it.

    GREEN, validator (src/core/key-package-event-decode.ts):
    - Add the exported type KeyPackageProposalsTagCheck as a `kind`-discriminated union: { kind: "match"; mode: "exact" | "grease-stripped" } | { kind: "malformed" } | { kind: "mismatch" }. Give it a JSDoc for each variant.
    - Add the exported function checkKeyPackageProposalsTag, generic over `T extends { tags: string[][] }` (mirroring getListTag's bound so both a NostrEvent and a bare `{ tags }` work), with parameters (event: T, keyPackage: KeyPackage) and return type KeyPackageProposalsTagCheck. Algorithm:
      (1) values = getListTag(event, KEY_PACKAGE_PROPOSALS_TAG). If undefined, return malformed.
      (2) leaf = keyPackage.leafNode.capabilities?.proposals ?? []. Build expected as the set of the leaf ids as lowercase 0x%04x strings. Build actual as the set of the tag values, compared as exact strings with no parsing.
      (3) If the sets are equal (same size, and every element of one is in the other), return match/exact.
      (4) Otherwise build strippedExpected from leaf ids that are not GREASE (isGreaseValue). Build strippedActual from tag values that are not the canonical 0x%04x spelling of a GREASE_VALUE_SET member. Precompute a module-level ReadonlySet<string> of those GREASE spellings. If these two sets are equal, return match/grease-stripped.
      (5) Otherwise return mismatch.
    - Use a private module-level hex formatter (not exported). The function must never throw.
    - Write JSDoc with @param, @returns, and @see citing refs/marmot transports/nostr.md "KeyPackage publication" (id-list exact-string comparison, no repeated values) and the MDK function above. Explain that grease-stripped exists to accept KeyPackages from older marmot-ts publishers that filtered GREASE out of the tag.
    - Imports: getListTag from "../utils/tag-cardinality.js", GREASE_VALUE_SET and isGreaseValue from "./grease.js", and KEY_PACKAGE_PROPOSALS_TAG added to the existing "./protocol.js" import. KeyPackage is already imported from ts-mls. Use .js extensions and named exports only.

    Exports snapshot: run `pnpm vitest run src/__tests__/exports.test.ts -u`, then check `git diff src/__tests__/exports.test.ts`. The ONLY change allowed is one added `"checkKeyPackageProposalsTag",` line in the root `.` inline snapshot and one in the `./core` inline snapshot. The type is erased and does not appear in Object.keys. If anything else changed, revert it and investigate.

    Run `pnpm format`, then commit with only the five task files staged by explicit path. Message: `fix(261005-dd6): keep GREASE in mls_proposals tag and add exact-match check`, ending with the trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
  </action>
  <verify>
    <automated>pnpm vitest run src/core/__tests__/key-package-event.test.ts src/core/__tests__/key-package-tag-parity.test.ts src/__tests__/exports.test.ts && pnpm compile</automated>
  </verify>
  <done>All new encoder and validator tests pass, including the Rust-fixture exact match. The existing parity, GREASE-extensions, and spec-compliance tests still pass. pnpm compile succeeds under strict noUnused settings. The exports snapshot diff is exactly +1 line in each of the `.` and `./core` snapshots. The task is committed.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Enforce the mls_proposals match in createInviteIntent and evaluateKeyPackageForGroup, and add a changeset</name>
  <files>src/client/group/invite.ts, src/core/key-package-eligibility.ts, src/client/group/__tests__/invite.test.ts, src/core/__tests__/key-package-event.test.ts, .changeset/mls-proposals-grease-parity.md</files>
  <behavior>
    - createInviteIntent works for a signed invitee event whose leaf proposals are [0x4a4a, 0xeaea, 0x0008, 0x000a]:
      - The encoder's raw tag builds a commit intent (MDK and new marmot-ts form).
      - The mls_proposals tag rewritten to ["mls_proposals","0x0008","0x000a"] and re-signed by the invitee still builds a commit intent (legacy marmot-ts form).
      - A tag missing a real proposal, re-signed by the invitee, throws matching /^createInviteIntent: .*mls_proposals/.
      - A tag with a duplicate value, re-signed by the invitee, throws matching /^createInviteIntent: .*mls_proposals/.
      - An event with the mls_proposals tag removed, re-signed by the invitee, throws matching /^createInviteIntent: .*mls_proposals/.
    - All existing invite.test.ts tests still pass unchanged. That includes the two lifetime tests whose events carry only d/i/mls_protocol_version tags and must still throw on lifetime.
    - evaluateKeyPackageForGroup:
      - A mismatched mls_proposals tag gives eligible false and a reason containing "mls_proposals".
      - A legacy GREASE-stripped tag or a raw tag gives no reason containing "mls_proposals".
      - The existing "accepts a KeyPackage at exactly the 7,257,600s (84-day) default range" test still gives eligible true. Its buildEvent fixture now carries a matching mls_proposals tag.
  </behavior>
  <action>
    RED first.
    - In src/client/group/__tests__/invite.test.ts, add a helper that generates the invitee KeyPackage with the deterministic GREASE capabilities override (see context; import defaultCapabilities from "../../../core/default-capabilities.js"). It builds the template with createKeyPackageEvent, applies a caller-supplied tag transform to the mls_proposals tag (or removes the tag), and signs with the invitee's own signer so the credential still matches the author and the signature verifies. Add the five cases above inside the existing "trust boundary (SEC-01/WIRE-01/WIRE-02)" describe.
    - In src/core/__tests__/key-package-event.test.ts, inside the "evaluateKeyPackageForGroup — Lifetime check (WIRE-01)" describe:
      - Change buildEvent so its event `tags` contain one mls_proposals tag built from tamperedPublicPackage.leafNode.capabilities.proposals, mapped to lowercase 0x%04x and deduplicated. This keeps the existing accept test eligible.
      - Add an optional tags-override parameter, or a sibling helper, and add the mismatch and grease-stripped/raw cases for the reasons array.
    - Run the tests and confirm the new cases fail.

    GREEN, src/client/group/invite.ts, per the wiring decision in <objective>:
    - Import checkKeyPackageProposalsTag from "../../core/key-package-event.js".
    - Place the check AFTER the existing credentialIdentity !== keyPackageEvent.pubkey throw and BEFORE the return. Run checkKeyPackageProposalsTag(keyPackageEvent, keyPackage).
    - On kind "malformed", throw new Error("createInviteIntent: KeyPackage event has invalid required-tag cardinality (mls_proposals)").
    - On kind "mismatch", throw new Error("createInviteIntent: KeyPackage mls_proposals tag does not match the KeyPackage's advertised proposals").
    - Neither message may include tag values, because they are attacker-controlled.
    - Update the createInviteIntent JSDoc. Its validation summary and @throws must mention that the mls_proposals tag must exactly match the leaf's advertised proposals, with GREASE included or with GREASE removed from both sides.

    GREEN, src/core/key-package-eligibility.ts:
    - Import checkKeyPackageProposalsTag from "./key-package-event.js".
    - Inside the existing try block, right after the Lifetime check, call checkKeyPackageProposalsTag(keyPackageEvent, keyPackage).
    - Push "mls_proposals tag is malformed (absent, repeated, empty, or duplicate values)" on malformed, and "mls_proposals tag does not match the KeyPackage's advertised proposals" on mismatch.
    - Add a comment saying this mirrors the createInviteIntent hard reject (same defense-in-depth rationale as the WIRE-01 Lifetime mirror), and that the check is about MDK exact-match parity.
    - Update the function JSDoc's list of evaluated requirements to include the mls_proposals tag match.

    Changeset: create .changeset/mls-proposals-grease-parity.md with frontmatter `"@internet-privacy/marmot-ts": minor` and a short body covering three points:
    - KeyPackage events now publish mls_proposals exactly as the leaf advertises them, GREASE included, so MDK no longer rejects them.
    - New checkKeyPackageProposalsTag / KeyPackageProposalsTagCheck export, which accepts exact or GREASE-stripped matches.
    - createInviteIntent now rejects, and evaluateKeyPackageForGroup reports, KeyPackage events whose mls_proposals tag is absent, malformed, or does not match.

    Do NOT touch KeyPackageManager.track(), KeyPackageStore.addPublished(), RejectReason, or docs/ (out of scope per the wiring decision).

    Run `pnpm format`, then commit with only the five task files staged by explicit path. Message: `feat(261005-dd6): enforce mls_proposals exact match at invite and eligibility`, ending with the trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
  </action>
  <verify>
    <automated>pnpm vitest run src/client/group/__tests__/invite.test.ts src/core/__tests__/key-package-event.test.ts src/__tests__/integration/key-package-eligibility.test.ts && pnpm compile</automated>
  </verify>
  <done>Invite accepts both the raw and the GREASE-stripped tag forms, and rejects malformed, mismatched, and absent tags with createInviteIntent:-prefixed messages that name mls_proposals. Eligibility reports the matching reasons. All pre-existing invite and eligibility tests pass. The changeset exists. The task is committed.</done>
</task>

<task type="auto">
  <name>Task 3: Full-suite, build, format, and example typecheck gate</name>
  <files>src/core/key-package-event-encode.ts, src/core/key-package-event-decode.ts, src/core/key-package-eligibility.ts, src/client/group/invite.ts</files>
  <action>
    In the fresh worktree, set up first if it has not been done already: `pnpm install --frozen-lockfile --offline` and `git submodule update --init ts-mls`. Do NOT update or bump any other submodule (refs/mdk, refs/marmot).

    Then run, in order:
    1. `pnpm build`. It must succeed, including the vendor-ts-mls guard.
    2. `pnpm vitest run`, the full one-shot suite. It catches any integration test that builds kind-30443 events by hand and reaches createInviteIntent.
    3. `pnpm vitest run src/__tests__/exports.test.ts`.
    4. `pnpm format` then `pnpm lint`.
    5. `pnpm --filter marmot-opentui typecheck`. No library signature changed, so this is a confirmation run. If it fails, run the same command on the pre-task base commit to tell pre-existing failures from regressions, and only fix regressions.

    If a full-suite failure traces to a test that hand-builds a KeyPackage event for createInviteIntent without an mls_proposals tag, fix it by giving that fixture a tag built from its leaf proposals. Do not loosen the check.

    If formatting or a regression fix changes files, commit them with the files staged by explicit path. Message: `chore(261005-dd6): format and verification fixups`, ending with the trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Never push. Use pnpm only.
  </action>
  <verify>
    <automated>pnpm build && pnpm vitest run && pnpm lint</automated>
  </verify>
  <done>pnpm build, the full pnpm vitest run, and pnpm lint all pass. The opentui typecheck passes or has only documented pre-existing failures. The worktree is clean except for committed work.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| relay → createInviteIntent / evaluateKeyPackageForGroup | Third-party kind-30443 events, with attacker-controlled tags and content, cross into invite construction |
| marmot-ts publisher → MDK consumer | Our published tag set must match MDK's exact-match validator, or the KeyPackage is unusable for interop |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-dd6-01 | Tampering | checkKeyPackageProposalsTag / createInviteIntent | medium | mitigate | The mls_proposals tag is compared as exact strings against the decoded leaf's capabilities.proposals. A tag that advertises proposals the leaf does not support, or hides ones it does, is rejected at invite (hard throw) and reported by eligibility |
| T-dd6-02 | Tampering | mls_proposals duplicate/repeated tags | medium | mitigate | getListTag rejects absent, repeated, empty, and duplicate-value tags, so no first-match smuggling is possible (spec: consumers MUST NOT read only the first occurrence) |
| T-dd6-03 | Information Disclosure | createInviteIntent errors, eligibility reasons | low | mitigate | Fixed message strings that never interpolate tag values, mirroring MDK's "never echo the tag value" rule |
| T-dd6-04 | Denial of Service | checkKeyPackageProposalsTag | low | mitigate | Pure function that never throws, returning a typed discriminated union. Malformed input becomes a typed result, not an exception |
| T-dd6-05 | Spoofing | grease-stripped acceptance mode | low | accept | A tag can carry GREASE ids that differ from the leaf's and still match in grease-stripped mode. GREASE ids have no semantics and receivers ignore them (RFC 9420 §13.5). This mode exists only for compatibility with older marmot-ts publishers |
</threat_model>

<verification>
- `pnpm build` succeeds.
- `pnpm vitest run` (full suite) passes.
- `pnpm vitest run src/core src/client/group/__tests__/invite.test.ts src/__tests__/exports.test.ts` passes.
- `pnpm lint` (prettier --check) passes after `pnpm format`.
- `pnpm --filter marmot-opentui typecheck` passes, or shows only documented pre-existing failures.
- `git diff <base>..HEAD -- src/__tests__/exports.test.ts` shows exactly two added lines, both `"checkKeyPackageProposalsTag",`.
- `git -C refs/mdk rev-parse HEAD` and `git -C refs/marmot rev-parse HEAD` are unchanged from base, so no submodule bump.
</verification>

<success_criteria>
- A fresh marmot-ts KeyPackage event's mls_proposals tag equals the leaf's advertised proposals set with GREASE included, so it passes MDK's require_multi_value_key_package_tag_matches.
- mls_extensions output is unchanged (still GREASE-filtered).
- marmot-ts accepts both the exact-with-GREASE and the GREASE-stripped tag forms, and rejects missing or extra real proposals, duplicate values, repeated tags, and absent tags.
- The Rust fixture still matches production tags byte-for-byte, and also validates as an exact match.
- Three atomic commits at most on the worktree branch, files staged by explicit path, nothing pushed, no submodule pointer changes.
</success_criteria>

<output>
Create `.planning/quick/261005-dd6-mls-proposals-keep-grease-decode-accepts/SUMMARY.md` when done.
</output>
