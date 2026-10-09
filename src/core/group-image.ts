/** @module @category Core - Group Images */
import { chacha20poly1305 } from "@noble/ciphers/chacha.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, randomBytes } from "@noble/hashes/utils.js";
import { equalBytes } from "@noble/ciphers/utils.js";
import { generateSecretKey } from "applesauce-core/helpers/keys";
import type { ClientState, GroupInfo } from "ts-mls";
import {
  canonicalizeGroupImageMediaType,
  decodeGroupBlossomImage,
  encodeGroupBlossomImage,
  type GroupBlossomImagePresent,
} from "./components/blossom-image.js";
import {
  getComponentData,
  getGroupAvatarUrl,
} from "./components/dictionary.js";
import { GROUP_BLOSSOM_IMAGE_COMPONENT_ID } from "./components/ids.js";

declare const groupImageSnapshotIdentityBrand: unique symbol;
/** Opaque fingerprint of every canonical metadata field, including both keys. */
export type GroupImageSnapshotIdentity = string & {
  readonly [groupImageSnapshotIdentityBrand]: true;
};

/** Canonical render selection, independent of image download/loading status. */
export type GroupImageSource =
  | { kind: "none" }
  | { kind: "url"; url: string; dim?: string; thumbhash?: string }
  | {
      kind: "blossom";
      metadata: GroupBlossomImagePresent;
      snapshotIdentity: GroupImageSnapshotIdentity;
    };

/** Hash the complete canonical encoding without exposing secret material in an identity. */
export function getGroupImageSnapshotIdentity(
  metadata: GroupBlossomImagePresent,
): GroupImageSnapshotIdentity {
  return bytesToHex(
    sha256(
      concatBytes(
        new TextEncoder().encode("marmot-group-image-snapshot-v1\0"),
        encodeGroupBlossomImage(metadata),
      ),
    ),
  ) as GroupImageSnapshotIdentity;
}

/**
 * Read only the authenticated canonical GroupContext. Does no I/O and does not
 * claim that any image bytes are loaded. A URL wins without inspecting Blossom.
 */
export function getGroupImageSource(
  state: ClientState | GroupInfo,
): GroupImageSource {
  const extensions = state.groupContext.extensions;
  const avatar = getGroupAvatarUrl(extensions);
  if (avatar?.url) return { kind: "url", ...avatar };
  const data = getComponentData(extensions, GROUP_BLOSSOM_IMAGE_COMPONENT_ID);
  if (!data) return { kind: "none" };
  const metadata = decodeGroupBlossomImage(data);
  if (metadata.kind === "empty") return { kind: "none" };
  return {
    kind: "blossom",
    metadata,
    snapshotIdentity: getGroupImageSnapshotIdentity(metadata),
  };
}

/** Ciphertext (including its tag) plus complete owned MLS metadata. */
export interface EncryptedGroupImage {
  ciphertext: Uint8Array;
  metadata: GroupBlossomImagePresent;
}

/** Integrity failures disclose no plaintext and can be mapped to asset unavailability. */
export class GroupImageIntegrityError extends Error {
  constructor(public readonly reason: "hash-mismatch" | "aead-failure") {
    super(`group image ${reason}`);
    this.name = "GroupImageIntegrityError";
  }
}

/** Exact image AAD; see `app-components/group-blossom-image-v1.md` (Image bytes). */
export function buildGroupImageAad(mediaType: string): Uint8Array {
  return concatBytes(
    new TextEncoder().encode("marmot-group-image-v1"),
    Uint8Array.of(0),
    new TextEncoder().encode(canonicalizeGroupImageMediaType(mediaType)),
  );
}

/** Encrypt with independent fresh content key, nonce and Nostr upload credential. */
export function encryptGroupImage(
  plaintext: Uint8Array,
  declaredMediaType: string,
): EncryptedGroupImage {
  const mediaType = canonicalizeGroupImageMediaType(declaredMediaType);
  // Module-mocked internal randomness seam; no caller-supplied key/nonce option.
  const imageKey = randomBytes(32).slice();
  const imageNonce = randomBytes(12).slice();
  const imageUploadKey = generateSecretKey().slice();
  const ciphertext = chacha20poly1305(
    imageKey,
    imageNonce,
    buildGroupImageAad(mediaType),
  )
    .encrypt(plaintext.slice())
    .slice();
  return {
    ciphertext,
    metadata: {
      kind: "present",
      imageHash: sha256(ciphertext).slice(),
      imageKey,
      imageNonce,
      imageUploadKey,
      mediaType,
    },
  };
}

/** Verify the complete ciphertext hash before constructing or invoking AEAD. */
export function decryptGroupImage(
  ciphertext: Uint8Array,
  metadata: GroupBlossomImagePresent,
): Uint8Array {
  const image = decodeGroupBlossomImage(encodeGroupBlossomImage(metadata));
  if (image.kind !== "present") throw new Error("group image is empty");
  const ownedCiphertext = ciphertext.slice();
  if (!equalBytes(sha256(ownedCiphertext), image.imageHash)) {
    throw new GroupImageIntegrityError("hash-mismatch");
  }
  try {
    return chacha20poly1305(
      image.imageKey,
      image.imageNonce,
      buildGroupImageAad(image.mediaType),
    )
      .decrypt(ownedCiphertext)
      .slice();
  } catch {
    throw new GroupImageIntegrityError("aead-failure");
  }
}
