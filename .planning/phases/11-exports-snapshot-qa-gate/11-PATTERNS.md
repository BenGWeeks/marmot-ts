# Phase 11: Exports Snapshot & QA Gate - Pattern Map

**Mapped:** 2026-09-28
**Files analyzed:** 6 (1 new test scaffold pattern reused 8x, 1 fixed script, ~9 comment-only edits treated as one class)
**Analogs found:** 6 / 6 (all in-repo)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/__tests__/exports.test.ts` (extend: add per-subpath `describe`/`it` blocks + D-02 guard) | test | request-response (import barrel → assert key list) | itself (existing root snapshot in the same file) | exact |
| `scripts/package-smoke/smoke.mjs` (fix: add `signer` arg to `generateKeyPackage`) | utility / script (consumer smoke test) | request-response (build KeyPackage → assert shape) | `src/core/authorization-proof.ts` (`AuthorizationProofSigner` type + `produceAuthorizationProof`'s `signEvent` call) and `src/__tests__/helpers/test-accounts.ts` (signer-construction pattern, NOT importable here — devDependency) | role-match (script must hand-roll signer with only `dependencies`, not copy the helper verbatim) |
| `src/core/components/account-identity-proof.ts` (comment-only: lines 16, 69, 235 dead-pointer rewrite) | service/module (doc comments only) | n/a (comment edit) | itself | exact |
| `src/core/default-capabilities.ts` (comment-only: MIP-01 citation + "Marmot Group Data Extension" terminology, lines 14/19) | utility (doc comments only) | n/a | `src/core/auth-service.ts:11` (already-correct dual-citation style to mirror) | role-match |
| ~18 test/source files with `MIP-NN` citations (D-10 rewrite, comment-only) | test/service (doc comments / `describe` titles only) | n/a | `src/core/auth-service.ts:11` (`(MIP-00 / foundation/identity.md)` → target format: drop `MIP-00 /` prefix, keep the `refs/marmot/...` path only) | exact |
| `refs/mdk` (submodule pointer bump, no source file) | config | n/a | n/a (orchestrator performs `git submodule update`, not a source pattern) | n/a |

## Pattern Assignments

### `src/__tests__/exports.test.ts` (test, request-response) — extend with per-subpath snapshots + D-02 guard

**Analog:** itself, existing root block (lines 1–338, read in full — file is 338 lines, one pass)

**Imports pattern** (lines 1–17):
```typescript
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  GroupHistoryTree,
  groupWithdrawnNotificationsByCommit,
  type AuditContextOptions,
  // ... named type imports used only for expectTypeOf assertions
} from "../index.js";
import * as exports from "../index.js";
```
For each new subpath block, mirror this with a namespace import from the subpath barrel, e.g.:
```typescript
import * as clientExports from "../client/index.js";
import * as coreExports from "../core/index.js";
import * as engineExports from "../engine/index.js";
import * as extraExports from "../extra/index.js";
import * as utilsExports from "../utils/index.js";
import * as auditExports from "../audit/index.js";
import * as extraAuditNodeExports from "../extra/audit/node.js";
import * as extraAuditBrowserExports from "../extra/audit/browser.js";
```

**Core snapshot pattern** (lines 32–338, the whole `describe` block; the exact assertion is lines 39–337):
```typescript
describe("exports", () => {
  it("should export the expected members", () => {
    expect(Object.keys(exports).sort()).toMatchInlineSnapshot(`
      [ ... 245 sorted names ... ]
    `);
  });
});
```
Replicate this `it` once per subpath inside its own `describe("<subpath> exports", () => { ... })` block (or a table-driven loop per CONTEXT.md's discretion note — either is acceptable; the existing file uses a flat `describe`, so a flat per-subpath `describe` is the more consistent choice). Use `toMatchInlineSnapshot()` with no argument first, then run `pnpm vitest run -u` to populate — this is the exact mechanism the existing root test already used (confirmed passing this session per RESEARCH.md).

**D-02 guard — new pattern, no direct analog exists yet; build from RESEARCH.md's exact design** (RESEARCH.md § D-02, already vetted against this codebase's flat enum-object export convention — e.g. `groupLifecycleStates`, `disposition`, `inputCategories`, `DEFAULT_GROUP_COMPONENT_IDS` — all confirmed flat, no nested objects):
```typescript
const REMOVED_LEGACY_EXPORT_NAMES = new Set([
  "ACCOUNT_IDENTITY_PROOF_EVENT_KIND", "ACCOUNT_IDENTITY_PROOF_EXTENSION_TYPE",
  "accountIdentityProofEventId", "accountIdentityProofEventJson",
  "accountIdentityProofSignatureFromSignedEvent", "accountIdentityProofSigningDigest",
  "buildAccountIdentityProofEvent", "buildAccountIdentityProofExtension",
  "decodeAccountIdentityProof", "encodeAccountIdentityProof",
  "makeAccountIdentityProofExtension", "mlsSignatureScheme",
  "signAccountIdentityProof", "verifyAllLeafAccountIdentityProofs",
  "verifyLeafAccountIdentityProof",
]);

