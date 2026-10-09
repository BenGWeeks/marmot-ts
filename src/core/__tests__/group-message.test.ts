import { describe, expect, it } from "vitest";
import {
  createApplicationMessage,
  defaultCryptoProvider,
  encode,
  getCiphersuiteImpl,
  mlsMessageEncoder,
  unsafeTestingAuthenticationService,
} from "ts-mls";

import { PrivateKeyAccount } from "applesauce-accounts/accounts";

import {
  createEncryptedGroupEventContent,
  createGroupEvent,
  decryptGroupMessageEvent,
} from "../group-message.js";
import { createCredential } from "../credential.js";
import { createSimpleGroup } from "../group.js";
import { generateKeyPackage } from "../key-package.js";
import { testAccount } from "../../__tests__/helpers/test-accounts.js";

async function createTestState(account: PrivateKeyAccount<any>) {
  const ciphersuite = await getCiphersuiteImpl(
    "MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519",
    defaultCryptoProvider,
  );

  const pubkey = account.pubkey;
  const credential = createCredential(pubkey);
  const keyPackage = await generateKeyPackage({
    credential,
    ciphersuiteImpl: ciphersuite,
    signer: account.signer,
  });

  const { clientState } = await createSimpleGroup(
    keyPackage,
    ciphersuite,
    "Test Group",
    { adminPubkeys: [pubkey], relays: ["wss://relay.test"] },
  );

  return { clientState, ciphersuite };
}

describe("group message encryption (transports/nostr.md)", () => {
  it("signs the exact expiration tag and never infers it for encrypted-byte callers", async () => {
    const { clientState: state, ciphersuite } = await createTestState(
      testAccount(6),
    );
    const { message } = await createApplicationMessage({
      context: {
        cipherSuite: ciphersuite,
        authService: unsafeTestingAuthenticationService,
      },
      state,
      message: new TextEncoder().encode("opaque bytes"),
    });
    const metadata = { expiration: (1n << 64n) - 1n };
    const event = await createGroupEvent({
      state,
      message,
      ciphersuite,
      ...{ metadata },
    });
    expect(event.tags.filter((tag) => tag[0] === "expiration")).toEqual([
      ["expiration", "18446744073709551615"],
    ]);
    const { getEventHash, verifyEvent } =
      await import("applesauce-core/helpers/event");
    expect(event.id).toBe(getEventHash(event));
    expect(verifyEvent(event)).toBe(true);
    const bare = await createGroupEvent({ state, message, ciphersuite });
    expect(bare.tags.filter((tag) => tag[0] === "expiration")).toEqual([]);
    for (const expiration of [-1n, 1n << 64n]) {
      const invalid = await createGroupEvent({
        state,
        message,
        ciphersuite,
        ...{ metadata: { expiration } },
      });
      expect(invalid.tags.filter((tag) => tag[0] === "expiration")).toEqual([]);
    }
  });

  it("encrypts and decrypts with the kind-445 ChaCha20-Poly1305 envelope", async () => {
    const { clientState, ciphersuite } = await createTestState(testAccount(6));

    const { message } = await createApplicationMessage({
      context: {
        cipherSuite: ciphersuite,
        authService: unsafeTestingAuthenticationService,
      },
      state: clientState,
      message: new TextEncoder().encode("hello"),
    });

    const content = await createEncryptedGroupEventContent({
      state: clientState,
      ciphersuite,
      message,
    });

    const payload = Uint8Array.from(atob(content), (ch) => ch.charCodeAt(0));
    expect(payload.length).toBeGreaterThan(12);

    const event = {
      id: "e".repeat(64),
      kind: 445,
      pubkey: "f".repeat(64),
      created_at: Math.floor(Date.now() / 1000),
      tags: [["h", "00".repeat(32)]],
      content,
      sig: "1".repeat(128),
    };

    const decoded = await decryptGroupMessageEvent(
      event,
      clientState,
      ciphersuite,
    );

    expect(encode(mlsMessageEncoder, decoded)).toEqual(
      encode(mlsMessageEncoder, message),
    );
  });

  it("rejects invalid base64 group-event content", async () => {
    const { clientState, ciphersuite } = await createTestState(testAccount(1));

    const event = {
      id: "a".repeat(64),
      kind: 445,
      pubkey: "b".repeat(64),
      created_at: Math.floor(Date.now() / 1000),
      tags: [["h", "22".repeat(32)]],
      content: "###not-base64###",
      sig: "3".repeat(128),
    };

    await expect(
      decryptGroupMessageEvent(event, clientState, ciphersuite),
    ).rejects.toThrow("Failed to decrypt group message");
  });

  it("rejects payloads shorter than 12-byte nonce", async () => {
    const { clientState, ciphersuite } = await createTestState(testAccount(9));

    const shortPayload = new Uint8Array(11);
    const content = btoa(String.fromCharCode(...shortPayload));

    const event = {
      id: "9".repeat(64),
      kind: 445,
      pubkey: "8".repeat(64),
      created_at: Math.floor(Date.now() / 1000),
      tags: [["h", "33".repeat(32)]],
      content,
      sig: "4".repeat(128),
    };

    await expect(
      decryptGroupMessageEvent(event, clientState, ciphersuite),
    ).rejects.toThrow("Failed to decrypt group message");
  });

  it("rejects tampered ciphertext/auth tag", async () => {
    const { clientState, ciphersuite } = await createTestState(testAccount(11));

    const { message } = await createApplicationMessage({
      context: {
        cipherSuite: ciphersuite,
        authService: unsafeTestingAuthenticationService,
      },
      state: clientState,
      message: new TextEncoder().encode("tamper-check"),
    });

    const content = await createEncryptedGroupEventContent({
      state: clientState,
      ciphersuite,
      message,
    });

    const payload = Uint8Array.from(atob(content), (ch) => ch.charCodeAt(0));
    payload[payload.length - 1] ^= 0x01;
    const tamperedContent = btoa(String.fromCharCode(...payload));

    const event = {
      id: "7".repeat(64),
      kind: 445,
      pubkey: "6".repeat(64),
      created_at: Math.floor(Date.now() / 1000),
      tags: [["h", "44".repeat(32)]],
      content: tamperedContent,
      sig: "5".repeat(128),
    };

    await expect(
      decryptGroupMessageEvent(event, clientState, ciphersuite),
    ).rejects.toThrow("Failed to decrypt group message");
  });

  it("rejects payload with 12-byte nonce and empty ciphertext", async () => {
    const { clientState, ciphersuite } = await createTestState(testAccount(2));

    const nonceOnly = new Uint8Array(12);
    const content = btoa(String.fromCharCode(...nonceOnly));

    const event = {
      id: "5".repeat(64),
      kind: 445,
      pubkey: "4".repeat(64),
      created_at: Math.floor(Date.now() / 1000),
      tags: [["h", "55".repeat(32)]],
      content,
      sig: "6".repeat(128),
    };

    await expect(
      decryptGroupMessageEvent(event, clientState, ciphersuite),
    ).rejects.toThrow("Failed to decrypt group message");
  });
});
