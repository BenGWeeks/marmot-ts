import { describe, expect, it, vi } from "vitest";
import { base64urlnopad } from "@scure/base";
import {
  getEventHash,
  finalizeEvent,
  verifyEvent,
  type NostrEvent,
} from "applesauce-core/helpers/event";
import { getPublicKey, generateSecretKey } from "applesauce-core/helpers/keys";
import { bytesToHex } from "@noble/hashes/utils.js";
import { createGroupImageUploadAuthorization } from "../group-image-transport.js";
import { makeAppDataDictionaryExtension, type ClientState } from "ts-mls";
import {
  encodeGroupBlossomImage,
  type GroupBlossomImagePresent,
} from "../../../core/components/blossom-image.js";
import { groupAvatarUrlEntry } from "../../../core/components/dictionary.js";
import {
  encryptGroupImage,
  getGroupImageSnapshotIdentity,
  type GroupImageSource,
} from "../../../core/group-image.js";
import {
  GroupImageService,
  requestGroupImage,
  effectiveGroupImageReadProfile,
  type GroupImageProfile,
} from "../group-image-service.js";
import type {
  GroupImageTransportRequest,
  GroupImageTransportResponse,
} from "../group-image-transport.js";

const endpoint = "https://images.example";
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fixture() {
  const image = encryptGroupImage(Uint8Array.of(1, 2, 3), "image/png");
  const source: Extract<GroupImageSource, { kind: "blossom" }> = {
    kind: "blossom",
    metadata: image.metadata,
    snapshotIdentity: getGroupImageSnapshotIdentity(image.metadata),
  };
  const getState = vi.fn(() => ({}) as ClientState);
  const service = new GroupImageService({ getState, isClosed: () => false });
  // Isolate HTTP policy/integrity from source projection, already covered by real MLS tracer.
  vi.spyOn(service, "source").mockReturnValue(source);
  return { image, source, service, getState };
}
function canonicalFixture(
  cache: { maxCacheEntries?: number; maxCacheBytes?: number } = {},
) {
  const image = encryptGroupImage(Uint8Array.of(1, 2, 3), "image/png");
  let state: ClientState;
  let closed = false;
  const set = (metadata: GroupBlossomImagePresent | null, avatar?: string) => {
    state = {
      groupContext: {
        extensions: [
          makeAppDataDictionaryExtension([
            {
              componentId: 0x8002,
              data: encodeGroupBlossomImage(metadata ?? { kind: "empty" }),
            },
            ...(avatar ? [groupAvatarUrlEntry({ url: avatar })] : []),
          ]),
        ],
      },
    } as ClientState;
  };
  set(image.metadata);
  const service = new GroupImageService({
    getState: () => state,
    isClosed: () => closed,
    ...cache,
  });
  return {
    image,
    service,
    set,
    state: () => state,
    close: () => {
      closed = true;
      service.close();
    },
  };
}
describe("strict Blossom service", () => {
  it("close wipes plaintext retained by a deferred delivery policy", async () => {
    const { service, image } = canonicalFixture();
    const gate = deferred<boolean>();
    let calls = 0;
    const pending = service.read({
      endpoints: [endpoint],
      transport: async () => ({ status: 200, body: image.ciphertext }),
      contactPolicy: () => (++calls === 3 ? gate.promise : true),
    });
    await vi.waitFor(() => expect(calls).toBe(3));
    const owned = [
      ...(service as unknown as { plaintext: Set<Uint8Array> }).plaintext,
    ];
    expect(owned).toHaveLength(2);
    service.close();
    expect(await pending).toEqual({ kind: "unavailable", reason: "closed" });
    expect(owned.every((bytes) => bytes.every((byte) => byte === 0))).toBe(
      true,
    );
    gate.resolve(true);
  });

  it("close releases deadline timers before noncooperative HTTP settles", async () => {
    vi.useFakeTimers();
    try {
      const { service, image } = canonicalFixture();
      const response = deferred<GroupImageTransportResponse>();
      const transport = vi.fn(() => response.promise);
      const pending = service.read({ endpoints: [endpoint], transport });
      for (let index = 0; index < 20 && !transport.mock.calls.length; index++)
        await Promise.resolve();
      expect(transport).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      service.close();
      expect(await pending).toEqual({ kind: "unavailable", reason: "closed" });
      expect(vi.getTimerCount()).toBe(0);
      response.resolve({ status: 200, body: image.ciphertext });
    } finally {
      vi.useRealTimers();
    }
  });
  it("wipes owned cached plaintext on close without changing delivered bytes", async () => {
    const { service, image } = canonicalFixture();
    const profile = {
      endpoints: [endpoint],
      transport: vi.fn(async () => ({ status: 200, body: image.ciphertext })),
    };
    const delivered = await service.read(profile);
    expect(delivered.kind).toBe("available");
    // Inspect only resource ownership; consumers never receive this array.
    const owned = (
      service as unknown as {
        cache: Map<string, { bytes: Uint8Array }>;
      }
    ).cache
      .values()
      .next().value!.bytes;
    service.close();
    service.close();
    expect(owned.every((byte) => byte === 0)).toBe(true);
    if (delivered.kind === "available")
      expect(delivered.bytes).toEqual(Uint8Array.of(1, 2, 3));
    expect(await service.read(profile)).toEqual({
      kind: "unavailable",
      reason: "closed",
    });
  });

  it.each(["resolver", "policy", "delivery"] as const)(
    "close releases waiters and listeners before a deferred %s settles",
    async (stage) => {
      const { service, image } = canonicalFixture();
      const resolver = deferred<readonly string[]>();
      const policy = deferred<boolean>();
      let calls = 0;
      const caller = new AbortController();
      const add = vi.spyOn(caller.signal, "addEventListener");
      const remove = vi.spyOn(caller.signal, "removeEventListener");
      const transport = vi.fn(async () => ({
        status: 200,
        body: image.ciphertext,
      }));
      let entered = false;
      const profile = {
        endpoints: [endpoint],
        transport,
        ...(stage === "resolver"
          ? {
              resolveEndpoints: () => {
                entered = true;
                return resolver.promise;
              },
            }
          : {
              contactPolicy: () => {
                calls++;
                if (stage === "policy" || calls >= 3) {
                  entered = true;
                  return policy.promise;
                }
                return true;
              },
            }),
      };
      const first = service.read(profile, { signal: caller.signal });
      await vi.waitFor(() => expect(entered).toBe(true));
      const second = service.read(profile);
      service.close();
      service.close();
      expect(await first).toEqual({ kind: "unavailable", reason: "closed" });
      expect(await second).toEqual({ kind: "unavailable", reason: "closed" });
      expect(remove.mock.calls.length).toBe(add.mock.calls.length);
      resolver.resolve([endpoint]);
      policy.resolve(true);
      await Promise.resolve();
      expect(await service.read(profile)).toEqual({
        kind: "unavailable",
        reason: "closed",
      });
      if (stage !== "delivery") expect(transport).not.toHaveBeenCalled();
    },
  );
  it("shares compatible reads while cancelling only one waiter", async () => {
    const { service, image } = fixture();
    const response = deferred<GroupImageTransportResponse>();
    const transport = vi.fn(() => response.promise);
    const profile = { endpoints: [endpoint], transport };
    const firstAbort = new AbortController();
    const first = service.read(profile, { signal: firstAbort.signal });
    const second = service.read({ ...profile });
    await vi.waitFor(() => expect(transport).toHaveBeenCalled());
    expect(transport.mock.calls.length).toBe(1);
    firstAbort.abort();
    expect(await first).toEqual({ kind: "unavailable", reason: "cancelled" });
    response.resolve({ status: 200, body: image.ciphertext });
    expect(await second).toMatchObject({
      kind: "available",
      bytes: Uint8Array.of(1, 2, 3),
    });
  });
  it.each([
    "endpoint",
    "resolver",
    "transport",
    "policy",
    "authorization",
    "maxDownloadBytes",
    "maxUploadBytes",
    "maxDescriptorBytes",
    "maxDiagnosticBytes",
    "maxEndpointCandidates",
    "deadlineMs",
  ])("isolates physical reads with different %s provenance", async (field) => {
    const { service, image } = fixture();
    const response = deferred<GroupImageTransportResponse>();
    const transport = vi.fn(() => response.promise);
    let allowed = true;
    const policy = () => allowed;
    const base: GroupImageProfile = {
      endpoints: [endpoint],
      transport,
      contactPolicy: policy,
    };
    const variation: GroupImageProfile =
      field === "endpoint"
        ? { endpoints: ["https://other.example"] }
        : field === "resolver"
          ? { resolveEndpoints: async () => [endpoint] }
          : field === "transport"
            ? { transport: vi.fn(() => response.promise) }
            : field === "policy"
              ? { contactPolicy: () => true }
              : field === "authorization"
                ? {}
                : { [field]: field === "maxEndpointCandidates" ? 3 : 1000 };
    const first = service.read(base);
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
    if (field === "authorization") allowed = false;
    const second = service.read({ ...base, ...variation });
    if (field === "authorization") {
      expect(await second).toEqual({
        kind: "unavailable",
        reason: "contact-denied",
      });
      allowed = true;
    } else if (field === "transport") {
      await vi.waitFor(() =>
        expect(variation.transport).toHaveBeenCalledTimes(1),
      );
      expect(transport).toHaveBeenCalledTimes(1);
    } else await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
    response.resolve({ status: 200, body: image.ciphertext });
    expect((await first).kind).toBe("available");
    if (field !== "authorization")
      expect((await second).kind).toBe("available");
  });
  it("abandons final-waiter work immediately and ignores late rejection", async () => {
    const { service, image } = fixture();
    const response = deferred<GroupImageTransportResponse>();
    const transport = vi
      .fn()
      .mockImplementationOnce(() => response.promise)
      .mockResolvedValue({ status: 200, body: image.ciphertext });
    const profile = { endpoints: [endpoint], transport };
    const controller = new AbortController();
    const first = service.read(profile, { signal: controller.signal });
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
    const signal = transport.mock.calls[0][0].signal as AbortSignal;
    controller.abort();
    expect(await first).toEqual({ kind: "unavailable", reason: "cancelled" });
    expect(signal.aborted).toBe(true);
    const next = service.read(profile);
    response.reject(new Error("late noncooperative failure"));
    expect((await next).kind).toBe("available");
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it.each([
    "kind",
    "content",
    "action",
    "expiration",
    "hash",
    "server",
    "signature",
    "id",
    "duplicate",
    "future",
    "padding",
    "body",
    "mime",
  ])("rejects upload %s mismatch before contact", async (field) => {
    const { image } = fixture();
    const transport = vi
      .fn()
      .mockResolvedValue({ status: 201, body: Uint8Array.of(1) });
    const header = createGroupImageUploadAuthorization(
      endpoint,
      image.metadata,
    );
    let event: NostrEvent = JSON.parse(
      new TextDecoder().decode(base64urlnopad.decode(header.slice(6))),
    );
    if (field === "kind") event.kind = 1;
    if (field === "content") event.content = "Delete Blob";
    if (field === "action") event.tags[0][1] = "delete";
    if (field === "expiration")
      event.tags[1][1] = String(Math.floor(Date.now() / 1000) + 601);
    if (field === "hash") event.tags[2][1] = "f".repeat(64);
    if (field === "server") event.tags[3][1] = "elsewhere.example";
    if (field === "duplicate") event.tags.push(["t", "upload"]);
    if (field === "future")
      event.created_at = Math.floor(Date.now() / 1000) + 1;
    // Scope tests retain valid signatures so profile validation, not crypto failure, rejects them.
    event = finalizeEvent(event, image.metadata.imageUploadKey);
    if (field === "signature") event.sig = "0".repeat(128);
    if (field === "id") event.id = "0".repeat(64);
    const authorization = `Nostr ${base64urlnopad.encode(new TextEncoder().encode(JSON.stringify(event)))}${field === "padding" ? "=" : ""}`;
    const body = image.ciphertext.slice();
    if (field === "body") body[0] ^= 1;
    await expect(
      requestGroupImage(
        { transport },
        {
          url: `${endpoint}/upload`,
          method: "PUT",
          headers: {
            "Content-Type":
              field === "mime" ? "image/png" : "application/octet-stream",
            "X-SHA-256": bytesToHex(image.metadata.imageHash),
            Authorization: authorization,
          },
          body,
          maxBytes: 16384,
        },
      ),
    ).rejects.toMatchObject({ reason: "invalid-response" });
    expect(transport).not.toHaveBeenCalled();
  });
  it("bounds upload descriptor returned by a custom transport", async () => {
    const { image } = fixture();
    const transport = vi
      .fn()
      .mockResolvedValue({ status: 201, body: new Uint8Array(16385) });
    await expect(
      requestGroupImage(
        { transport },
        {
          url: `${endpoint}/upload`,
          method: "PUT",
          headers: {
            "Content-Type": "application/octet-stream",
            "X-SHA-256": bytesToHex(image.metadata.imageHash),
            Authorization: createGroupImageUploadAuthorization(
              endpoint,
              image.metadata,
            ),
          },
          body: image.ciphertext,
          maxBytes: 16384,
        },
      ),
    ).rejects.toMatchObject({ reason: "byte-limit" });
  });
  it("refuses signing an authorization for an unsafe origin", () => {
    const { image } = fixture();
    expect(() =>
      createGroupImageUploadAuthorization("https://localhost", image.metadata),
    ).toThrow("contact-denied");
  });
  it("signs exact image-specific authorization with unpadded base64url", () => {
    const accountKey = generateSecretKey();
    const first = encryptGroupImage(Uint8Array.of(1), "image/png");
    const second = encryptGroupImage(Uint8Array.of(1), "image/png");
    const before = Math.floor(Date.now() / 1000);
    const header = createGroupImageUploadAuthorization(
      "https://IMAGES.example:8443",
      first.metadata,
    );
    expect(header).toMatch(/^Nostr [A-Za-z0-9_-]+$/);
    const event: NostrEvent = JSON.parse(
      new TextDecoder().decode(base64urlnopad.decode(header.slice(6))),
    );
    expect(verifyEvent(event)).toBe(true);
    expect(getEventHash(event)).toBe(event.id);
    expect(event.kind).toBe(24242);
    expect(event.content).toBe("Upload Blob");
    expect(event.created_at).toBeGreaterThanOrEqual(before - 1);
    expect(event.created_at).toBeLessThanOrEqual(
      Math.floor(Date.now() / 1000) - 1,
    );
    expect(event.tags).toEqual([
      ["t", "upload"],
      ["expiration", String(event.created_at + 601)],
      ["x", bytesToHex(first.metadata.imageHash)],
      ["server", "images.example"],
    ]);
    expect(event.pubkey).toBe(getPublicKey(first.metadata.imageUploadKey));
    expect(event.pubkey).not.toBe(getPublicKey(accountKey));
    expect(first.metadata.imageUploadKey).not.toEqual(first.metadata.imageKey);
    expect(first.metadata.imageUploadKey).not.toEqual(
      second.metadata.imageUploadKey,
    );
    expect(first.metadata.imageKey).not.toEqual(second.metadata.imageKey);
    expect(first.metadata.imageNonce).not.toEqual(second.metadata.imageNonce);
  });
  it("rejects tampered upload authorization before contacting the server", async () => {
    const { image } = fixture();
    const transport = vi
      .fn()
      .mockResolvedValue({ status: 201, body: new TextEncoder().encode("{}") });
    const authorization = createGroupImageUploadAuthorization(
      endpoint,
      image.metadata,
    );
    const event = JSON.parse(
      new TextDecoder().decode(base64urlnopad.decode(authorization.slice(6))),
    );
    event.content = "Delete Blob";
    const result = await requestGroupImage(
      { transport },
      {
        url: `${endpoint}/upload`,
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-SHA-256": bytesToHex(image.metadata.imageHash),
          Authorization: `Nostr ${base64urlnopad.encode(new TextEncoder().encode(JSON.stringify(event)))}`,
        },
        body: image.ciphertext,
        maxBytes: 16384,
      },
    ).then(
      () => "accepted",
      (error) => error.reason,
    );
    expect(result).toBe("invalid-response");
    expect(transport).not.toHaveBeenCalled();
  });
  it("bounds a hanging request contact policy", async () => {
    const transport = vi.fn();
    const result = await Promise.race([
      requestGroupImage(
        {
          deadlineMs: 10,
          transport,
          contactPolicy: () => new Promise<boolean>(() => {}),
        },
        {
          url: `${endpoint}/${"a".repeat(64)}`,
          method: "GET",
          headers: {},
          maxBytes: 100,
        },
      ).then(
        () => "accepted",
        (error) => error.reason,
      ),
      new Promise<string>((resolve) =>
        setTimeout(() => resolve("still waiting"), 40),
      ),
    ]);
    expect(result).toBe("deadline");
    expect(transport).not.toHaveBeenCalled();
  });
  it.each(["resolver", "policy", "transport"])(
    "bounds hanging %s in one read deadline",
    async (stage) => {
      const { service } = fixture();
      const never = () => new Promise<never>(() => {});
      expect(
        await service.read({
          endpoints: [endpoint],
          deadlineMs: 10,
          ...(stage === "resolver"
            ? { resolveEndpoints: never }
            : stage === "policy"
              ? { contactPolicy: never }
              : { transport: never }),
        }),
      ).toEqual({ kind: "unavailable", reason: "deadline" });
    },
  );
  it("refuses policy revocation after a successful HTTP response", async () => {
    const { service, image } = fixture();
    let authorized = true;
    expect(
      await service.read({
        endpoints: [endpoint],
        contactPolicy: () => authorized,
        transport: async () => {
          authorized = false;
          return { status: 200, body: image.ciphertext };
        },
      }),
    ).toEqual({ kind: "unavailable", reason: "contact-denied" });
  });
  it("validates missing endpoints and policy before any reuse", async () => {
    const { service, image } = fixture();
    const transport = vi
      .fn()
      .mockResolvedValue({ status: 200, body: image.ciphertext });
    expect(
      (await service.read({ endpoints: [endpoint], transport })).kind,
    ).toBe("available");
    expect(await service.read({ transport })).toEqual({
      kind: "unavailable",
      reason: "endpoint-absent",
    });
    expect(
      await service.read({
        endpoints: [endpoint],
        transport,
        contactPolicy: () => false,
      }),
    ).toEqual({ kind: "unavailable", reason: "contact-denied" });
    expect(transport).toHaveBeenCalledOnce();
  });
  it.each([NaN, Infinity, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "refuses invalid numeric override %s before contact",
    async (limit) => {
      const { service } = fixture();
      const transport = vi.fn();
      for (const field of [
        "maxDownloadBytes",
        "maxUploadBytes",
        "maxDescriptorBytes",
        "maxDiagnosticBytes",
        "maxEndpointCandidates",
        "deadlineMs",
      ] as const)
        expect(
          await service.read({
            endpoints: [endpoint],
            transport,
            [field]: limit,
          }),
        ).toEqual({ kind: "unavailable", reason: "byte-limit" });
      expect(transport).not.toHaveBeenCalled();
    },
  );
  it("rechecks custom transport byte count before crypto", async () => {
    const { service, image } = fixture();
    expect(
      await service.read({
        endpoints: [endpoint],
        maxDownloadBytes: image.ciphertext.length - 1,
        transport: async () => ({ status: 200, body: image.ciphertext }),
      }),
    ).toEqual({ kind: "unavailable", reason: "byte-limit" });
  });
  it("checks every resolver candidate and the four-candidate cap before contact", async () => {
    const { service } = fixture();
    const transport = vi.fn();
    for (const candidates of [
      [endpoint, "http://unsafe.example"],
      new Array(5).fill(endpoint),
    ])
      expect(
        await service.read({
          resolveEndpoints: async () => candidates,
          transport,
        }),
      ).toEqual({ kind: "unavailable", reason: "contact-denied" });
    expect(transport).not.toHaveBeenCalled();
  });
  it("retains caller-scoped effective provenance across request-affecting options", async () => {
    const { source } = fixture();
    const signal = new AbortController().signal;
    const base = {
      endpoints: [endpoint],
      transport: async () => ({ status: 200, body: Uint8Array.of(1) }),
    };
    const baseline = await effectiveGroupImageReadProfile(base, source, signal);
    expect(
      (await effectiveGroupImageReadProfile({ ...base }, source, signal))
        .compatibilityKey,
    ).toBe(baseline.compatibilityKey);
    for (const variation of [
      { endpoints: ["https://other.example"] },
      { resolveEndpoints: async () => [endpoint] },
      { transport: async () => ({ status: 200, body: Uint8Array.of(1) }) },
      { contactPolicy: () => true },
      { maxDownloadBytes: 100 },
      { maxUploadBytes: 100 },
      { maxDescriptorBytes: 100 },
      { maxDiagnosticBytes: 100 },
      { maxEndpointCandidates: 2 },
      { deadlineMs: 100 },
    ])
      expect(
        (
          await effectiveGroupImageReadProfile(
            { ...base, ...variation },
            source,
            signal,
          )
        ).compatibilityKey,
      ).not.toBe(baseline.compatibilityKey);
  });
  it("retrieves whole ciphertext anonymously from the exact root hash", async () => {
    const { image, service } = fixture();
    const transport = vi
      .fn()
      .mockResolvedValue({ status: 200, body: image.ciphertext });
    const result = await service.read({ endpoints: [endpoint], transport });
    expect(result).toMatchObject({
      kind: "available",
      bytes: Uint8Array.of(1, 2, 3),
      mediaType: "image/png",
    });
    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        headers: {},
        url: expect.stringMatching(/^https:\/\/images\.example\/[a-f0-9]{64}$/),
      }),
    );
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it.each([
    [404, "missing-blob"],
    [206, "invalid-response"],
    [301, "invalid-response"],
    [401, "invalid-response"],
    [403, "invalid-response"],
    [500, "invalid-response"],
  ])(
    "rejects read status %s without retry or identity fallback",
    async (status, reason) => {
      const { image, service } = fixture();
      const transport = vi
        .fn()
        .mockResolvedValue({ status, body: image.ciphertext });
      expect(await service.read({ endpoints: [endpoint], transport })).toEqual({
        kind: "unavailable",
        reason,
      });
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );
  it.each(["hash-mismatch", "aead-failure"])(
    "separates %s from canonical validity and discloses no bytes",
    async (reason) => {
      const { image, source, service } = fixture();
      const snapshot = structuredClone(source);
      if (reason === "hash-mismatch") image.ciphertext[0] ^= 1;
      else source.metadata.imageKey[0] ^= 1;
      const expectedState = structuredClone(source);
      const profile: GroupImageProfile = {
        endpoints: [endpoint],
        transport: async () => ({ status: 200, body: image.ciphertext }),
      };
      expect(await service.read(profile)).toEqual({
        kind: "unavailable",
        reason,
      });
      expect(service.source()).toEqual(expectedState);
      expect(snapshot.snapshotIdentity).toBe(
        service.source().kind === "blossom" ? source.snapshotIdentity : "",
      );
    },
  );
});

describe("canonical image cache and delivery fences", () => {
  it("keeps shared plaintext and caller signal listeners independent", async () => {
    const { service, image } = canonicalFixture();
    const response = deferred<GroupImageTransportResponse>();
    const transport = vi.fn(() => response.promise);
    const controllers = [new AbortController(), new AbortController()];
    const listeners = controllers.map((controller) => ({
      add: vi.spyOn(controller.signal, "addEventListener"),
      remove: vi.spyOn(controller.signal, "removeEventListener"),
    }));
    const reads = controllers.map((controller) =>
      service.read(
        { endpoints: [endpoint], transport },
        { signal: controller.signal },
      ),
    );
    await vi.waitFor(() => expect(transport).toHaveBeenCalledOnce());
    response.resolve({ status: 200, body: image.ciphertext });
    const [first, second] = await Promise.all(reads);
    if (first.kind !== "available" || second.kind !== "available")
      throw new Error("expected available");
    expect(first.bytes).not.toBe(second.bytes);
    first.bytes.fill(99);
    expect(second.bytes).toEqual(Uint8Array.of(1, 2, 3));
    for (const { add, remove } of listeners) {
      expect(remove.mock.calls.length).toBe(add.mock.calls.length);
      expect(remove.mock.calls[0][1]).toBe(add.mock.calls[0][1]);
    }
  });
  it("independently rechecks each waiter's current authorization", async () => {
    const { service, image, state } = canonicalFixture();
    const before = structuredClone(state());
    const response = deferred<GroupImageTransportResponse>();
    const transport = vi.fn(() => response.promise);
    let firstSignal: AbortSignal | undefined;
    let denyFirst = false;
    const contactPolicy = (
      _: { url: string; method: "GET" | "PUT" },
      signal: AbortSignal,
    ) => {
      firstSignal ??= signal;
      return !denyFirst || signal !== firstSignal;
    };
    const profile = { endpoints: [endpoint], transport, contactPolicy };
    const first = service.read(profile);
    const second = service.read(profile);
    await vi.waitFor(() => expect(transport).toHaveBeenCalledOnce());
    denyFirst = true;
    response.resolve({ status: 200, body: image.ciphertext });
    expect(await first).toEqual({
      kind: "unavailable",
      reason: "contact-denied",
    });
    expect((await second).kind).toBe("available");
    expect(state()).toEqual(before);
  });
  it("rechecks warm-cache policy after admission and bounds a stalled check", async () => {
    const { service, image, state } = canonicalFixture();
    const before = structuredClone(state());
    const transport = vi
      .fn()
      .mockResolvedValue({ status: 200, body: image.ciphertext });
    const policy = vi.fn().mockResolvedValue(true);
    const profile = {
      endpoints: [endpoint],
      transport,
      contactPolicy: policy,
      deadlineMs: 100,
    };
    expect((await service.read(profile)).kind).toBe("available");
    policy.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await service.read(profile)).toEqual({
      kind: "unavailable",
      reason: "contact-denied",
    });
    policy
      .mockImplementationOnce(() => true)
      .mockImplementationOnce(() => new Promise<boolean>(() => {}));
    expect(await service.read(profile)).toEqual({
      kind: "unavailable",
      reason: "deadline",
    });
    expect(transport).toHaveBeenCalledOnce();
    expect(state()).toEqual(before);
  });
  it("does not expose mutable canonical secrets to the resolver", async () => {
    const { service, image, state } = canonicalFixture();
    const before = structuredClone(state());
    const resolver = async (source: GroupImageSource) => {
      if (source.kind === "blossom") {
        source.metadata.imageKey.fill(0);
        source.metadata.imageUploadKey.fill(0);
      }
      return [endpoint];
    };
    const transport = vi
      .fn()
      .mockResolvedValue({ status: 200, body: image.ciphertext });
    expect(
      (await service.read({ resolveEndpoints: resolver, transport })).kind,
    ).toBe("available");
    expect(state()).toEqual(before);
  });
  it("caches verified success with owned bytes", async () => {
    const { service, image, state } = canonicalFixture();
    const before = structuredClone(state());
    const transport = vi
      .fn()
      .mockResolvedValue({ status: 200, body: image.ciphertext });
    const profile = { endpoints: [endpoint], transport };
    const first = await service.read(profile);
    if (first.kind !== "available") throw new Error("expected available");
    first.bytes.fill(99);
    const second = await service.read(profile);
    expect(second).toMatchObject({
      kind: "available",
      bytes: Uint8Array.of(1, 2, 3),
    });
    expect(transport.mock.calls.length).toBe(1);
    expect(state()).toEqual(before);
  });
  it.each(["replacement", "eviction"])(
    "retains admitted cache plaintext across %s during delivery",
    async (change) => {
      const { service, image, set } = canonicalFixture({ maxCacheEntries: 1 });
      const other = encryptGroupImage(Uint8Array.of(4, 5), "image/jpeg");
      const transport = vi.fn(async () => ({
        status: 200,
        body: image.ciphertext,
      }));
      const policy = vi.fn().mockResolvedValue(true);
      const profile = {
        endpoints: [endpoint],
        transport,
        contactPolicy: policy,
      };
      const expected = {
        kind: "available",
        bytes: Uint8Array.of(1, 2, 3),
        mediaType: "image/png",
        snapshotIdentity: getGroupImageSnapshotIdentity(image.metadata),
      };
      expect(await service.read(profile)).toEqual(expected);
      const gate = deferred<boolean>();
      policy
        .mockResolvedValueOnce(true)
        .mockImplementationOnce(() => gate.promise);
      const pending = service.read(profile);
      await vi.waitFor(() => expect(policy).toHaveBeenCalledTimes(5));
      if (change === "eviction") set(other.metadata);
      expect(
        await service.read({
          endpoints: [endpoint],
          transport: async () => ({
            status: 200,
            body: change === "eviction" ? other.ciphertext : image.ciphertext,
          }),
        }),
      ).toMatchObject({ kind: "available" });
      set(image.metadata);
      gate.resolve(true);
      expect(await pending).toEqual(expected);
      expect(await service.read(profile)).toEqual(expected);
      expect(transport).toHaveBeenCalledOnce();
    },
  );
  it.each(["cancelled", "closed", "deadline", "stale"] as const)(
    "wipes retained cache delivery bytes on %s before policy settlement",
    async (outcome) => {
      const { service, image, set } = canonicalFixture();
      const policy = vi.fn().mockResolvedValue(true);
      const profile = {
        endpoints: [endpoint],
        transport: async () => ({ status: 200, body: image.ciphertext }),
        contactPolicy: policy,
        deadlineMs: 1000,
      };
      expect((await service.read(profile)).kind).toBe("available");
      const gate = deferred<boolean>();
      policy
        .mockResolvedValueOnce(true)
        .mockImplementationOnce(() => gate.promise);
      const controller = new AbortController();
      const pending = service.read(profile, { signal: controller.signal });
      await vi.waitFor(() => expect(policy).toHaveBeenCalledTimes(5));
      const retained = [
        ...(service as unknown as { plaintext: Set<Uint8Array> }).plaintext,
      ].at(-1)!;
      expect(retained).toEqual(Uint8Array.of(1, 2, 3));
      if (outcome === "cancelled") controller.abort();
      if (outcome === "closed") service.close();
      if (outcome === "stale") {
        set(null);
        gate.resolve(true);
      }
      expect(await pending).toEqual({ kind: "unavailable", reason: outcome });
      expect(retained).toEqual(new Uint8Array(3));
      gate.resolve(true);
      await Promise.resolve();
      expect(retained).toEqual(new Uint8Array(3));
    },
  );
  it.each(["replacement", "clear", "url", "rewind"])(
    "fences shared completion after canonical %s",
    async (change) => {
      const { service, image, state, set } = canonicalFixture();
      const other = encryptGroupImage(Uint8Array.of(4), "image/jpeg");
      if (change === "rewind") set(other.metadata);
      const body = change === "rewind" ? other.ciphertext : image.ciphertext;
      const response = deferred<GroupImageTransportResponse>();
      const transport = vi.fn(() => response.promise);
      const profile = { endpoints: [endpoint], transport };
      const reads = [service.read(profile), service.read(profile)];
      await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
      set(
        change === "clear"
          ? null
          : change === "replacement"
            ? other.metadata
            : image.metadata,
        change === "url" ? "https://avatars.example/new.png" : undefined,
      );
      const before = structuredClone(state());
      response.resolve({ status: 200, body });
      for (const read of reads)
        expect(await read).toEqual({ kind: "unavailable", reason: "stale" });
      expect(state()).toEqual(before);
      const nextTransport = vi
        .fn()
        .mockResolvedValue({ status: 200, body: image.ciphertext });
      set(image.metadata);
      expect(
        (
          await service.read({
            endpoints: [endpoint],
            transport: nextTransport,
          })
        ).kind,
      ).toBe("available");
      expect(nextTransport).toHaveBeenCalledOnce();
    },
  );
  it.each(["imageKey", "imageNonce", "imageUploadKey", "mediaType"] as const)(
    "keys cache and shared work by complete %s metadata",
    async (field) => {
      const { service, image, state, set } = canonicalFixture();
      const transport = vi
        .fn()
        .mockResolvedValue({ status: 200, body: image.ciphertext });
      const profile = { endpoints: [endpoint], transport };
      expect((await service.read(profile)).kind).toBe("available");
      const changed = structuredClone(image.metadata);
      if (field === "mediaType") changed.mediaType = "image/jpeg";
      else changed[field][0] ^= 1;
      set(changed);
      const before = structuredClone(state());
      const next = await service.read(profile);
      expect(next.kind).toBe(
        field === "imageUploadKey" ? "available" : "unavailable",
      );
      expect(transport).toHaveBeenCalledTimes(2);
      expect(state()).toEqual(before);
      set(image.metadata);
      expect((await service.read(profile)).kind).toBe("available");
    },
  );
  it.each([
    "endpoint",
    "resolver",
    "transport",
    "policy",
    "maxDownloadBytes",
    "maxUploadBytes",
    "maxDescriptorBytes",
    "maxDiagnosticBytes",
    "maxEndpointCandidates",
    "deadlineMs",
  ])("misses warm cache on incompatible %s provenance", async (field) => {
    const { service, image, state } = canonicalFixture();
    const before = structuredClone(state());
    const transport = vi
      .fn()
      .mockResolvedValue({ status: 200, body: image.ciphertext });
    const profile = { endpoints: [endpoint], transport };
    expect((await service.read(profile)).kind).toBe("available");
    const changed =
      field === "endpoint"
        ? { endpoints: ["https://other.example"] }
        : field === "resolver"
          ? { resolveEndpoints: async () => [endpoint] }
          : field === "transport"
            ? {
                transport: vi
                  .fn()
                  .mockResolvedValue({ status: 200, body: image.ciphertext }),
              }
            : field === "policy"
              ? { contactPolicy: () => true }
              : { [field]: field === "maxEndpointCandidates" ? 3 : 1000 };
    expect((await service.read({ ...profile, ...changed })).kind).toBe(
      "available",
    );
    expect(
      field === "transport" ? changed.transport : transport,
    ).toHaveBeenCalledTimes(field === "transport" ? 1 : 2);
    expect(state()).toEqual(before);
  });
  it("denies revoked policy and missing endpoint with a warm cache", async () => {
    const { service, image, state } = canonicalFixture();
    const before = structuredClone(state());
    let allowed = true;
    const transport = vi
      .fn()
      .mockResolvedValue({ status: 200, body: image.ciphertext });
    const profile = {
      endpoints: [endpoint],
      transport,
      contactPolicy: () => allowed,
    };
    expect((await service.read(profile)).kind).toBe("available");
    allowed = false;
    expect(await service.read(profile)).toEqual({
      kind: "unavailable",
      reason: "contact-denied",
    });
    expect(await service.read({ ...profile, endpoints: [] })).toEqual({
      kind: "unavailable",
      reason: "endpoint-absent",
    });
    expect(transport).toHaveBeenCalledOnce();
    expect(state()).toEqual(before);
  });
  it("rechecks every shared waiter when policy is revoked before delivery", async () => {
    const { service, image, state } = canonicalFixture();
    const before = structuredClone(state());
    let allowed = true;
    const response = deferred<GroupImageTransportResponse>();
    const transport = vi.fn(() => response.promise);
    const profile = {
      endpoints: [endpoint],
      transport,
      contactPolicy: () => allowed,
    };
    const first = service.read(profile);
    const second = service.read(profile);
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
    allowed = false;
    response.resolve({ status: 200, body: image.ciphertext });
    for (const result of await Promise.all([first, second]))
      expect(result).toEqual({ kind: "unavailable", reason: "contact-denied" });
    allowed = true;
    expect((await service.read(profile)).kind).toBe("available");
    expect(transport).toHaveBeenCalledTimes(2);
    expect(state()).toEqual(before);
  });
  it.each(["maxDownloadBytes", "maxUploadBytes"])(
    "enforces the caller's %s after a permissive warm cache",
    async (field) => {
      const { service, image, state } = canonicalFixture();
      const before = structuredClone(state());
      const transport = vi
        .fn()
        .mockResolvedValue({ status: 200, body: image.ciphertext });
      const profile = { endpoints: [endpoint], transport };
      expect((await service.read(profile)).kind).toBe("available");
      expect(await service.read({ ...profile, [field]: 1 })).toEqual({
        kind: "unavailable",
        reason: "byte-limit",
      });
      expect(state()).toEqual(before);
    },
  );
  it.each([
    { maxCacheEntries: 2, maxCacheBytes: 100 },
    { maxCacheEntries: 3, maxCacheBytes: 6 },
  ])("evicts least recently used entries within %j", async (cache) => {
    const { service, image, set } = canonicalFixture({
      ...cache,
    });
    const b = encryptGroupImage(Uint8Array.of(4, 5, 6), "image/png");
    const c = encryptGroupImage(Uint8Array.of(7, 8, 9), "image/png");
    const bodies = new Map(
      [image, b, c].map((entry) => [
        bytesToHex(entry.metadata.imageHash),
        entry.ciphertext,
      ]),
    );
    const transport = vi.fn(async (request) => ({
      status: 200,
      body: bodies.get(request.url.split("/").at(-1)!)!,
    }));
    const profile = { endpoints: [endpoint], transport };
    for (const entry of [image, b, image, c, image, b]) {
      set(entry.metadata);
      expect((await service.read(profile)).kind).toBe("available");
    }
    expect(transport).toHaveBeenCalledTimes(4);
  });
  it("bounds default cache to sixteen metadata entries", async () => {
    const { service, set } = canonicalFixture();
    const images = Array.from({ length: 17 }, (_, i) =>
      encryptGroupImage(Uint8Array.of(i), "image/png"),
    );
    const bodies = new Map(
      images.map((image) => [
        bytesToHex(image.metadata.imageHash),
        image.ciphertext,
      ]),
    );
    const transport = vi.fn(async (request) => ({
      status: 200,
      body: bodies.get(request.url.split("/").at(-1)!)!,
    }));
    const profile = { endpoints: [endpoint], transport };
    for (const image of [...images, images[1], images[0]]) {
      set(image.metadata);
      expect((await service.read(profile)).kind).toBe("available");
    }
    expect(transport).toHaveBeenCalledTimes(18);
  });
  it("bounds default cached plaintext to twenty MiB", async () => {
    const { service, set } = canonicalFixture();
    const images = [1, 2, 3].map((i) =>
      encryptGroupImage(new Uint8Array(7 * 1024 * 1024).fill(i), "image/png"),
    );
    const bodies = new Map(
      images.map((image) => [
        bytesToHex(image.metadata.imageHash),
        image.ciphertext,
      ]),
    );
    const transport = vi.fn(async (request) => ({
      status: 200,
      body: bodies.get(request.url.split("/").at(-1)!)!,
    }));
    const profile = { endpoints: [endpoint], transport };
    for (const image of [...images, images[1], images[0]]) {
      set(image.metadata);
      expect((await service.read(profile)).kind).toBe("available");
    }
    expect(transport).toHaveBeenCalledTimes(4);
  });
  it.each(["replacement", "clear", "url", "rewind"])(
    "fences a warm cache during %s admission",
    async (change) => {
      const { service, image, state, set } = canonicalFixture();
      const other = encryptGroupImage(Uint8Array.of(4), "image/png");
      if (change === "rewind") set(other.metadata);
      const transport = vi.fn().mockResolvedValue({
        status: 200,
        body: change === "rewind" ? other.ciphertext : image.ciphertext,
      });
      const gate = deferred<boolean>();
      let pending = false;
      const policy = vi.fn(() => (pending ? gate.promise : true));
      const profile = {
        endpoints: [endpoint],
        transport,
        contactPolicy: policy,
      };
      expect((await service.read(profile)).kind).toBe("available");
      policy.mockClear();
      pending = true;
      const read = service.read(profile);
      await vi.waitFor(() => expect(policy).toHaveBeenCalled());
      set(
        change === "clear"
          ? null
          : change === "replacement"
            ? other.metadata
            : image.metadata,
        change === "url" ? "https://avatars.example/new.png" : undefined,
      );
      const before = structuredClone(state());
      gate.resolve(true);
      expect(await read).toEqual({ kind: "unavailable", reason: "stale" });
      expect(transport).toHaveBeenCalledOnce();
      expect(state()).toEqual(before);
    },
  );
  it.each(["imageKey", "imageNonce", "imageUploadKey", "mediaType"] as const)(
    "isolates in-flight %s changes sharing the same ciphertext hash",
    async (field) => {
      const { service, image, state, set } = canonicalFixture();
      const response = deferred<GroupImageTransportResponse>();
      const transport = vi.fn(() => response.promise);
      const profile = { endpoints: [endpoint], transport };
      const first = service.read(profile);
      await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
      const changed = structuredClone(image.metadata);
      if (field === "mediaType") changed.mediaType = "image/jpeg";
      else changed[field][0] ^= 1;
      set(changed);
      const before = structuredClone(state());
      const second = service.read(profile);
      await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
      response.resolve({ status: 200, body: image.ciphertext });
      expect(await first).toEqual({ kind: "unavailable", reason: "stale" });
      expect((await second).kind).toBe(
        field === "imageUploadKey" ? "available" : "unavailable",
      );
      expect(state()).toEqual(before);
    },
  );
  it("enforces independent waiter deadlines including resolver time", async () => {
    vi.useFakeTimers();
    try {
      const { service, image } = canonicalFixture();
      const admission = deferred<readonly string[]>();
      const response = deferred<GroupImageTransportResponse>();
      const transport = vi.fn(
        (_request: GroupImageTransportRequest) => response.promise,
      );
      const resolver = vi
        .fn()
        .mockImplementationOnce(() => admission.promise)
        .mockResolvedValue([endpoint]);
      const profile = {
        resolveEndpoints: resolver,
        transport,
        deadlineMs: 100,
      };
      const first = service.read(profile);
      await vi.advanceTimersByTimeAsync(20);
      const second = service.read(profile);
      await vi.advanceTimersByTimeAsync(20);
      admission.resolve([endpoint]);
      await vi.advanceTimersByTimeAsync(0);
      expect(transport).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(61);
      expect(await first).toEqual({ kind: "unavailable", reason: "deadline" });
      expect(transport.mock.calls[0][0].signal.aborted).toBe(false);
      response.resolve({ status: 200, body: image.ciphertext });
      expect((await second).kind).toBe("available");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it("limits active physical reads while allowing compatible waiters at capacity", async () => {
    const { service, image, state } = canonicalFixture();
    const before = structuredClone(state());
    const response = deferred<GroupImageTransportResponse>();
    const transports = Array.from({ length: 5 }, () =>
      vi.fn(() => response.promise),
    );
    const reads = transports
      .slice(0, 4)
      .map((transport) => service.read({ endpoints: [endpoint], transport }));
    await vi.waitFor(() => expect(transports[3]).toHaveBeenCalled());
    expect(
      await service.read({ endpoints: [endpoint], transport: transports[4] }),
    ).toEqual({ kind: "unavailable", reason: "byte-limit" });
    const shared = service.read({
      endpoints: [endpoint],
      transport: transports[0],
    });
    response.resolve({ status: 200, body: image.ciphertext });
    for (const result of await Promise.all([...reads, shared]))
      expect(result.kind).toBe("available");
    expect(transports[0]).toHaveBeenCalledOnce();
    expect(transports[4]).not.toHaveBeenCalled();
    expect(state()).toEqual(before);
  });
  it.each([{ maxCacheEntries: 0 }, { maxCacheBytes: 0 }, { maxCacheBytes: 2 }])(
    "disables cache or skips oversized success for %j",
    async (cache) => {
      const { service, image } = canonicalFixture(cache);
      const transport = vi
        .fn()
        .mockResolvedValue({ status: 200, body: image.ciphertext });
      for (let i = 0; i < 2; i++)
        expect(
          (await service.read({ endpoints: [endpoint], transport })).kind,
        ).toBe("available");
      expect(transport).toHaveBeenCalledTimes(2);
    },
  );
  it.each([NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid finite cache capacity %s",
    (value) => {
      for (const field of ["maxCacheEntries", "maxCacheBytes"])
        expect(() => canonicalFixture({ [field]: value })).toThrow();
    },
  );
  it("never caches failure and refetches after an integrity refusal", async () => {
    const { service, image, state } = canonicalFixture();
    const before = structuredClone(state());
    const corrupt = image.ciphertext.slice();
    corrupt[0] ^= 1;
    const transport = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, body: corrupt })
      .mockResolvedValue({ status: 200, body: image.ciphertext });
    const profile = { endpoints: [endpoint], transport };
    expect(await service.read(profile)).toEqual({
      kind: "unavailable",
      reason: "hash-mismatch",
    });
    expect((await service.read(profile)).kind).toBe("available");
    expect((await service.read(profile)).kind).toBe("available");
    expect(transport).toHaveBeenCalledTimes(2);
    expect(state()).toEqual(before);
  });
  it("close aborts owned work and refuses late or cached plaintext", async () => {
    const { service, image, close, state } = canonicalFixture();
    const before = structuredClone(state());
    const response = deferred<GroupImageTransportResponse>();
    const transport = vi.fn(() => response.promise);
    const profile = { endpoints: [endpoint], transport };
    const pending = service.read(profile);
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
    close();
    expect(await pending).toEqual({ kind: "unavailable", reason: "closed" });
    response.resolve({ status: 200, body: image.ciphertext });
    expect(await service.read(profile)).toEqual({
      kind: "unavailable",
      reason: "closed",
    });
    expect(state()).toEqual(before);
  });
});
