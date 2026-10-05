---
phase: 11-exports-snapshot-qa-gate
reviewed: 2026-10-05T15:18:56Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - src/__tests__/exports.test.ts
  - scripts/package-smoke/smoke.mjs
  - src/core/components/account-identity-proof.ts
  - src/core/default-capabilities.ts
  - src/core/key-package-event-encode.ts
  - src/core/key-package-event-decode.ts
  - src/core/capabilities.ts
  - src/core/group-message-crypto.ts
  - src/core/auth-service.ts
  - src/core/extensions.ts
  - src/core/group-event.ts
  - src/core/key-package.ts
  - src/client/key-package-store.ts
  - src/core/__tests__/capabilities.test.ts
  - src/core/__tests__/darkmatter-invite-compat.test.ts
  - src/core/__tests__/key-package.test.ts
  - src/core/__tests__/credential.test.ts
  - src/core/__tests__/group-message.test.ts
  - src/core/__tests__/key-package-event.test.ts
  - src/engine/__tests__/group-engine.test.ts
  - src/client/__tests__/key-package-manager.test.ts
  - src/client/group/__tests__/marmot-group.test.ts
  - src/__tests__/integration/end-to-end-invite-join-message.test.ts
  - src/__tests__/integration/ingest-commit-race.test.ts
findings:
  critical: 0
  warning: 5
  info: 2
  total: 7
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-10-05T15:18:56Z
**Depth:** standard
**Files Reviewed:** 24
**Status:** issues_found

## Summary

Scope was the four phase commits (7837d95, a3fbe1e, e857449, e736c70). For the comment-only
files I reviewed only the changed comments. The substantive review covered `exports.test.ts`
and `smoke.mjs`.

What I verified:

- `pnpm vitest run src/__tests__/exports.test.ts` passes (20 tests).
- Prettier passes on all 24 files.
- No `MIP-NN` citation is left anywhere under `src/`.
- Every new citation path exists under `refs/marmot/`: `protocol-core/{joining,group-messaging,member-departure,group-setup}.md`, `transports/nostr.md`, `foundation/{identity,key-packages}.md`.
- Each of those paths covers its topic, with one exception (WR-05).
- The snapshot's 9 surfaces match the 10 `package.json` `exports` subpaths, minus `./mls`, as of today.

The smoke signer is correct:

- It builds the NIP-01 serialization `[0, pubkey, created_at, kind, tags, content]` with `JSON.stringify`, which is the same id that `getEventHash` produces.
- It signs the 32-byte id with noble v2 `schnorr.sign(Uint8Array, sk)`.
- It returns every draft field unchanged. Overriding `pubkey` is harmless because `produceAuthorizationProof` rejects a mismatch with `returned-pubkey-mismatch`.
- `validateKeyPackageAccountIdentityProof` is synchronous, so the missing `await` is not a problem.

Main concerns:

1. The export guard can pass silently for several legacy shapes (WR-02, WR-03). One documented rationale for accepting a gap is factually false: legacy type exports did exist.
2. The "every public subpath" gate is a hand-maintained list run against source barrels. Nothing checks it against `package.json` or the packed tarball (WR-01).
3. The smoke depends on undeclared `@noble/*` packages being present, which only holds by chance (WR-04).
4. One rewritten citation names a spec file that says the opposite of the code it annotates (WR-05).

## Warnings

### WR-01: Subpath snapshot and guard are not tied to `package.json` `exports` and never touch the published mapping

**File:** `src/__tests__/exports.test.ts:161-173`, `scripts/package-smoke/smoke.mjs:12-24`

**Issue:** `PUBLIC_SURFACES` is a hand-written list of source-barrel imports (`../client/index.js` and so on).

- **New subpaths escape both checks.** No assertion compares it with `package.json` `exports`. If someone adds a subpath to `exports` (for example `./engine/testing`), the snapshot and the D-02 legacy guard both skip it and CI stays green.
- **The `dist` mapping is untested.** The snapshot runs against `src/`, not `dist/`. A wrong target such as `"./extra/audit/node"` pointing at `./dist/extra/audit/browser.js`, or a missing emitted file, is invisible to the test.
- **Most subpaths are never loaded from the tarball.** The packed-tarball smoke imports only `.`, `./mls` and `./core`, so 7 of the 10 published subpaths are never loaded from the tarball on any runtime.
- **`verify-package-tarball.mjs` does not fill the gap.** It checks only the vendored fork shape and `dist/mls.js`.

**Fix:**

1. Derive the surface list from the manifest and fail when the two drift:

