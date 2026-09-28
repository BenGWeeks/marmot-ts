// Packed-tarball consumer smoke test for @internet-privacy/marmot-ts.
//
// Runs unchanged under Node, Bun and Deno against a real `npm install` of the
// packed tarball (see run.sh). It exercises `.`, `/mls` and `/core`: signing a
// KeyPackage's required 0x8009 account identity proof with a signer built
// only from marmot-ts's own runtime dependencies, validating that proof, then
// creating a real one-member Marmot group and encoding its GroupContext with
// the fork-only groupContextEncoder.
//
// Deliberately uses no `node:` imports so it stays runtime-neutral.

import * as marmotTs from "@internet-privacy/marmot-ts";
import {
  defaultCryptoProvider,
  encode,
  getCiphersuiteImpl,
  groupContextEncoder,
} from "@internet-privacy/marmot-ts/mls";
import {
  createCredential,
  createSimpleGroup,
  generateKeyPackage,
  validateKeyPackageAccountIdentityProof,
} from "@internet-privacy/marmot-ts/core";
import { schnorr } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(`package smoke assertion failed: ${message}`);
  }
}

assert(
  typeof marmotTs.MarmotClient === "function",
  "MarmotClient is not exported as a function from the root entrypoint",
);

// A deterministic throwaway smoke-test key. It controls nothing of value and
// this script is not in package.json's `files`, so it never ships in the
// tarball.
const SMOKE_SECRET_KEY = hexToBytes("01".repeat(32));
const pubkey = bytesToHex(schnorr.getPublicKey(SMOKE_SECRET_KEY));

// Satisfies AuthorizationProofSigner (Pick<EventSigner, "signEvent">) from
// src/core/authorization-proof.ts using only @noble/curves and @noble/hashes
// -- marmot-ts runtime `dependencies`, guaranteed present via npm hoisting in
// any real consumer install. Deliberately does not use the devDependency
// account-signer helper this repo's own tests rely on
// (src/__tests__/helpers/test-accounts.ts, backed by applesauce-accounts): a
// real consumer would not have that package, and depending on it here would
// mask exactly the class of bug this smoke exists to catch. produceAuthorizationProof
// re-verifies the returned event's id and BIP-340 signature, so this must
// produce a genuine signature, not a stub.
const smokeSigner = {
  async signEvent(draft) {
    const event = { ...draft, pubkey };
    const id = bytesToHex(
      sha256(
        utf8ToBytes(
          JSON.stringify([
            0,
            event.pubkey,
            event.created_at,
            event.kind,
            event.tags,
            event.content,
          ]),
        ),
      ),
    );
    const sig = bytesToHex(schnorr.sign(hexToBytes(id), SMOKE_SECRET_KEY));
    return { ...event, id, sig };
  },
};

const impl = await getCiphersuiteImpl(
  "MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519",
  defaultCryptoProvider,
);

const credential = createCredential(pubkey);
const kp = await generateKeyPackage({
  credential,
  ciphersuiteImpl: impl,
  signer: smokeSigner,
});

// Throws AccountIdentityProofError if the shipped 0x8009 proof path is broken
// in the packed build.
validateKeyPackageAccountIdentityProof(kp.publicPackage);

const { clientState } = await createSimpleGroup(kp, impl, "Package Smoke", {
  adminPubkeys: [pubkey],
  relays: [],
});

assert(
  clientState.groupContext.epoch === 0n,
  `expected fresh group epoch 0n, got ${clientState.groupContext.epoch}`,
);

const encoded = encode(groupContextEncoder, clientState.groupContext);
assert(
  encoded instanceof Uint8Array && encoded.length > 0,
  "encode(groupContextEncoder, groupContext) did not return a non-empty Uint8Array",
);

const runtime = globalThis.Deno
  ? "Deno"
  : globalThis.Bun
    ? "Bun"
    : `node ${typeof process !== "undefined" ? process.version : "unknown"}`;

console.log(`package smoke OK (${runtime})`);