function assertNoLegacyValue(value: unknown, path: string): void {
  if (typeof value === "number" && value === 0xf2f1)
    throw new Error(`export ${path} equals the legacy 0xf2f1 constant`);
  if (typeof value === "bigint" && value === 62193n)
    throw new Error(`export ${path} equals the legacy 0xf2f1 constant`);
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoLegacyValue(v, `${path}[${i}]`));
  } else if (value !== null && typeof value === "object" && value.constructor === Object) {
    for (const [k, v] of Object.entries(value)) assertNoLegacyValue(v, `${path}.${k}`);
  }
}

// per subpath:
it("should not leak any legacy account-identity-proof export", () => {
  for (const key of Object.keys(exportsNamespace)) {
    expect(REMOVED_LEGACY_EXPORT_NAMES.has(key)).toBe(false);
    assertNoLegacyValue((exportsNamespace as Record<string, unknown>)[key], key);
  }
});
```

**Error handling / edge cases:** none — this is a pure assertion test, no try/catch needed (matches this file's existing style: no error handling in test bodies, only `expect`/`expectTypeOf`).

---

### `scripts/package-smoke/smoke.mjs` (utility/script, request-response) — fix missing `signer`

**Analog for the required shape:** `src/core/authorization-proof.ts` — `AuthorizationProofSigner` type (grep-located, not re-read in full; the type definition is a `Pick<EventSigner, "signEvent">` re-exported from `src/core/index.ts`):
```typescript
export type AuthorizationProofSigner = Pick<EventSigner, "signEvent">;
// signEvent(draft: EventTemplate) => Promise<NostrEvent>
```

**Anti-pattern to avoid (do NOT copy this file's pattern into smoke.mjs):** `src/__tests__/helpers/test-accounts.ts` builds signers via `PrivateKeyAccount.fromKey(...)` from `applesauce-accounts/accounts` (lines 1, 41–52). `applesauce-accounts` is a marmot-ts **devDependency**, not shipped to consumers — importing it inside `smoke.mjs`'s packed-tarball consumer project would mask exactly the class of bug this smoke test exists to catch (per RESEARCH.md Pitfall 3). Do not port this pattern.

**What to build instead — hand-roll a minimal raw-key signer using `@noble/curves`'s `schnorr`** (a marmot-ts runtime `dependencies` entry, confirmed present via `import { schnorr } from "@noble/curves/secp256k1.js"` at the top of `src/core/authorization-proof.ts:20` and `src/core/components/account-identity-proof.ts:23` — same package, already hoisted into any real consumer install). Needed additions to `smoke.mjs`:
```javascript
import { schnorr } from "@noble/curves/secp256k1.js";
import { getEventHash } from "applesauce-core/helpers/event"; // already a runtime dep, or reimplement NIP-01 id hash inline if avoiding extra imports
import { bytesToHex } from "@noble/hashes/utils.js";

const secretKey = /* 32 random or fixed test bytes, Uint8Array */;
const pubkey = bytesToHex(schnorr.getPublicKey(secretKey)); // replaces placeholder pubkey = "a".repeat(64)

const signer = {
  async signEvent(draft) {
    const unsigned = { ...draft, pubkey };
    const id = getEventHash(unsigned); // NIP-01 id
    const sig = bytesToHex(schnorr.sign(id, secretKey));
    return { ...unsigned, id, sig };
  },
};

