import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as image from "../group-image.js";

const mocks = vi.hoisted(() => ({
  randomBytes: vi.fn(),
  uploadKey: vi.fn(),
  decrypt: vi.fn(),
}));
vi.mock("@noble/hashes/utils.js", async (load) => ({
  ...(await load<typeof import("@noble/hashes/utils.js")>()),
  randomBytes: mocks.randomBytes,
}));
vi.mock("applesauce-core/helpers/keys", async (load) => ({
  ...(await load<typeof import("applesauce-core/helpers/keys")>()),
  generateSecretKey: mocks.uploadKey,
}));
vi.mock("@noble/ciphers/chacha.js", async (load) => {
  const actual = await load<typeof import("@noble/ciphers/chacha.js")>();
  return {
    ...actual,
    chacha20poly1305: (key: Uint8Array, nonce: Uint8Array, aad: Uint8Array) => {
      const cipher = actual.chacha20poly1305(key, nonce, aad);
      return {
        encrypt: cipher.encrypt,
        decrypt: (bytes: Uint8Array) => {
          mocks.decrypt();
          return cipher.decrypt(bytes);
        },
      };
    },
  };
});

type Metadata = {
  kind: "present";
  imageHash: Uint8Array;
  imageKey: Uint8Array;
  imageNonce: Uint8Array;
  imageUploadKey: Uint8Array;
  mediaType: string;
};
// Locally derived fixture independently checked with Noble and Python cryptography.
const key = hexToBytes(
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
);
const nonce = hexToBytes("202122232425262728292a2b");
const plaintext = hexToBytes(
  "4d61726d6f742067726f757020696d6167652066697874757265",
);
const ciphertext = hexToBytes(
  "3e86fa117e9bdc5de9aad8b86956e2d91c0b5e547911eb38f484642eb16fa41111c8a8b8c5d5a6f590b1",
);
const metadata: Metadata = {
  kind: "present",
  imageHash: hexToBytes(
    "9b4e5665a756ae6e7b245baf127ecfdd5bfd3a68b6f867fb8e32042e7ee6ed13",
  ),
  imageKey: key,
  imageNonce: nonce,
  imageUploadKey: new Uint8Array(32).fill(4),
  mediaType: "image/png",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.randomBytes.mockImplementation((length: number) =>
    length === 32 ? key : nonce,
  );
  mocks.uploadKey.mockReturnValue(metadata.imageUploadKey);
});

describe("group image crypto", () => {
  it("matches the independently checked ciphertext and hash fixture", () => {
    const encrypted = image?.encryptGroupImage?.(
      plaintext,
      " Image/PNG ; ignored=1 ",
    );
    expect(encrypted?.ciphertext).toEqual(ciphertext);
    expect(encrypted?.metadata).toEqual(metadata);
    expect(image?.decryptGroupImage?.(ciphertext, metadata)).toEqual(plaintext);
    expect(bytesToHex(image!.buildGroupImageAad!("image/png"))).toBe(
      "6d61726d6f742d67726f75702d696d6167652d763100696d6167652f706e67",
    );
  });
  it("rejects the ciphertext hash before invoking AEAD", () => {
    const tampered = ciphertext.slice();
    tampered[0] ^= 1;
    expect(() => image?.decryptGroupImage?.(tampered, metadata)).toThrow(
      /hash/,
    );
    expect(mocks.decrypt).not.toHaveBeenCalled();
  });
  it.each(["imageKey", "imageNonce", "mediaType"] as const)(
    "authenticates %s without returning plaintext",
    (field) => {
      const changed = {
        ...metadata,
        [field]:
          field === "mediaType"
            ? "image/jpeg"
            : new Uint8Array(metadata[field].length).fill(9),
      };
      expect(() => image?.decryptGroupImage?.(ciphertext, changed)).toThrow();
    },
  );
  it("owns its generated metadata, ciphertext and returned plaintext", () => {
    const encrypted = image?.encryptGroupImage?.(plaintext, "image/png");
    expect(encrypted?.metadata.imageKey).not.toBe(key);
    expect(encrypted?.metadata.imageNonce).not.toBe(nonce);
    expect(encrypted?.metadata.imageUploadKey).not.toBe(
      metadata.imageUploadKey,
    );
    const decrypted = image?.decryptGroupImage?.(ciphertext, metadata);
    expect(decrypted).toEqual(plaintext);
    expect(decrypted).not.toBe(plaintext);
    expect(mocks.randomBytes.mock.calls).toEqual([[32], [12]]);
    expect(mocks.uploadKey).toHaveBeenCalledOnce();
  });
});
