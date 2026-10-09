import type { NostrEvent } from "applesauce-core/helpers/event";
import type { Filter } from "applesauce-core/helpers/filter";
import { describe, expect, it, vi } from "vitest";

import { MockNetwork } from "../../__tests__/helpers/mock-network.js";
import { testAccount } from "../../__tests__/helpers/test-accounts.js";
import type { SerializedClientState } from "../../core/client-state.js";
import { InMemoryKeyValueStore } from "../../extra/in-memory-key-value-store.js";
import {
  BACKFILL_FUTURE_SKEW_SECONDS,
  backfillCursorKey,
  backfillProgressKey,
  decodeBackfillCursor,
  encodeBackfillCursor,
  fetchPagedBackfill,
  nextBackfillCursor,
} from "../group-backfill.js";
import { GroupsManager } from "../groups-manager.js";
import type { NostrNetworkInterface } from "../nostr-interface.js";
import { fakeVerifyEvent, type VerifyEventMethod } from "../verify.js";

const RELAY = "wss://relay.test";
const nowSeconds = () => Math.floor(Date.now() / 1000);

/**
 * A MockNetwork whose `request` behaves like a real relay: honours `since`,
 * `until` (inclusive) and `limit`, returning newest-first. `relayCaps` lets a
 * relay cap results below the requested `limit`. Every request filter is
 * recorded.
 */
class PagingNetwork extends MockNetwork {
  readonly requests: { relays: string[]; filter: Filter }[] = [];
  readonly relayEvents = new Map<string, NostrEvent[]>();
  readonly relayCaps = new Map<string, number>();

  override async request(
    relays: string[],
    filters: Filter | Filter[],
  ): Promise<NostrEvent[]> {
    const filter = (Array.isArray(filters) ? filters[0] : filters)!;
    this.requests.push({ relays, filter });
    const source =
      relays.length === 1 && this.relayEvents.has(relays[0]!)
        ? this.relayEvents.get(relays[0]!)!
        : await super.request(relays, { ...filter, limit: undefined });
    const cap = Math.min(
      filter.limit ?? Infinity,
      this.relayCaps.get(relays[0]!) ?? Infinity,
    );
    return source
      .filter(
        (e) =>
          (filter.since === undefined || e.created_at >= filter.since) &&
          (filter.until === undefined || e.created_at <= filter.until),
      )
      .sort((a, b) => b.created_at - a.created_at || (a.id < b.id ? -1 : 1))
      .slice(0, cap);
  }
}

function fakeEvent(id: number, createdAt: number): NostrEvent {
  return {
    id: id.toString(16).padStart(64, "0"),
    pubkey: "0".repeat(64),
    created_at: createdAt,
    kind: 445,
    tags: [["h", "aa"]],
    content: "",
    sig: "0".repeat(128),
  };
}

function makeManager(
  network: NostrNetworkInterface,
  ingestStateStore = new InMemoryKeyValueStore<Uint8Array>(),
  verifyEvent: VerifyEventMethod = fakeVerifyEvent,
) {
  return new GroupsManager({
    store: new InMemoryKeyValueStore<SerializedClientState>(),
    ingestStateStore,
    lifecycleStore: new InMemoryKeyValueStore<Uint8Array>(),
    ingestPersistence: { kind: "durable" },
    signer: testAccount(0).signer,
    network,
    verifyEvent,
  });
}

/**
 * Creates a group and publishes `count` application messages, then re-dates
 * them one second apart (newest = `newest`) so pages have distinct
 * boundaries. `fakeVerifyEvent` keeps the re-dated events admissible.
 */
async function groupWithHistory(
  network: PagingNetwork,
  count: number,
  newest: number,
  verifyEvent?: VerifyEventMethod,
) {
  const ingestStateStore = new InMemoryKeyValueStore<Uint8Array>();
  const manager = makeManager(network, ingestStateStore, verifyEvent);
  const group = await manager.create("Backfill Group", { relays: [RELAY] });
  for (let i = 0; i < count; i++) {
    await manager.send(group.id, {
      kind: "applicationMessage",
      payload: new TextEncoder().encode(`message ${i}`),
    });
  }
  const groupEvents = network.events.filter((e) => e.kind === 445);
  expect(groupEvents).toHaveLength(count);
  groupEvents.forEach((event, i) => {
    event.created_at = newest - (count - 1 - i);
  });
  return { manager, group, groupEvents, ingestStateStore };
}