```ts
import pkg from "../../package.json" with { type: "json" };
it("PUBLIC_SURFACES covers every package.json exports subpath except ./mls and ./package.json", () => {
  const declared = Object.keys(pkg.exports)
    .filter((k) => k !== "./mls" && k !== "./package.json")
    .sort();
  expect(PUBLIC_SURFACES.map(([k]) => k).sort()).toEqual(declared);
});
```

2. Add a loop to `smoke.mjs` that dynamically imports every declared subpath of the installed package and asserts that each namespace is non-empty:

```js
for (const sub of Object.keys(pkgJson.exports))
  if (sub !== "./package.json") await import(`@internet-privacy/marmot-ts${sub.slice(1)}`);
```

### WR-02: Legacy-name guard misses nested names and lowercase-leading legacy shapes

**File:** `src/__tests__/exports.test.ts:69-70`, `src/__tests__/exports.test.ts:136-156`

**Issue:** The name checks (denylist and `LEGACY_EXPORT_NAME_PATTERN`) run only on top-level namespace keys (lines 150-154). The recursive `walk` checks values but never keys. Three gaps follow:

- **(a) Nested names are not checked.** `./client` and `.` export `Proposals`, which is `export * as Proposals` and therefore a null-prototype namespace object. A legacy export re-introduced there (for example `Proposals.buildAccountIdentityProofExtension`) passes the guard.
- **(b) The pattern is case-sensitive.** It requires a capital `A` in `AccountIdentityProof(Event|Extension)`. Two of the 15 removed names (`accountIdentityProofEventId`, `accountIdentityProofEventJson`) use the lowercase-leading form, and that form is exactly what the pattern misses. I checked `accountIdentityProofExtension`, `accountIdentityProofEventTemplate` and `accountIdentityProofSigner`: all three return `false`.
- **(c) The self-test plants none of these shapes.** It cannot show the gaps.

**Fix:**

- Apply the name checks to every key the walk visits, not only top-level keys. In the plain-object/function branch, run `REMOVED_LEGACY_EXPORT_NAMES.has(key) || LEGACY_EXPORT_NAME_PATTERN.test(key)` before recursing.
- Make the pattern case-insensitive: `/legacy_?account_?identity_?proof|accountidentityproof_?(event|extension)|account_identity_proof_(event|extension)/i`. Re-verify it against the current snapshot: `ACCOUNT_IDENTITY_PROOF_COMPONENT` and `accountIdentityProofTemplate` still do not match.
- Add self-test cases for `{ Ns: Object.assign(Object.create(null), { encodeAccountIdentityProof() {} }) }` and `{ accountIdentityProofExtension: 1 }`.

### WR-03: The "no legacy type name ever existed" rationale is false, and no type-level check runs in CI

**File:** `src/__tests__/exports.test.ts:964-966`, `src/__tests__/exports.test.ts:176-180`

**Issue:** The self-test accepts the type-only gap because "no legacy type name ever existed" (citing RESEARCH.md D-02 point 3). That is wrong. `git show ef756c8` shows the deleted module exported five types:

- `AccountIdentityProofRequest`
- `AccountIdentityProof`
- `SignedAccountIdentityProofEvent`
- `AccountIdentityProofEventSigner`
- `AccountIdentityProofSigner`

Re-exporting any of them passes the guard.

The type-level assertions that do exist are not enforced either. CI runs only `pnpm vitest run` (tests.yml:59/112/165) and `tsc -b tsconfig.build.json`, and the build config excludes tests. Vitest/esbuild strips `type` imports and `expectTypeOf` is a runtime no-op. So the `RootSignatureTypes` check and the `toBeConstructibleWith()` check at lines 176-180 cannot fail in CI, and the type surface of every subpath is unguarded.

**Fix:**

- Correct the comment, and the SUMMARY/RESEARCH record, to list the five removed type names.
- Then do one of the following:
  - Add `tsc -p tsconfig.json --noEmit` (it includes tests) as a CI step, and add `// @ts-expect-error` imports of each removed type name from every barrel.
  - Or add `typecheck: { enabled: true }` to the Vitest config, with a `*.test-d.ts` that does the same.

### WR-04: Smoke depends on undeclared `@noble/*` packages and states a false guarantee

**File:** `scripts/package-smoke/smoke.mjs:25-27`, `scripts/package-smoke/smoke.mjs:46-55`

**Issue:** The consumer `package.json` that `run.sh` creates declares only the marmot-ts tarball and `typescript`. `@noble/curves/secp256k1.js` and `@noble/hashes/sha2.js` resolve only because npm happens to hoist marmot-ts's direct 2.x dependencies to the top level of the fresh consumer.

The comment calls them "guaranteed present via npm hoisting in any real consumer install", which is false:

