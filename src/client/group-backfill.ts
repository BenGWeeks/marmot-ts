/** @module @category Client - Group Manager */
import type { NostrEvent } from "applesauce-core/helpers";
import type { Filter } from "applesauce-core/helpers/filter";

import { logger } from "../utils/debug.js";
import type { GenericKeyValueStore } from "../utils/key-value.js";
import type { NostrNetworkInterface } from "./nostr-interface.js";

const log = logger.extend("GroupBackfill");

/** Default overlap re-fetched behind the stored cursor (seconds). */
export const DEFAULT_BACKFILL_SLACK_SECONDS = 10 * 60;
/** Default `limit` of each backfill page. */
export const DEFAULT_BACKFILL_PAGE_SIZE = 500;
/** Default maximum number of pages fetched per relay on one connect. */
export const DEFAULT_BACKFILL_MAX_PAGES = 50;
/**
 * Events dated further than this into the future never advance the cursor
 * (seconds). A single skewed or hostile `created_at` must not push the cursor
 * past events that have not been published yet.
 */
export const BACKFILL_FUTURE_SKEW_SECONDS = 5 * 60;

const CURSOR_FORMAT_VERSION = 1;

/**
 * Key of a group's backfill cursor in the ingest-state store. It lives under
 * the `${groupIdHex}/` prefix so group-scoped ingest-state cleanup (disband)
 * removes it with the rest of the group's ingest state.
 */
export function backfillCursorKey(groupIdHex: string): string {
  return `${groupIdHex}/ingest/backfill-cursor/v1`;
}

/** Encodes a cursor (unix seconds) as a version byte + big-endian uint32. */
export function encodeBackfillCursor(createdAt: number): Uint8Array {
  const bytes = new Uint8Array(5);
  bytes[0] = CURSOR_FORMAT_VERSION;
  new DataView(bytes.buffer).setUint32(1, createdAt);
  return bytes;
}

/** Decodes a stored cursor; returns `undefined` for missing or malformed bytes. */
export function decodeBackfillCursor(
  bytes: Uint8Array | null | undefined,
): number | undefined {
  if (!bytes || bytes.length !== 5 || bytes[0] !== CURSOR_FORMAT_VERSION)
    return undefined;
  return new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).getUint32(1);
}

/**
 * Reads a group's backfill cursor. A malformed cursor, or one dated
 * implausibly far in the future, is ignored so the caller falls back to a full
 * (paged) backfill rather than skipping history.
 */
export async function readBackfillCursor(
  store: GenericKeyValueStore<Uint8Array>,
  groupIdHex: string,
  nowSeconds: number,
): Promise<number | undefined> {
  const cursor = decodeBackfillCursor(
    await store.getItem(backfillCursorKey(groupIdHex)),
  );
  if (cursor === undefined) return undefined;
  if (cursor > nowSeconds + BACKFILL_FUTURE_SKEW_SECONDS) {
    log("ignoring future-dated cursor %d for group %s", cursor, groupIdHex);
    return undefined;
  }
  return cursor;
}

/** Options for {@link fetchPagedBackfill}. */
export interface PagedBackfillOptions {
  /** Lower bound passed as `since`; omit to fetch the full history. */
  since?: number;
  /** `limit` of each page. */
  pageSize: number;
  /** Maximum pages fetched from each relay. */
  maxPages: number;
}

/** Result of {@link fetchPagedBackfill}. */
export interface PagedBackfillResult {
  /** All distinct events fetched, across every relay. */
  events: NostrEvent[];
  /**
   * True when every relay was paged down to `since` (or its oldest event).
   * False when a relay hit `maxPages` or failed; the caller must then not
   * advance its cursor, since older events may be missing.
   */
  complete: boolean;
}

