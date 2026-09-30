/**
 * Pure decision logic for the account's advertised relay lists (NIP-65 outbox,
 * kind 10002; welcome inbox, kind 10050). No imports from `controller.ts`, no
 * I/O — this module only turns already-known lists (plus discovery progress)
 * into UI-facing status, gap text, and new-group relay choices. Kept separate
 * from `controller.ts` so it can be unit-tested without a live controller.
 */

/**
 * Discovery state of the account's 10002/10050 relay lists, as surfaced to the
 * UI. `"ready"` means both lists are known; `"loading"` means a discovery pass
 * is either still running or has never been attempted; `"missing-outbox"` and
 * `"missing-inbox"` mean a discovery pass settled but one list came back empty.
 */
export type RelayListStatus =
  "loading" | "missing-outbox" | "missing-inbox" | "ready";

/** True only when both the outbox and inbox relay lists are non-empty. */
export function relayListsComplete(outbox: string[], inbox: string[]): boolean {
  return outbox.length > 0 && inbox.length > 0;
}

/**
 * Derives the current {@link RelayListStatus} from the account's known relay
 * lists and the state of discovery. Order of evaluation: both lists known
 * always wins ("ready"); otherwise a pass that hasn't settled yet (in flight,
 * or never attempted) is "loading"; otherwise the missing list determines
 * "missing-outbox" or "missing-inbox".
 */
export function deriveRelayListStatus(input: {
  outbox: string[];
  inbox: string[];
  inFlight: boolean;
  attempted: boolean;
}): RelayListStatus {
  if (relayListsComplete(input.outbox, input.inbox)) return "ready";
  if (input.inFlight || !input.attempted) return "loading";
  if (input.outbox.length === 0) return "missing-outbox";
  return "missing-inbox";
}

/**
 * One-line, human-readable text describing why relay lists are incomplete, for
 * reuse in both warn log lines and UI copy. Returns null when there is nothing
 * to report ("ready" or "loading" — a pass may still resolve it).
 */
export function describeRelayListGap(status: RelayListStatus): string | null {
  switch (status) {
    case "ready":
    case "loading":
      return null;
    case "missing-outbox":
      return "no outbox relay list (kind 10002) was found for this account";
    case "missing-inbox":
      return "found an outbox list but no inbox relay list (kind 10050) — invites (welcomes) cannot reach this account";
  }
}

/** A single choice offered by the new-group relay prompt. */
export interface GroupRelayChoice {
  kind: "outbox" | "manual" | "setup";
  name: string;
  description: string;
}

/**
 * Builds the new-group relay prompt's choices (R1). Never returns an "outbox"
 * choice when `outbox` is empty, regardless of discovery status — the account's
 * outbox relays are only ever offered once they are actually known.
 */
export function groupRelayChoices(
  outbox: string[],
  status: RelayListStatus,
): GroupRelayChoice[] {
  const manual: GroupRelayChoice = {
    kind: "manual",
    name: "Enter relays manually",
    description: "space or comma separated relay URLs/domains",
  };

  if (outbox.length > 0) {
    return [
      {
        kind: "outbox",
        name: "Use my outbox relays",
        description: outbox.join(", "),
      },
      manual,
    ];
  }

  const setup: GroupRelayChoice =
    status === "loading"
      ? {
          kind: "setup",
          name: "Set up my relay lists",
          description:
            "still looking for your relay lists — you can set them up now instead of waiting",
        }
      : {
          kind: "setup",
          name: "Set up my relay lists",
          description:
            "no outbox relays were found for this account — this opens the relay editor",
        };

  return [manual, setup];
}