- pnpm's strict layout does not hoist them.
- Yarn PnP does not hoist them.
- The dependency tree also carries `@noble/curves@1.1.0`/`1.2.0` and `@noble/hashes@1.3.1`/`1.3.2` (pnpm-lock.yaml:705-727). If npm hoists a 1.x copy, the import may fail, or it may bind a different `schnorr` API. `@noble/hashes@1.3.x` has no `sha2.js` subpath.

Today this works only by placement luck. A future dependency bump could break the Node/Bun/Deno smoke for reasons unrelated to marmot-ts.

**Fix:** In `run.sh`, install the signer's packages explicitly at the versions marmot-ts declares:

```bash
curves="$(node -p "require('$ROOT/package.json').dependencies['@noble/curves']")"
hashes="$(node -p "require('$ROOT/package.json').dependencies['@noble/hashes']")"
npm install --no-audit --no-fund "@noble/curves@${curves}" "@noble/hashes@${hashes}" >/dev/null
```

Then rewrite the comment to say that the smoke declares them explicitly, as a real consumer that hand-rolls a signer would.

### WR-05: Rewritten citation names a spec file that says the opposite of the code

**File:** `src/core/extensions.ts:17`, `src/core/key-package.ts:128`, `src/core/default-capabilities.ts:14-18`

**Issue:** These three comments now cite `foundation/key-packages.md` as the authority for advertising and adding the MLS `last_resort` extension (`0x000a`). The spec says the reverse:

- `refs/marmot/foundation/key-packages.md:55-57`: "Last-resort status is not an MLS capability or extension type. A last-resort KeyPackage carries an `app_data_dictionary` in its KeyPackage extensions ... with an empty-data `last_resort_key_package` component entry."
- `foundation/registries.md:44-46` repeats this. That component is ComponentID `0x0004`.
- MDK keeps the `last_resort` extension "only on the legacy decode path" (`refs/mdk/docs/marmot-architecture/further-context/custom_extensions.md:549`).

So `ensureLastResortExtension`, the `LAST_RESORT_EXTENSION_TYPE` capability in `capabilities.ts:54-56`, and the comments citing the spec as justification do not conform to the spec. D-10 turned a vague `MIP-00` pointer into a precise but wrong one, which hides the divergence instead of recording it.

The code divergence itself predates this phase. `.planning/` has no entry for `last_resort_key_package` outside the phase-11 plan and summary, so it is not tracked as a known gap.

**Fix:**

1. Reword the three comments so they record the divergence, for example: "Produces the legacy MLS `last_resort` extension (0x000a). `foundation/key-packages.md` now specifies last-resort as the empty-data `last_resort_key_package` (0x0004) app-component entry; MDK only decodes 0x000a on its legacy path. See backlog item X."
2. File a backlog item to move last-resort marking to the `app_data_dictionary` component, following MDK, per the CLAUDE.md rule that "diverging from the reference is a decision to record".

## Info

### IN-01: "absence and rejection" comment is inaccurate in two of the three test files

**File:** `src/core/__tests__/capabilities.test.ts:21-23`, `src/core/__tests__/darkmatter-invite-compat.test.ts:71-73`

**Issue:** The comment was copied uniformly across three files and says the literal is used "to assert its absence and rejection (CUT-01/CUT-02)". In `capabilities.test.ts` (lines 140-142, 158-160) and `darkmatter-invite-compat.test.ts` (lines 104-106, 130-134), it is used only in `not.toContain` / `.some(...) === false` absence assertions. Neither file tests rejection.

**Fix:** Say "absence (CUT-01)" in those two files, and keep "absence and rejection" only where a rejection is actually asserted.

### IN-02: Value scan skips several realistic carriers of `0xf2f1`

**File:** `src/__tests__/exports.test.ts:76-85`, `src/__tests__/exports.test.ts:136-147`

**Issue:** The walk does not look inside:

- typed arrays (for example a `Uint16Array` of extension ids), whose prototype is not `Object.prototype`
- exported class instances (`noopAuditSink`, `safeAuditSink`)
- non-enumerable or accessor class statics (`static get TYPE()`)
- return values of exported factories (`defaultCapabilities()`, `keyPackageDefaultExtensions()`)

It also does not flag the legacy extension's name string `marmot.account-identity-proof.v2`.

The factory case is covered behaviorally by `capabilities.test.ts:124-162`. The JSDoc should still state these limits so nobody over-trusts the guard.

**Fix:**

- Add `ArrayBuffer.isView(container)` handling that iterates numeric elements.
- Add `"marmot.account-identity-proof.v2"` to `isLegacyExtensionTypeValue`'s string check.
- Document that instances and factory return values are out of scope.

---

_Reviewed: 2026-10-05T15:18:56Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
