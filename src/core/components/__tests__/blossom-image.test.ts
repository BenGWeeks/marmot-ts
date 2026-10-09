import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import * as codec from "../blossom-image.js";
import { BinaryWriter, encodeVarint } from "../../binary.js";

const present = {
  kind: "present" as const,
  imageHash: new Uint8Array(32).fill(1),
  imageKey: new Uint8Array(32).fill(2),
  imageNonce: new Uint8Array(12).fill(3),
  imageUploadKey: new Uint8Array(32).fill(4),
  mediaType: "image/jpeg",
};
// Derived from MDK traits app_components/tests.rs input, not a published vector.
const wire =
  "2001010101010101010101010101010101010101010101010101010101010101012002020202020202020202020202020202020202020202020202020202020202020c0303030303030303030303032004040404040404040404040404040404040404040404040404040404040404040a696d6167652f6a706567";

describe("group Blossom image codec", () => {
  it("encodes the exact 123-byte MDK-derived fixture", () => {
    const encoded = codec?.encodeGroupBlossomImage?.(present);
    expect(encoded && bytesToHex(encoded)).toBe(wire);
    expect(encoded?.length).toBe(123);
    expect(codec?.decodeGroupBlossomImage?.(encoded!)).toEqual(present);
  });
  it("round-trips the five-empty-field clear state", () => {
    const encoded = codec?.encodeGroupBlossomImage?.({ kind: "empty" });
    expect(encoded && bytesToHex(encoded)).toBe("0000000000");
    expect(codec?.decodeGroupBlossomImage?.(encoded!)).toEqual({
      kind: "empty",
    });
  });

  it("rejects multiple MIME slashes", () => {
    expect(() =>
      codec.canonicalizeGroupImageMediaType("image/png/extra"),
    ).toThrow(/slash/);
  });

  const fields = [
    present.imageHash,
    present.imageKey,
    present.imageNonce,
    present.imageUploadKey,
    new TextEncoder().encode(present.mediaType),
  ];
  const encodeFields = (parts: Uint8Array[]) =>
    parts
      .reduce((writer, field) => writer.opaque(field), new BinaryWriter())
      .build();
  it.each(Array.from({ length: 30 }, (_, i) => i + 1))(
    "rejects partial field presence mask %i",
    (mask) => {
      expect(() =>
        codec.decodeGroupBlossomImage(
          encodeFields(
            fields.map((field, i) =>
              mask & (1 << i) ? field : new Uint8Array(),
            ),
          ),
        ),
      ).toThrow(/partial/);
    },
  );
  it.each([0, 1, 2, 3])("rejects short cryptographic field %i", (index) => {
    expect(() =>
      codec.decodeGroupBlossomImage(
        encodeFields(
          fields.map((field, i) => (i === index ? field.slice(1) : field)),
        ),
      ),
    ).toThrow(/partial/);
  });
  it.each([0, 1, 2, 3, 4])(
    "rejects oversized announced field %i before reading its body",
    (index) => {
      const writer = new BinaryWriter();
      fields.slice(0, index).forEach((field) => writer.opaque(field));
      writer.bytes(encodeVarint([33, 33, 13, 33, 129][index]));
      expect(() => codec.decodeGroupBlossomImage(writer.build())).toThrow(
        /above maximum/,
      );
    },
  );
  it("rejects every truncated prefix or body", () => {
    const valid = hexToBytes(wire);
    for (let length = 0; length < valid.length; length++) {
      expect(() =>
        codec.decodeGroupBlossomImage(valid.slice(0, length)),
      ).toThrow();
    }
  });
  it("rejects nonminimal vector length and trailing bytes", () => {
    const valid = hexToBytes(wire);
    expect(() =>
      codec.decodeGroupBlossomImage(
        new Uint8Array([0x40, 32, ...valid.slice(1)]),
      ),
    ).toThrow(/non-minimal/);
    expect(() =>
      codec.decodeGroupBlossomImage(new Uint8Array([...valid, 0])),
    ).toThrow();
    expect(() => codec.decodeGroupBlossomImage(new Uint8Array(6))).toThrow();
  });
  it.each([
    Uint8Array.of(0xff),
    Uint8Array.of(0xc0, 0xaf),
    new Uint8Array([0xef, 0xbb, 0xbf, ...fields[4]]),
  ])("rejects invalid UTF-8 or BOM media bytes %j", (media) => {
    expect(() =>
      codec.decodeGroupBlossomImage(
        encodeFields([...fields.slice(0, 4), media]),
      ),
    ).toThrow();
  });
  it.each([
    "IMAGE/PNG",
    "image/jpg",
    " image/png",
    "image/png ",
    "image/png;a=b",
    "image/png/extra",
    "image/p ng",
    "image/☃",
  ])("rejects noncanonical stored MIME %s", (mime) => {
    expect(() =>
      codec.decodeGroupBlossomImage(
        encodeFields([...fields.slice(0, 4), new TextEncoder().encode(mime)]),
      ),
    ).toThrow();
  });
  it.each([
    "image/png/extra",
    "image/",
    "/png",
    "image",
    "image/p ng",
    "image/p\u0000ng",
    "image/☃",
    "\u000bimage/png",
    "\u00a0image/png",
    `${"a".repeat(65)}/png`,
    `image/${"a".repeat(65)}`,
    `${"a".repeat(64)}/${"b".repeat(64)}`,
  ])("rejects invalid declared MIME %s", (mime) => {
    expect(() => codec.canonicalizeGroupImageMediaType(mime)).toThrow();
  });
  it("canonicalizes exactly MDK ASCII whitespace, tokens, limits and JPEG alias", () => {
    expect(
      codec.canonicalizeGroupImageMediaType(
        "\t\n\f\r IMAGE/JPG \t; ignored=\u00a0",
      ),
    ).toBe("image/jpeg");
    expect(
      codec.canonicalizeGroupImageMediaType("application/X!#$%&'*+-.^_`|~012"),
    ).toBe("application/x!#$%&'*+-.^_`|~012");
    const maximum = `${"a".repeat(64)}/${"b".repeat(63)}`;
    expect(codec.canonicalizeGroupImageMediaType(maximum)).toBe(maximum);
    expect(
      codec.decodeGroupBlossomImage(
        codec.encodeGroupBlossomImage({ ...present, mediaType: maximum }),
      ),
    ).toEqual({ ...present, mediaType: maximum });
  });
  it("checks upload-key length only and returns owned decoded fields", () => {
    const valid = codec.encodeGroupBlossomImage({
      ...present,
      imageUploadKey: new Uint8Array(32),
    });
    const decoded = codec.decodeGroupBlossomImage(valid);
    expect(decoded.kind).toBe("present");
    if (decoded.kind !== "present") throw new Error("expected present");
    expect(decoded.imageUploadKey).toEqual(new Uint8Array(32));
    valid.fill(0);
    expect(decoded.imageHash).toEqual(present.imageHash);
    decoded.imageHash.fill(9);
    expect(present.imageHash[0]).toBe(1);
  });
});
