/** @module @category Client - Group Manager */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
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

/**
 * Key of a relay's resumable paging progress for a group (bounded: one record
 * per group relay). Lives under the group's ingest-state prefix, like the
 * cursor. The relay URL is hashed so arbitrary URLs make well-formed keys.
 */
export function backfillProgressKey(groupIdHex: string, relay: string): string {
  return `${groupIdHex}/ingest/backfill-progress/v1/${bytesToHex(sha256(utf8ToBytes(relay)))}`;
}

/**
 * Resumable paging progress of one relay: every event the relay held dated in
 * `[from, to]` (inclusive, whole seconds) was fetched and durably ingested by an earlier,
 * page-capped backfill. Recorded only while that relay's backfill is
 * incomplete, and removed once a backfill of the relay completes.
 */
export interface BackfillProgress {
  from: number;
  to: number;
}

/** Encodes progress as a version byte + two big-endian uint32s. */
export function encodeBackfillProgress(progress: BackfillProgress): Uint8Array {
  const bytes = new Uint8Array(9);
  bytes[0] = CURSOR_FORMAT_VERSION;
  const view = new DataView(bytes.buffer);
  view.setUint32(1, progress.from);
  view.setUint32(5, progress.to);
  return bytes;
}

/** Decodes stored progress; `undefined` for missing or malformed bytes. */
export function decodeBackfillProgress(
  bytes: Uint8Array | null | undefined,
): BackfillProgress | undefined {
  if (!bytes || bytes.length !== 9 || bytes[0] !== CURSOR_FORMAT_VERSION)
    return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const progress = { from: view.getUint32(1), to: view.getUint32(5) };
  return progress.from <= progress.to ? progress : undefined;
}

/**
 * Reads a relay's stored paging progress for a group. Malformed progress, or
 * progress dated implausibly far in the future, is ignored (the relay is then
 * paged from its newest event as usual).
 */