const kp = await generateKeyPackage({ credential, ciphersuiteImpl: impl, signer });
```

**Import site pattern already correct** (lines 17–21 of `smoke.mjs`, unchanged):
```javascript
import {
  createCredential,
  createSimpleGroup,
  generateKeyPackage,
} from "@internet-privacy/marmot-ts/core";
```

**Existing placeholder to remove** (`smoke.mjs:34`):
```javascript
const pubkey = "a".repeat(64); // NOT on-curve; replace with schnorr-derived pubkey above
```

**Error handling:** `smoke.mjs`'s existing `assert()` helper (lines 23–27) is the file's only error-handling convention — reuse it verbatim for any new invariant (e.g. asserting `kp` was produced), do not introduce try/catch.

---

### Comment-only edits (D-01 dead pointers, D-10 MIP citations) — no code pattern, just text substitution

**Analog for correct dual-citation style:** `src/core/auth-service.ts:11` already has the target format:
```typescript
// (MIP-00 / `foundation/identity.md`)
```
D-10 target format (per RESEARCH.md's already-verified table) drops the `MIP-NN /` prefix, keeping only the `refs/marmot/...` path, e.g. `foundation/identity.md`, `protocol-core/group-messaging.md`, `transports/nostr.md`. Apply this same substitution pattern to all ~18 flagged file:line citations in RESEARCH.md § D-10's table — that table is the authoritative per-line list; do not re-derive it.

**D-01 dead-pointer fix pattern** — `src/core/components/account-identity-proof.ts` lines 16, 69, 235 each reference `../account-identity-proof.js`, a module deleted in Phase 7 commit `ef756c8`. Replace the resolvable-looking relative path with prose that does not imply a live import, e.g.:
```
- "custom LeafNode extension (`0xf2f1`, `../account-identity-proof.js`), which this module does not import from or modify."
+ "custom LeafNode extension (`0xf2f1`), whose module was deleted in Phase 7 (`ef756c8`) and is not imported by this module."
```
Apply the same substitution shape at lines 69 and 235 (see RESEARCH.md § D-01 table for each line's exact current text).

**Do NOT touch:** any `0xf2f1` occurrence that is a live CUT-02 rejection branch, negative-case test assertion, or the `docs/client/best-practices.md:76` note — RESEARCH.md's D-01 table marks these `KEEP` with `none` as the fix; only the 6 dead-pointer comments are `STALE`.

## Shared Patterns

### Inline-snapshot test structure
**Source:** `src/__tests__/exports.test.ts` (whole file, existing)
**Apply to:** every new per-subpath `it` block in the same file — same `toMatchInlineSnapshot()` + `Object.keys(...).sort()` idiom, same `vitest run -u` population workflow.

### `AuthorizationProofSigner` contract
**Source:** `src/core/authorization-proof.ts` (`export type AuthorizationProofSigner = Pick<EventSigner, "signEvent">`)
**Apply to:** `scripts/package-smoke/smoke.mjs`'s new hand-rolled signer — the object literal must expose exactly an async `signEvent(draft)` method returning a `NostrEvent`-shaped object (`id`, `pubkey`, `sig` plus the draft fields).

### Comment citation format
**Source:** `src/core/auth-service.ts:11`
**Apply to:** all D-10 MIP-citation rewrites and the D-01 dead-pointer rewrites — plain-path citations to `refs/marmot/...`, no resolvable relative code paths for deleted modules.

## No Analog Found

None. Every file/edit in scope has a direct or role-match analog in the current codebase (all six rows above resolved).

## Metadata

**Analog search scope:** `src/__tests__/exports.test.ts`, `scripts/package-smoke/{smoke.mjs,run.sh}`, `src/core/authorization-proof.ts`, `src/core/components/account-identity-proof.ts`, `src/core/auth-service.ts`, `src/core/default-capabilities.ts`, `src/__tests__/helpers/test-accounts.ts`
**Files scanned:** 7 read directly this session (plus RESEARCH.md's own prior verified reads, reused rather than re-fetched)
**Pattern extraction date:** 2026-09-28