describe("fetchPagedBackfill", () => {
  it("pages each relay independently down to its oldest event", async () => {
    const network = new PagingNetwork();
    const a = Array.from({ length: 7 }, (_, i) => fakeEvent(i + 1, 1000 + i));
    const b = Array.from({ length: 4 }, (_, i) => fakeEvent(i + 100, 900 + i));
    network.relayEvents.set("wss://a", a);
    network.relayEvents.set("wss://b", b);
    // Relay A caps below the requested limit: its short pages must not be
    // mistaken for the end of its history.
    network.relayCaps.set("wss://a", 2);

    const result = await fetchPagedBackfill(
      network,
      ["wss://a", "wss://b"],
      { kinds: [445], "#h": ["aa"] },
      { pageSize: 3, maxPages: 20 },
    );

    expect(result.complete).toBe(true);
    expect(new Set(result.events.map((e) => e.id))).toEqual(
      new Set([...a, ...b].map((e) => e.id)),
    );
    expect(network.requests.every((r) => r.filter.limit === 3)).toBe(true);
    expect(network.requests.every((r) => r.relays.length === 1)).toBe(true);
  });

  it("re-reads a page boundary that splits one second", async () => {
    const network = new PagingNetwork();
    // The first page (limit 3) ends inside second 500, cutting event 4 off.
    // An exclusive `until` (499) would skip it.
    const events = [
      fakeEvent(1, 502),
      fakeEvent(2, 501),
      fakeEvent(3, 500),
      fakeEvent(4, 500),
      fakeEvent(5, 499),
    ];
    network.relayEvents.set(RELAY, events);

    const result = await fetchPagedBackfill(
      network,
      [RELAY],
      {},
      {
        pageSize: 3,
        maxPages: 20,
      },
    );

    expect(result.complete).toBe(true);
    expect(result.events).toHaveLength(5);
  });

  it("reports a saturated second instead of a complete backfill", async () => {
    const network = new PagingNetwork();
    // Second 700 holds more events (4) than one page (2) can return, so
    // paging by `until` cannot enumerate all of them.
    const events = [
      fakeEvent(1, 701),
      ...[2, 3, 4, 5].map((id) => fakeEvent(id, 700)),
      fakeEvent(6, 699),
    ];
    network.relayEvents.set(RELAY, events);

    const result = await fetchPagedBackfill(
      network,
      [RELAY],
      {},
      { pageSize: 2, maxPages: 20 },
    );

    expect(result.complete).toBe(false);
    expect(result.relays).toEqual([{ relay: RELAY, status: "saturated" }]);
    // The walk still continues below the saturated second.
    expect(result.events.map((e) => e.created_at)).toContain(699);
  });

  it("resumes below a range an earlier capped backfill fetched", async () => {
    const network = new PagingNetwork();
    network.relayEvents.set(
      RELAY,
      Array.from({ length: 10 }, (_, i) => fakeEvent(i + 1, 1000 + i)),
    );

    const result = await fetchPagedBackfill(
      network,
      [RELAY],
      {},
      {
        pageSize: 2,
        maxPages: 3,
        resume: new Map([[RELAY, { from: 1002, to: 1009 }]]),
      },
    );

    // Head page, then straight to the resume point: no re-read of 1003-1007.
    expect(network.requests.map((r) => r.filter.until)).toEqual([
      undefined,
      1002,
      1001,
    ]);
    expect(result.relays).toEqual([
      { relay: RELAY, status: "capped", until: 1000 },
    ]);
  });

  it("reports an incomplete backfill when the page cap is hit", async () => {
    const network = new PagingNetwork();
    network.relayEvents.set(
      RELAY,
      Array.from({ length: 10 }, (_, i) => fakeEvent(i + 1, 1000 + i)),
    );

    const result = await fetchPagedBackfill(
      network,
      [RELAY],
      {},
      {
        pageSize: 2,
        maxPages: 2,
      },
    );

    expect(result.complete).toBe(false);
    // Two pages of two, the second re-reading the inclusive `until` boundary.
    expect(result.events).toHaveLength(3);
  });
});

