import { describe, expect, test } from "bun:test";

import {
  deriveRelayListStatus,
  describeRelayListGap,
  groupRelayChoices,
  relayListsComplete,
} from "./relay-lists.js";

describe("relayListsComplete", () => {
  test("false when the inbox list is empty", () => {
    expect(relayListsComplete(["wss://a"], [])).toBe(false);
  });

  test("true when both lists are non-empty", () => {
    expect(relayListsComplete(["wss://a"], ["wss://b"])).toBe(true);
  });
});

describe("deriveRelayListStatus", () => {
  test("ready when both lists are known, regardless of in-flight/attempted", () => {
    expect(
      deriveRelayListStatus({
        outbox: ["wss://a"],
        inbox: ["wss://b"],
        inFlight: true,
        attempted: false,
      }),
    ).toBe("ready");
  });

  test("loading when discovery has not yet been attempted", () => {
    expect(
      deriveRelayListStatus({
        outbox: [],
        inbox: [],
        inFlight: false,
        attempted: false,
      }),
    ).toBe("loading");
  });

  test("loading when a re-attempt is in flight", () => {
    expect(
      deriveRelayListStatus({
        outbox: [],
        inbox: ["wss://b"],
        inFlight: true,
        attempted: true,
      }),
    ).toBe("loading");
  });

  test("missing-outbox when outbox is empty after a settled attempt", () => {
    expect(
      deriveRelayListStatus({
        outbox: [],
        inbox: ["wss://b"],
        inFlight: false,
        attempted: true,
      }),
    ).toBe("missing-outbox");
  });

  test("missing-inbox when outbox is known but inbox is empty after a settled attempt", () => {
    expect(
      deriveRelayListStatus({
        outbox: ["wss://a"],
        inbox: [],
        inFlight: false,
        attempted: true,
      }),
    ).toBe("missing-inbox");
  });
});

describe("describeRelayListGap", () => {
  test("null for ready", () => {
    expect(describeRelayListGap("ready")).toBeNull();
  });

  test("null for loading", () => {
    expect(describeRelayListGap("loading")).toBeNull();
  });

  test("mentions 10002 for missing-outbox", () => {
    expect(describeRelayListGap("missing-outbox")).toContain("10002");
  });

  test("mentions 10050 for missing-inbox", () => {
    expect(describeRelayListGap("missing-inbox")).toContain("10050");
  });
});

describe("groupRelayChoices", () => {
  const statuses = [
    "loading",
    "missing-outbox",
    "missing-inbox",
    "ready",
  ] as const;

  for (const status of statuses) {
    test(`never offers an "outbox" choice for an empty outbox (status=${status})`, () => {
      const choices = groupRelayChoices([], status);
      expect(choices.map((c) => c.kind)).toEqual(["manual", "setup"]);
    });
  }

  test('offers "outbox" then "manual" for a non-empty outbox', () => {
    const choices = groupRelayChoices(["wss://a", "wss://b"], "ready");
    expect(choices.map((c) => c.kind)).toEqual(["outbox", "manual"]);
    const outboxChoice = choices[0]!;
    expect(outboxChoice.description).toContain("wss://a");
    expect(outboxChoice.description).toContain("wss://b");
  });

  test('offers "outbox" first even when the inbox list is missing', () => {
    const choices = groupRelayChoices(["wss://a"], "missing-inbox");
    expect(choices[0]!.kind).toBe("outbox");
  });
});