/**
 * Fetches `filter` from each relay in `limit`-sized pages, walking `until`
 * backwards from the newest event.
 *
 * Each relay is paged independently: relays cap result counts differently, so
 * the oldest event of a merged multi-relay page says nothing about how far
 * back any single relay has been read. Paging stops on a page that contributes
 * no new events rather than on a "short" page, because a relay whose own cap
 * is below `pageSize` returns short pages while it still has older events.
 * `until` is inclusive, so a page boundary that splits one second is re-read
 * (duplicates are dropped by id) before stepping past that second. A single
 * second holding more than `pageSize` events cannot be paged past with
 * `until` alone (a NIP-01 limitation); keep `pageSize` well above a group's
 * per-second event rate.
 */
export async function fetchPagedBackfill(
  network: NostrNetworkInterface,
  relays: string[],
  filter: Filter,
  options: PagedBackfillOptions,
): Promise<PagedBackfillResult> {
  const pageRelay = async (relay: string) => {
    const collected = new Map<string, NostrEvent>();
    let until: number | undefined;
    let steppedPastBoundary = false;
    for (let page = 0; page < options.maxPages; page++) {
      const events = await network.request([relay], {
        ...filter,
        limit: options.pageSize,
        ...(options.since !== undefined ? { since: options.since } : {}),
        ...(until !== undefined ? { until } : {}),
      });
      if (!events.length) return { collected, complete: true };

      let added = 0;
      let oldest = Number.POSITIVE_INFINITY;
      for (const event of events) {
        if (event.created_at < oldest) oldest = event.created_at;
        if (collected.has(event.id)) continue;
        collected.set(event.id, event);
        added++;
      }

      if (added > 0) {
        until = oldest;
        steppedPastBoundary = false;
      } else if (steppedPastBoundary) {
        // Two pages in a row without anything new: the relay has nothing
        // older (or is ignoring `until`).
        return { collected, complete: true };
      } else {
        // Everything at or after `until` is already collected; step past the
        // boundary second once before concluding.
        until = oldest - 1;
        steppedPastBoundary = true;
      }
      if (options.since !== undefined && until < options.since)
        return { collected, complete: true };
    }
    log("relay %s hit the %d-page backfill cap", relay, options.maxPages);
    return { collected, complete: false };
  };

  const settled = await Promise.allSettled(relays.map(pageRelay));
  const failures = settled.filter(
    (r): r is PromiseRejectedResult => r.status === "rejected",
  );
  if (failures.length === settled.length && failures.length > 0)
    throw failures[0]!.reason;

  const merged = new Map<string, NostrEvent>();
  let complete = failures.length === 0;
  for (const result of settled) {
    if (result.status === "rejected") {
      log("backfill request failed: %o", result.reason);
      continue;
    }
    if (!result.value.complete) complete = false;
    for (const [id, event] of result.value.collected) merged.set(id, event);
  }
  return { events: [...merged.values()], complete };
}

/**
 * Computes the cursor to persist after a complete backfill has been ingested.
 *
 * The cursor is the newest plausibly-dated ingested event; events dated more
 * than {@link BACKFILL_FUTURE_SKEW_SECONDS} ahead of `nowSeconds` are ignored.
 * Events the group is still holding in memory (deferred or capacity-refused —
 * not durable across a restart) cap the cursor at their `created_at`, so the
 * next connect re-fetches them. Returns `undefined` when there is nothing to
 * store.
 */
export function nextBackfillCursor(options: {
  ingested: NostrEvent[];
  heldIds: ReadonlySet<string>;
  previous: number | undefined;
  nowSeconds: number;
}): number | undefined {
  const horizon = options.nowSeconds + BACKFILL_FUTURE_SKEW_SECONDS;
  let newest: number | undefined;
  let oldestHeld: number | undefined;
  for (const event of options.ingested) {
    if (event.created_at > horizon) continue;
    if (newest === undefined || event.created_at > newest)
      newest = event.created_at;
    if (
      options.heldIds.has(event.id) &&
      (oldestHeld === undefined || event.created_at < oldestHeld)
    )
      oldestHeld = event.created_at;
  }
  if (newest === undefined) return options.previous;
  if (oldestHeld !== undefined) return Math.min(newest, oldestHeld);
  return Math.max(options.previous ?? newest, newest);
}