export async function readBackfillProgress(
  store: GenericKeyValueStore<Uint8Array>,
  groupIdHex: string,
  relay: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<BackfillProgress | undefined> {
  const progress = decodeBackfillProgress(
    await store.getItem(backfillProgressKey(groupIdHex, relay)),
  );
  if (!progress || progress.to > nowSeconds + BACKFILL_FUTURE_SKEW_SECONDS)
    return undefined;
  return progress;
}

/** Options for {@link fetchPagedBackfill}. */
export interface PagedBackfillOptions {
  /** Lower bound passed as `since`; omit to fetch the full history. */
  since?: number;
  /** `limit` of each page. */
  pageSize: number;
  /** Maximum pages fetched from each relay. */
  maxPages: number;
  /**
   * Per-relay ranges already fetched by an earlier capped backfill. Once a
   * relay's walk has paged down to `to`, it jumps to `from` and continues
   * from there, so history beyond the page cap is reached over several
   * connects. Pass `to` already reduced by any slack.
   */
  resume?: ReadonlyMap<string, BackfillProgress>;
  /** Stops paging once aborted; unfinished relays then report `failed`. */
  signal?: AbortSignal;
}

/** How one relay's paged walk ended. */
export type RelayBackfillOutcome =
  | { relay: string; status: "complete" }
  /** Hit `maxPages`; `until` is where the walk stopped (inclusive). */
  | { relay: string; status: "capped"; until: number }
  /**
   * One second held at least a full page of events, so some may have been
   * skipped (timestamp-only paging cannot enumerate them).
   */
  | { relay: string; status: "saturated" }
  | { relay: string; status: "failed" };

/** Result of {@link fetchPagedBackfill}. */
export interface PagedBackfillResult {
  /** All distinct events fetched, across every relay. */
  events: NostrEvent[];
  /**
   * True when every relay was paged down to `since` (or its oldest event).
   * False when a relay hit `maxPages`, saturated a second, or failed; the
   * caller must then not advance its cursor, since older events may be
   * missing.
   */
  complete: boolean;
  /** Per-relay outcome, in `relays` order. */
  relays: RelayBackfillOutcome[];
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
 * second holding a full page of events cannot be paged past with `until`
 * alone (a NIP-01 limitation): the walk steps past it but reports the relay
 * `saturated`, so the caller does not treat the backfill as complete.
 */
export async function fetchPagedBackfill(
  network: NostrNetworkInterface,
  relays: string[],
  filter: Filter,
  options: PagedBackfillOptions,
): Promise<PagedBackfillResult> {
  const pageRelay = async (relay: string) => {
    const collected = new Map<string, NostrEvent>();
    const resume = options.resume?.get(relay);
    let until: number | undefined;
    let steppedPastBoundary = false;
    // Largest single-second boundary page the walk stepped past. Judged
    // against the cap only when the walk ends: the cap may be confirmed
    // (lowered) after the boundary was passed, which makes it saturated.
    let largestSkippedBoundary = 0;
    // Per-request cap this relay has been proven to enforce: a page is only
    // "full" at `pageSize`, or at the length of an earlier page the relay
    // truncated (the next, narrower request still found new events). The
    // largest page seen is not proof — a short history is short too.
    let confirmedCap = options.pageSize;
    let previousLength: number | undefined;
    const saturated = () => {
      if (largestSkippedBoundary < confirmedCap) return false;
      log("relay %s saturated a second (cap %d)", relay, confirmedCap);
      return true;
    };
    const done = () =>
      ({
        collected,
        outcome: saturated()
          ? { relay, status: "saturated" as const }
          : { relay, status: "complete" as const },
      }) as const;
    for (let page = 0; page < options.maxPages; page++) {
      if (options.signal?.aborted)
        return { collected, outcome: { relay, status: "failed" as const } };
      const events = await network.request([relay], {
        ...filter,
        limit: options.pageSize,
        ...(options.since !== undefined ? { since: options.since } : {}),
        ...(until !== undefined ? { until } : {}),
      });
      if (!events.length) return done();

      let added = 0;
      let oldest = Number.POSITIVE_INFINITY;
      let newest = Number.NEGATIVE_INFINITY;
      for (const event of events) {
        if (event.created_at < oldest) oldest = event.created_at;
        if (event.created_at > newest) newest = event.created_at;
        if (collected.has(event.id)) continue;
        collected.set(event.id, event);
        added++;
      }

      if (added > 0) {
        // This request is narrower than the previous one yet found new
        // events, so the previous page was truncated at the relay's cap.
        if (previousLength !== undefined)
          confirmedCap = Math.min(confirmedCap, previousLength);
        until = oldest;
        steppedPastBoundary = false;
      } else if (steppedPastBoundary) {
        // Two pages in a row without anything new: the relay has nothing
        // older (or is ignoring `until`).
        return done();
      } else {
        // Everything at or after `until` is already collected. A full page
        // from one second means that second may hold more events than one
        // page can return; they cannot be reached. Whether the page is
        // "full" is decided at the end, against the final confirmed cap.
        if (oldest === newest)
          largestSkippedBoundary = Math.max(
            largestSkippedBoundary,
            events.length,
          );
        // Step past the boundary second once before concluding.
        until = oldest - 1;
        steppedPastBoundary = true;
      }
      // Reached a range an earlier capped backfill already fetched: resume
      // below it instead of re-reading it.
      previousLength = events.length;
      if (resume && until <= resume.to && until > resume.from) {
        until = resume.from;
        steppedPastBoundary = false;
        // The next request is not narrower than this one: no cap evidence.
        previousLength = undefined;
      }
      if (options.since !== undefined && until < options.since) return done();
    }
    log("relay %s hit the %d-page backfill cap", relay, options.maxPages);
    // A saturated walk is never recorded as resumable progress: resuming
    // would skip past the second it could not enumerate.
    if (saturated()) return done();
    return {
      collected,
      outcome: { relay, status: "capped" as const, until: Math.max(0, until!) },
    };
  };

  const settled = await Promise.allSettled(relays.map(pageRelay));
  const failures = settled.filter(
    (r): r is PromiseRejectedResult => r.status === "rejected",
  );
  if (failures.length === settled.length && failures.length > 0)
    throw failures[0]!.reason;

  const merged = new Map<string, NostrEvent>();
  const outcomes: RelayBackfillOutcome[] = [];
  settled.forEach((result, i) => {
    if (result.status === "rejected") {
      log("backfill request failed: %o", result.reason);
      outcomes.push({ relay: relays[i]!, status: "failed" });
      return;
    }
    outcomes.push(result.value.outcome);
    for (const [id, event] of result.value.collected) merged.set(id, event);
  });
  return {
    events: [...merged.values()],
    complete: outcomes.every((o) => o.status === "complete"),
    relays: outcomes,
  };
}

/**
 * Computes the cursor to persist after a complete backfill has been ingested.
 *
 * The cursor is the newest plausibly-dated ingested event; events dated more
 * than {@link BACKFILL_FUTURE_SKEW_SECONDS} ahead of `nowSeconds` are ignored.
 * Events the group is still holding only in memory (its ingestion pool and
 * capacity-refused input, see `MarmotGroup.pendingEvents()` — not durable
 * across a restart) cap the cursor at their `created_at`, so the next connect
 * re-fetches them. Returns `undefined` when there is nothing to store.
 */
export function nextBackfillCursor(options: {
  ingested: NostrEvent[];
  held: readonly NostrEvent[];
  previous: number | undefined;
  nowSeconds: number;
}): number | undefined {
  const horizon = options.nowSeconds + BACKFILL_FUTURE_SKEW_SECONDS;
  let newest: number | undefined;
  for (const event of options.ingested) {
    if (event.created_at > horizon) continue;
    if (newest === undefined || event.created_at > newest)
      newest = event.created_at;
  }
  if (newest === undefined) return options.previous;
  const oldestHeld = oldestCreatedAt(options.held);
  if (oldestHeld !== undefined) return Math.min(newest, oldestHeld);
  return Math.max(options.previous ?? newest, newest);
}

/** The oldest `created_at` among `events` at or after `from`, if any. */
export function oldestCreatedAt(
  events: readonly NostrEvent[],
  from = Number.NEGATIVE_INFINITY,
): number | undefined {
  let oldest: number | undefined;
  for (const event of events)
    if (
      event.created_at >= from &&
      (oldest === undefined || event.created_at < oldest)
    )
      oldest = event.created_at;
  return oldest;
}