describe("nextBackfillCursor", () => {
  const now = 2_000_000;

  it("ignores events dated beyond the future-skew horizon", () => {
    const next = nextBackfillCursor({
      ingested: [
        fakeEvent(1, now - 10),
        fakeEvent(2, now + BACKFILL_FUTURE_SKEW_SECONDS + 1),
      ],
      held: [],
      previous: undefined,
      nowSeconds: now,
    });
    expect(next).toBe(now - 10);
  });

  it("holds the cursor at a held event even if it was not in this batch", () => {
    // e.g. pooled from the live subscription before this reconnect.
    const next = nextBackfillCursor({
      ingested: [fakeEvent(1, now - 10)],
      held: [fakeEvent(2, now - 300)],
      previous: now - 200,
      nowSeconds: now,
    });
    expect(next).toBe(now - 300);
  });

  it("holds the cursor at the oldest event still held in memory", () => {
    const held = fakeEvent(2, now - 50);
    const next = nextBackfillCursor({
      ingested: [fakeEvent(1, now - 100), held, fakeEvent(3, now - 10)],
      held: [held],
      previous: now - 200,
      nowSeconds: now,
    });
    expect(next).toBe(now - 50);
  });

  it("never moves backwards without a held event", () => {
    const next = nextBackfillCursor({
      ingested: [fakeEvent(1, now - 100)],
      held: [],
      previous: now - 10,
      nowSeconds: now,
    });
    expect(next).toBe(now - 10);
  });

  it("round-trips the stored encoding and rejects malformed bytes", () => {
    expect(decodeBackfillCursor(encodeBackfillCursor(now))).toBe(now);
    expect(decodeBackfillCursor(new Uint8Array([9, 0, 0, 0, 1]))).toBe(
      undefined,
    );
    expect(decodeBackfillCursor(null)).toBe(undefined);
  });
});

