import { afterEach, describe, expect, it, vi } from "vitest";
import { encryptGroupImage } from "../../../core/group-image.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  fetchGroupImageTransport,
  normalizeGroupImageEndpoint,
  validateGroupImageUploadResponse,
  type GroupImageTransportRequest,
} from "../group-image-transport.js";

const endpoint = "https://images.example";
const request = (): GroupImageTransportRequest => ({
  url: `${endpoint}/${"a".repeat(64)}`,
  method: "GET",
  headers: {},
  signal: new AbortController().signal,
  maxBytes: 32,
  deadlineMs: 1000,
});
afterEach(() => vi.unstubAllGlobals());

describe("strict Blossom transport", () => {
  it("checks elapsed deadline after microtask work before delivering bytes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const until = performance.now() + 5;
        while (performance.now() < until) {
          /* Simulate synchronous network callback work. */
        }
        return new Response(Uint8Array.of(1));
      }),
    );
    const result = await fetchGroupImageTransport({
      ...request(),
      deadlineMs: 1,
    }).then(
      () => "accepted",
      (error) => error.reason,
    );
    expect(result).toBe("deadline");
  });
  it("rejects oversized Content-Length before reading any chunk", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>(
      { cancel },
      { highWaterMark: 0 },
    );
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(stream, { headers: { "Content-Length": "33" } }),
        ),
    );
    const result = await Promise.race([
      fetchGroupImageTransport(request()).then(
        () => "accepted",
        (error) => error.reason,
      ),
      new Promise<string>((resolve) =>
        setTimeout(() => resolve("still reading"), 25),
      ),
    ]);
    expect(result).toBe("byte-limit");
    expect(cancel).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
  });
  it("bounds a fetch that ignores abort and cancels its late body", async () => {
    let finish!: (response: Response) => void;
    const fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(
      fetchGroupImageTransport({ ...request(), deadlineMs: 10 }),
    ).rejects.toMatchObject({ reason: "deadline" });
    const cancel = vi.fn();
    finish(new Response(new ReadableStream<Uint8Array>({ cancel })));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]).toBeDefined();
  });
  it("releases and cancels the reader on a stream failure", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.error(new Error("network"));
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream)));
    await expect(fetchGroupImageTransport(request())).rejects.toThrow(
      "network",
    );
    expect(stream.locked).toBe(false);
  });
  it("bounds metadata overhead while collecting many tiny chunks", async () => {
    let index = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        if (index++ < 1000) c.enqueue(Uint8Array.of(7));
        else c.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream)));
    expect(
      (await fetchGroupImageTransport({ ...request(), maxBytes: 1000 })).body,
    ).toEqual(new Uint8Array(1000).fill(7));
  });
  it.each([NaN, Infinity, 0, -1, 1.5, 2_147_483_648])(
    "rejects invalid direct deadline %s without contact",
    async (deadlineMs) => {
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      await expect(
        fetchGroupImageTransport({ ...request(), deadlineMs }),
      ).rejects.toMatchObject({ reason: "byte-limit" });
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it.each([undefined, "1", "32"])(
    "checks each chunk with length hint %s",
    async (length) => {
      const cancel = vi.fn();
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new Uint8Array(32));
          c.enqueue(Uint8Array.of(1));
        },
        cancel,
      });
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(stream, {
            headers: length ? { "Content-Length": length } : {},
          }),
        ),
      );
      await expect(fetchGroupImageTransport(request())).rejects.toMatchObject({
        reason: "byte-limit",
      });
      expect(cancel).toHaveBeenCalledOnce();
      expect(stream.locked).toBe(false);
    },
  );
  it("accepts the exact chunk budget and releases the reader", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array(15));
        c.enqueue(new Uint8Array(17));
        c.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream)));
    expect((await fetchGroupImageTransport(request())).body.length).toBe(32);
    expect(stream.locked).toBe(false);
  });
  it("bounds stalled chunks even when cancellation never settles", async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(Uint8Array.of(1));
      },
      cancel,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream)));
    const result = await Promise.race([
      fetchGroupImageTransport({ ...request(), deadlineMs: 10 }).then(
        () => "accepted",
        (error) => error.reason,
      ),
      new Promise<string>((resolve) =>
        setTimeout(() => resolve("still reading"), 40),
      ),
    ]);
    expect(result).toBe("deadline");
    expect(cancel).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
  });
  it("cancels mid-stream and removes the signal listener", async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(Uint8Array.of(1));
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream)));
    const pending = fetchGroupImageTransport({
      ...request(),
      signal: controller.signal,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ reason: "cancelled" });
    expect(stream.locked).toBe(false);
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  });
  it("refuses pre-aborted requests without fetching", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      fetchGroupImageTransport({ ...request(), signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ reason: "cancelled" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects missing streaming bodies without buffered fallbacks", async () => {
    const arrayBuffer = vi.fn();
    const json = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        body: null,
        status: 200,
        headers: new Headers(),
        arrayBuffer,
        json,
      }),
    );
    await expect(fetchGroupImageTransport(request())).rejects.toMatchObject({
      reason: "invalid-response",
    });
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
  });
  it.each(["-1", "1.5", "nonsense"])(
    "rejects malformed Content-Length %s",
    async (length) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(Uint8Array.of(1), {
            headers: { "Content-Length": length },
          }),
        ),
      );
      await expect(fetchGroupImageTransport(request())).rejects.toMatchObject({
        reason: "invalid-response",
      });
    },
  );
  it("caps error diagnostics at 1 KiB", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(new Uint8Array(1025), { status: 500 })),
    );
    await expect(
      fetchGroupImageTransport({ ...request(), maxBytes: 2000 }),
    ).rejects.toMatchObject({ reason: "byte-limit" });
  });
  it("rejects an already redirected response", async () => {
    const response = new Response(Uint8Array.of(1));
    Object.defineProperty(response, "redirected", { value: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    const result = await fetchGroupImageTransport(request()).then(
      () => "accepted",
      (error) => error.reason,
    );
    expect(result).toBe("invalid-response");
  });
  it("omits ambient credentials referrer and HTTP cache", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(Uint8Array.of(1, 2)));
    vi.stubGlobal("fetch", fetch);
    expect((await fetchGroupImageTransport(request())).body).toEqual(
      Uint8Array.of(1, 2),
    );
    expect(fetch).toHaveBeenCalledWith(
      request().url,
      expect.objectContaining({
        redirect: "error",
        credentials: "omit",
        referrer: "",
        referrerPolicy: "no-referrer",
        cache: "no-store",
      }),
    );
  });
  it.each([
    "garbage",
    "http://images.example",
    "https://u:p@images.example",
    "https://images.example/path",
    "https://images.example/?query",
    "https://images.example/#fragment",
    "https://localhost",
    "https://127.0.0.1",
    "https://10.1.2.3",
    "https://[::1]",
  ])("refuses unsafe origin %s", (url) => {
    expect(() => normalizeGroupImageEndpoint(url)).toThrow(
      "Group image contact-denied",
    );
  });
  it("normalizes origin case and default port", () => {
    expect(normalizeGroupImageEndpoint("https://IMAGES.example:443/")).toBe(
      endpoint,
    );
  });

  const image = encryptGroupImage(Uint8Array.of(1, 2), "image/png");
  const hash = bytesToHex(image.metadata.imageHash);
  const descriptor = () => ({
    url: `${endpoint}/${hash}.bin`,
    sha256: hash,
    size: image.ciphertext.length,
    type: "application/octet-stream",
    uploaded: 1,
  });
  const validate = (body: unknown, status = 201) =>
    validateGroupImageUploadResponse(
      { status, body: new TextEncoder().encode(JSON.stringify(body)) },
      endpoint,
      hash,
      image.ciphertext.length,
    );
  it.each([200, 201])("accepts complete descriptor at status %s", (status) => {
    expect(() => validate(descriptor(), status)).not.toThrow();
  });
  it.each([202, 204, 206, 301, 401, 500])(
    "rejects upload status %s",
    (status) => {
      expect(() => validate(descriptor(), status)).toThrow("invalid-response");
    },
  );
  it.each([
    ["url", `https://elsewhere.example/${hash}`],
    ["url", `${endpoint}/prefix${hash}`],
    ["url", `${endpoint}/${hash}?x`],
    ["url", `${endpoint}/${hash}#x`],
    ["url", `https://u:p@images.example/${hash}`],
    ["url", `${endpoint}/${hash}/extra`],
    ["sha256", hash.toUpperCase()],
    ["size", String(image.ciphertext.length)],
    ["size", 1],
    ["type", "image/png"],
    ["uploaded", "1"],
    ["uploaded", -1],
    ["uploaded", 1.5],
  ])("rejects descriptor field %s=%s", (key, value) => {
    expect(() => validate({ ...descriptor(), [key]: value })).toThrow(
      "invalid-response",
    );
  });
  it.each(["url", "sha256", "size", "type", "uploaded"])(
    "rejects missing %s",
    (key) => {
      const body: Record<string, unknown> = descriptor();
      delete body[key];
      expect(() => validate(body)).toThrow("invalid-response");
    },
  );
  it.each([
    ["invalid JSON", "{"],
    ["null", "null"],
    ["array", "[]"],
    ["boolean", "true"],
  ])("rejects malformed descriptor %s", (_, body) => {
    expect(() =>
      validateGroupImageUploadResponse(
        { status: 201, body: new TextEncoder().encode(body) },
        endpoint,
        hash,
        image.ciphertext.length,
      ),
    ).toThrow("invalid-response");
  });
});
