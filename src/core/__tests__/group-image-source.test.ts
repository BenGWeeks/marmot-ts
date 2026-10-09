import { describe, expect, it, vi } from "vitest";
import { makeAppDataDictionaryExtension, type GroupInfo } from "ts-mls";
import * as core from "../index.js";
import {
  encodeGroupBlossomImage,
  type GroupBlossomImagePresent,
} from "../components/blossom-image.js";

const api = core;
function blossom(state: GroupInfo) {
  const source = api.getGroupImageSource(state);
  expect(source.kind).toBe("blossom");
  if (source.kind !== "blossom") throw new Error("expected Blossom source");
  return source;
}
const metadata: GroupBlossomImagePresent = {
  kind: "present",
  imageHash: new Uint8Array(32).fill(1),
  imageKey: new Uint8Array(32).fill(2),
  imageNonce: new Uint8Array(12).fill(3),
  imageUploadKey: new Uint8Array(32).fill(4),
  mediaType: "image/png",
};
function group(
  image = encodeGroupBlossomImage(metadata),
  avatar?: string,
): GroupInfo {
  return {
    groupContext: {
      version: 1,
      cipherSuite: 1,
      groupId: new Uint8Array(32),
      epoch: 1n,
      treeHash: new Uint8Array(32),
      confirmedTranscriptHash: new Uint8Array(32),
      extensions: [
        makeAppDataDictionaryExtension([
          core.groupProfileEntry({ name: "Images", description: "" }),
          ...(image.length
            ? [
                {
                  componentId: core.GROUP_BLOSSOM_IMAGE_COMPONENT_ID,
                  data: image,
                },
              ]
            : []),
          ...(avatar === undefined
            ? []
            : [
                core.groupAvatarUrlEntry({
                  url: avatar,
                  ...(avatar ? { dim: "128x128", thumbhash: "hint" } : {}),
                }),
              ]),
        ]),
      ],
    },
    extensions: [],
    confirmationTag: new Uint8Array(),
    signer: 0,
    signature: new Uint8Array(),
  };
}

describe("canonical group image rendering source", () => {
  it("selects a nonempty URL before Blossom and preserves render hints", () => {
    expect(
      api.getGroupImageSource?.(
        group(undefined, "https://images.example/avatar.png"),
      )?.kind,
    ).toBe("url");
    expect(
      api.getGroupImageSource?.(
        group(undefined, "https://images.example/avatar.png"),
      ),
    ).toEqual({
      kind: "url",
      url: "https://images.example/avatar.png",
      dim: "128x128",
      thumbhash: "hint",
    });
  });
  it.each([undefined, ""])(
    "falls back to Blossom for absent or empty URL %s",
    (avatar) => {
      const source = blossom(group(undefined, avatar));
      expect(source?.kind).toBe("blossom");
      expect(source?.metadata).toEqual(metadata);
      expect(source?.snapshotIdentity).toBe(
        api.getGroupImageSnapshotIdentity?.(metadata),
      );
      expect(source?.snapshotIdentity).toMatch(/^[0-9a-f]{64}$/);
    },
  );
  it.each([new Uint8Array(), encodeGroupBlossomImage({ kind: "empty" })])(
    "distinguishes none from unavailable for absent/cleared Blossom %j",
    (image) => {
      expect(api.getGroupImageSource?.(group(image, ""))).toEqual({
        kind: "none",
      });
    },
  );
  it("projects the typed image state into the canonical group view", () => {
    const view = core.getMarmotGroupView(group());
    expect(view?.blossomImage).toEqual(metadata);
    expect(view?.imageSource).toEqual(api.getGroupImageSource?.(group()));
  });
  it("owns every descriptor field and fingerprints complete metadata", () => {
    const state = group();
    const source = blossom(state);
    const identity = source?.snapshotIdentity;
    expect(identity).toMatch(/^[0-9a-f]{64}$/);
    for (const field of [
      "imageHash",
      "imageKey",
      "imageNonce",
      "imageUploadKey",
    ] as const) {
      const changed = { ...metadata, [field]: metadata[field].slice() };
      changed[field][0] ^= 1;
      expect(api.getGroupImageSnapshotIdentity?.(changed)).not.toBe(identity);
      source?.metadata?.[field].fill(0);
    }
    expect(
      api.getGroupImageSnapshotIdentity?.({
        ...metadata,
        mediaType: "image/jpeg",
      }),
    ).not.toBe(identity);
    expect(blossom(state).metadata).toEqual(metadata);
    expect(blossom(state).snapshotIdentity).toBe(identity);
  });
  it("reads synchronously without HTTP, including when a URL wins", () => {
    const fetch = vi.fn(() => {
      throw new Error("unexpected HTTP");
    });
    vi.stubGlobal("fetch", fetch);
    try {
      expect(api.getGroupImageSource?.(group())?.kind).toBe("blossom");
      expect(
        api.getGroupImageSource?.(
          group(undefined, "https://images.example/avatar.png"),
        )?.kind,
      ).toBe("url");
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("keeps canonical metadata intact after an asset integrity failure", () => {
    const state = group();
    const before = api.getGroupImageSource?.(state);
    expect(() => api.decryptGroupImage(new Uint8Array(16), metadata)).toThrow();
    expect(api.getGroupImageSource?.(state)).toEqual(before);
  });
  it("fails closed on malformed component bytes without exposing secret debug fields", () => {
    expect(() => api.getGroupImageSource?.(group(Uint8Array.of(1)))).toThrow();
    const info = core.getMarmotGroupInfo(group());
    const decoded = info.app.components.find(
      (entry) => entry.id === core.GROUP_BLOSSOM_IMAGE_COMPONENT_ID,
    )?.decoded;
    expect(decoded).toEqual({ kind: "present", mediaType: "image/png" });
    expect(
      info.app.components.find(
        (entry) => entry.id === core.GROUP_BLOSSOM_IMAGE_COMPONENT_ID,
      )?.dataHex,
    ).toBe("[redacted]");
  });
  it("selects a winning URL without decoding Blossom bytes", () => {
    expect(
      api.getGroupImageSource(
        group(Uint8Array.of(1), "https://images.example/avatar.png"),
      ).kind,
    ).toBe("url");
  });
  it("recognizes image-only canonical views and keeps projected copies independent", () => {
    const state = group();
    state.groupContext.extensions = [
      makeAppDataDictionaryExtension([
        {
          componentId: core.GROUP_BLOSSOM_IMAGE_COMPONENT_ID,
          data: encodeGroupBlossomImage(metadata),
        },
      ]),
    ];
    const view = core.getMarmotGroupView(state);
    expect(view?.blossomImage).toEqual(metadata);
    expect(view?.imageSource.kind).toBe("blossom");
    if (view?.blossomImage?.kind !== "present")
      throw new Error("expected present image");
    view.blossomImage.imageKey.fill(0);
    expect(blossom(state).metadata).toEqual(metadata);
    expect(
      view.imageSource.kind === "blossom" && view.imageSource.metadata,
    ).toEqual(metadata);
  });
});