describe("GroupsManager.connect bounded, paged backfill (#106)", () => {
  it("pages through history larger than one page and ingests all of it", async () => {
    const network = new PagingNetwork([RELAY]);
    const { manager, group, groupEvents } = await groupWithHistory(
      network,
      7,
      nowSeconds() - 60,
    );
    network.requests.length = 0;
    const ingestSpy = vi.spyOn(group, "ingest");

    const sub = await manager.connect(group.id, { backfillPageSize: 3 });
    sub.unsubscribe();

    const backfillRequests = network.requests;
    expect(backfillRequests.length).toBeGreaterThan(2);
    expect(backfillRequests.every((r) => r.filter.limit === 3)).toBe(true);
    // First connect has no cursor: the full history is paged, no `since`.
    expect(backfillRequests.every((r) => r.filter.since === undefined)).toBe(
      true,
    );
    const backfilled = ingestSpy.mock.calls[0]![0] as NostrEvent[];
    expect(new Set(backfilled.map((e) => e.id))).toEqual(
      new Set(groupEvents.map((e) => e.id)),
    );
  });

  it("bounds the next connect's `since` by the persisted cursor", async () => {
    const network = new PagingNetwork([RELAY]);
    const newest = nowSeconds() - 60;
    const { manager, group, ingestStateStore } = await groupWithHistory(
      network,
      4,
      newest,
    );

    (await manager.connect(group.id, { backfillPageSize: 3 })).unsubscribe();
    expect(
      decodeBackfillCursor(
        await ingestStateStore.getItem(backfillCursorKey(group.idStr)),
      ),
    ).toBe(newest);

    network.requests.length = 0;
    (
      await manager.connect(group.id, {
        backfillPageSize: 3,
        backfillSlackSeconds: 120,
      })
    ).unsubscribe();

    expect(network.requests.length).toBeGreaterThan(0);
    expect(network.requests.every((r) => r.filter.since === newest - 120)).toBe(
      true,
    );
  });

  it("does not advance the cursor from a future-dated event", async () => {
    const network = new PagingNetwork([RELAY]);
    const newest = nowSeconds() - 60;
    const { manager, group, groupEvents, ingestStateStore } =
      await groupWithHistory(network, 3, newest);
    // Same payload, distinct id, dated an hour ahead.
    network.events.push({
      ...groupEvents[0]!,
      id: "f".repeat(64),
      created_at: nowSeconds() + 3600,
    });

    (await manager.connect(group.id)).unsubscribe();

    expect(
      decodeBackfillCursor(
        await ingestStateStore.getItem(backfillCursorKey(group.idStr)),
      ),
    ).toBe(newest);
  });

  it("does not advance the cursor from a forged copy of an admitted event", async () => {
    const network = new PagingNetwork([RELAY]);
    const newest = nowSeconds() - 60;
    const forgeries = new WeakSet<NostrEvent>();
    const { manager, group, groupEvents, ingestStateStore } =
      await groupWithHistory(network, 3, newest, (e) => !forgeries.has(e));
    // An open connection keeps every admitted id in the shared dedup cache.
    const open = await manager.connect(group.id);
    // A same-id copy with a newer timestamp that fails verification.
    const forged = { ...groupEvents[2]!, created_at: newest + 120 };
    forgeries.add(forged);
    network.events.push(forged);

    (await manager.connect(group.id)).unsubscribe();
    open.unsubscribe();

    expect(
      decodeBackfillCursor(
        await ingestStateStore.getItem(backfillCursorKey(group.idStr)),
      ),
    ).toBe(newest);
  });

  it("keeps the cursor when the page cap leaves history unfetched", async () => {
    const network = new PagingNetwork([RELAY]);
    const { manager, group, ingestStateStore } = await groupWithHistory(
      network,
      6,
      nowSeconds() - 60,
    );

    (
      await manager.connect(group.id, {
        backfillPageSize: 2,
        backfillMaxPages: 1,
      })
    ).unsubscribe();

    expect(
      await ingestStateStore.getItem(backfillCursorKey(group.idStr)),
    ).toBeNull();
  });

  it("holds the cursor at an undecryptable event pooled without a result", async () => {
    const network = new PagingNetwork([RELAY]);
    const newest = nowSeconds() - 60;
    const { manager, group, groupEvents, ingestStateStore } =
      await groupWithHistory(network, 3, newest);
    // A ciphertext this group cannot decrypt (another group's message,
    // re-tagged into this group). Ingest pools it silently, yielding nothing.
    const other = makeManager(network);
    const otherGroup = await other.create("Other", { relays: [RELAY] });
    await other.send(otherGroup.id, {
      kind: "applicationMessage",
      payload: new TextEncoder().encode("foreign"),
    });
    const foreign = network.events.at(-1)!;
    foreign.tags = groupEvents[0]!.tags.map((tag) => [...tag]);
    foreign.created_at = newest - 30;

    (await manager.connect(group.id)).unsubscribe();

    expect(group.pendingEvents().map((e) => e.id)).toContain(foreign.id);
    expect(
      decodeBackfillCursor(
        await ingestStateStore.getItem(backfillCursorKey(group.idStr)),
      ),
    ).toBe(newest - 30);
  });

  it("completes a page-capped backfill over successive connects", async () => {
    const network = new PagingNetwork([RELAY]);
    const newest = nowSeconds() - 60;
    const { manager, group, groupEvents, ingestStateStore } =
      await groupWithHistory(network, 6, newest);
    const ingestSpy = vi.spyOn(group, "ingest");
    const options = {
      backfillPageSize: 2,
      backfillMaxPages: 3,
      backfillSlackSeconds: 0,
    };
    const cursor = async () =>
      decodeBackfillCursor(
        await ingestStateStore.getItem(backfillCursorKey(group.idStr)),
      );

    let connects = 0;
    while ((await cursor()) === undefined && connects < 6) {
      (await manager.connect(group.id, options)).unsubscribe();
      connects++;
    }

    expect(await cursor()).toBe(newest);
    expect(connects).toBeGreaterThan(1);
    const backfilled = new Set(
      ingestSpy.mock.calls.flatMap((call) =>
        (call[0] as NostrEvent[]).map((e) => e.id),
      ),
    );
    expect(backfilled).toEqual(new Set(groupEvents.map((e) => e.id)));
    // A completed relay drops its resumable progress.
    expect(
      await ingestStateStore.getItem(backfillProgressKey(group.idStr, RELAY)),
    ).toBeNull();
  });
});
