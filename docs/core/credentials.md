# Credentials

MLS uses credentials to identify group members. Marmot uses the "basic" credential type, storing Nostr public keys as identities.

## What are MLS Credentials?

In MLS, every group member has a credential that identifies them. Marmot maps Nostr public keys (used for signing Nostr events) to MLS basic credentials.

### Identity vs Signature Keys

MLS separates two concepts:

- **Identity:** Who you are (Nostr pubkey stored in credential)
- **Signature Public Key:** Key used to sign MLS messages (separate from identity)

This separation allows for key rotation and device-specific signing keys while maintaining a stable identity.

The two are bound by the `marmot.member.account-identity-proof.v2` (`0x8009`) LeafNode component: the Nostr account signs a proof over the leaf's MLS signature key. Clients MUST reject a leaf or KeyPackage whose proof is missing or invalid ([`foundation/identity.md`](https://github.com/marmot-protocol/marmot/blob/master/foundation/identity.md)). `generateKeyPackage` produces this proof via its `signer`.

## Creating Credentials

```typescript
import { createCredential } from "@internet-privacy/marmot-ts";

// Create MLS credential from Nostr pubkey (hex string)
const credential = createCredential(nostrPubkey);
```

The credential embeds the Nostr public key as the identity. `createCredential` throws if the pubkey is not exactly 64 hex characters (no `0x` prefix, no `npub`) or is not a valid x-only secp256k1 public key.

## Extracting Pubkeys

```typescript
import { getCredentialPubkey } from "@internet-privacy/marmot-ts";

// Get Nostr pubkey from MLS credential
const pubkey = getCredentialPubkey(credential);
```

Returns the Nostr public key as a hex string.

## Comparing Credentials

```typescript
import { isSameCredential } from "@internet-privacy/marmot-ts";

if (isSameCredential(credential1, credential2)) {
  // Same identity (same Nostr pubkey)
}
```

## Identity Format

- **Wire format:** the raw 32-byte x-only secp256k1 Nostr public key (not hex text, not `npub`)
- **API format:** 64-character hex string
- **Validation:** identities that are not exactly 32 bytes or not a valid x-only point are rejected
- **Credential Type:** Always "basic" (no x509 support)

## Example: Full Flow

```typescript
import { strict as assert } from "node:assert";
import {
  createCredential,
  getCredentialPubkey,
  isSameCredential,
} from "@internet-privacy/marmot-ts";

// Nostr pubkeys: 64 lowercase hex chars, no 0x prefix
declare const myPubkey: string; // e.g. await signer.getPublicKey()
declare const otherPubkey: string;

// Create credential for group membership
const myCredential = createCredential(myPubkey);

// Later: verify it's me
const extractedPubkey = getCredentialPubkey(myCredential);
assert.equal(extractedPubkey, myPubkey);

// Compare with another credential
const otherCredential = createCredential(otherPubkey);
assert(!isSameCredential(myCredential, otherCredential));
```

## Authentication

`marmotAuthService` is the supported MLS credential policy, available from both the root package and `/core`. Marmot applies it internally on group creation, Welcome joins, and inbound commits. Integrations using lower-level MLS APIs can supply the same policy:

```typescript
import {
  createCredential,
  marmotAuthService,
} from "@internet-privacy/marmot-ts/core";
// Also available: import { marmotAuthService } from "@internet-privacy/marmot-ts";

const credential = createCredential(nostrPubkey);
const accepted = await marmotAuthService.validateCredential(
  credential,
  mlsSignaturePublicKey,
);
```

The policy returns a boolean:

- the credential type MUST be `basic`;
- the identity MUST be exactly 32 bytes and a valid x-only secp256k1 public key ([`foundation/identity.md`](https://github.com/marmot-protocol/marmot/blob/master/foundation/identity.md));
- MLS verifies message signatures, and Marmot separately verifies each leaf's `0x8009` account identity proof.

The policy deliberately ignores the `signaturePublicKey` parameter. `accepted === true` establishes the credential's identity shape and curve validity only: it does not bind that identity to an MLS signing key, verify an account proof, validate all group members or components, or authorize the Welcome inviter. Continue to use Marmot's KeyPackage/member proof checks and validated group admission; a valid credential alone does not authorize joining or administering a group. See [Welcome](./welcome) and [`protocol-core/joining.md`](https://github.com/marmot-protocol/marmot/blob/master/protocol-core/joining.md).

To check an identity yourself, use `isValidAccountIdentity(bytes)`:

```typescript
import {
  createCredential,
  isValidAccountIdentity,
} from "@internet-privacy/marmot-ts";

const credential = createCredential(nostrPubkey);
isValidAccountIdentity(credential.identity); // true for a valid 32-byte x-only key
```

## Related

- [Key Packages](./key-packages) - Use credentials in key package generation
- [Members](./members) - Query members by credential
