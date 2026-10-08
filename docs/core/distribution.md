# Key Package Distribution

Key packages are published as Nostr events so others can add you to groups.

## Key Package Events (Kind 30443)

### Creating Key Package Events

```typescript
import { bytesToHex, randomBytes } from "@noble/hashes/utils.js";
import { createKeyPackageEvent } from "@internet-privacy/marmot-ts";

// The `d` slot id: 32 random bytes as lowercase hex. Generate it once, persist
// it, and reuse it for every replacement on this install. Never derive it
// from a device label or identity.
const identifier =
  (await store.get("keyPackageSlot")) ?? bytesToHex(randomBytes(32));

const event = await createKeyPackageEvent({
  keyPackage: keyPackage.publicPackage,
  identifier,
  client: "my-app-v1.0", // Optional client identifier
});

// Sign and publish to your NIP-65 write relays (see below)
const signed = await signer.signEvent(event);
await network.publish(myWriteRelays, signed);
```

::: warning Spec deviation
[`transports/nostr.md`](https://github.com/marmot-protocol/marmot/blob/master/transports/nostr.md) requires the `d` value to be exactly 64 lowercase hex characters (32 random bytes). `createKeyPackageEvent` accepts any string, so you must generate the value correctly yourself. It also still accepts a `relays` option and emits a `relays` tag, which is not in the spec's kind 30443 tag set. The client's `KeyPackageManager` passes relays and so emits this tag. Leave it out when you build events yourself.
:::

### Event Structure

```
kind: 30443
content: base64(MLSMessage{ wire_format: mls_key_package, KeyPackage })
tags:
  - ["d", "<64-char lowercase hex, random 32-byte slot id>"]
  - ["mls_protocol_version", "1.0"]
  - ["i", "<lowercase hex KeyPackageRef>"]
  - ["mls_ciphersuite", "0x0001"]
  - ["mls_extensions", "0x000a", "0x0006", "0xf2d1"]
  - ["mls_proposals", "0x0008", "0x000a", ...]
  - ["app_components", "0x8001", "0x8003", ..., "0x8009", "0x800c"]   (must include 0x8009)
  - ["client", "client-name"]   (optional)
```

There is no `encoding` tag: [`transports/nostr.md`](https://github.com/marmot-protocol/marmot/blob/master/transports/nostr.md) forbids it, and content is always standard base64. `getKeyPackage` only accepts MLSMessage-framed content. The exact `mls_extensions` / `mls_proposals` values come from the KeyPackage's leaf capabilities (GREASE ids may also appear in `mls_proposals`).

::: warning Spec deviation
Last-resort KeyPackages (the default for `generateKeyPackage`) are marked with the legacy MLS extension `0x000a`, which is why it shows up in `mls_extensions`. [`foundation/key-packages.md`](https://github.com/marmot-protocol/marmot/blob/master/foundation/key-packages.md) and [`foundation/registries.md`](https://github.com/marmot-protocol/marmot/blob/master/foundation/registries.md) instead use the `app_data_dictionary` component `0x0004`.
:::

### Extracting Key Packages

```typescript
import {
  getKeyPackage,
  evaluateKeyPackageForGroup,
} from "@internet-privacy/marmot-ts";
import type { NostrEvent } from "applesauce-core/helpers/event";

// Fetch from the target's NIP-65 write relays
const events = await fetchEvents(targetWriteRelays, {
  kinds: [30443],
  authors: [targetPubkey],
});

// Keep the newest event per `d` slot (an account can have several slots)
const newestPerSlot = new Map<string, NostrEvent>();
for (const e of events) {
  const d = e.tags.find((t) => t[0] === "d")?.[1];
  if (!d) continue;
  const prev = newestPerSlot.get(d);
  if (!prev || e.created_at > prev.created_at) newestPerSlot.set(d, e);
}

// Check eligibility against the group before inviting
const eligible = [...newestPerSlot.values()].filter(
  (e) => evaluateKeyPackageForGroup(group.state, e).eligible,
);
if (eligible.length === 0) throw new Error("No eligible KeyPackage");

const keyPackage = getKeyPackage(eligible[0]); // decode only, no validation
```

`getKeyPackage` only decodes. `evaluateKeyPackageForGroup` checks the cipher suite, the group's required capabilities, the lifetime and the `mls_proposals` tag. When several candidates are eligible, the spec ranks them: non-last-resort first, then freshest, then lower KeyPackageRef. Neither helper verifies the event's NIP-01 signature, so verify fetched events first. `client.groups.invite` verifies the signature, tag cardinality, lifetime and credential identity, but not full group eligibility, so call `group.evaluateKeyPackage(event)` before inviting.

### Deleting Key Packages

```typescript
import { createDeleteKeyPackageEvent } from "@internet-privacy/marmot-ts";

// Create kind 5 deletion event
const deleteEvent = createDeleteKeyPackageEvent({
  events: [keyPackageEvent],
});

const signedDeleteEvent = await signer.signEvent(deleteEvent);
await network.publish(relays, signedDeleteEvent);
```

## Relay List Events (NIP-65, Kind 10002)

Marmot discovers where to publish and fetch an account's key packages from its
NIP-65 relay list. There is no dedicated key-package relay list, and kind 30443
key-package events do not repeat their relays.

### Creating Relay Lists

```typescript
import { createNip65RelayListEvent } from "@internet-privacy/marmot-ts";

const eventTemplate = createNip65RelayListEvent({
  pubkey: myPubkey,
  relays: ["wss://relay.damus.io", "wss://relay.snort.social", "wss://nos.lol"],
});

const signed = await signer.signEvent(eventTemplate);
await network.publish(relays, signed);
```

### Reading Relay Lists

```typescript
import {
  getNip65Relays,
  isValidNip65RelayListEvent,
} from "@internet-privacy/marmot-ts";

// Fetch the account's NIP-65 relay list
const events = await fetchEvents(relays, {
  kinds: [10002],
  authors: [targetPubkey],
  limit: 1,
});

if (isValidNip65RelayListEvent(events[0])) {
  const relays = getNip65Relays(events[0], "write"); // write-marked + markerless entries
  // Publish / fetch key packages on these relays only
}
```

> Welcomes are delivered separately, to a recipient's **inbox** relay list
> (kind 10050). Use `getInboxRelays` / `createInboxRelayListEvent` for that set.

## Discovery Flow

1. **Publish Relay List:** User publishes a NIP-65 (kind 10002) relay list
2. **Discover Relays:** Others fetch the account's NIP-65 list
3. **Publish Key Packages:** User publishes kind 30443 to the **write-capable** relays in their NIP-65 list
4. **Fetch Key Packages:** Others fetch from those write-capable relays
5. **Publish Inbox Relays:** User publishes a kind 10050 inbox relay list (`createInboxRelayListEvent`) before expecting Welcomes
6. **Add to Group:** Use key package to create add proposal

## Best Practices

### Relay Selection

- Use a few relays for redundancy
- Update relay list when changing relays
- Relay URLs must be `wss://` or `ws://`, with no userinfo or fragment, and at most 512 bytes ([`transports/nostr.md`](https://github.com/marmot-protocol/marmot/blob/master/transports/nostr.md))

### Key Package Lifecycle

- After successfully joining from a Welcome, publish a replacement KeyPackage in the **same `d` slot** (`client.keyPackages.rotate(ref)`). Don't mint a new slot for routine replacement.
- Delete consumed private `init_key` material. For last-resort KeyPackages, delete it at the earlier of confirmed replacement or `not_after`.
- Never rotate or delete a KeyPackage whose Welcome failed to process: the inviter may retry.
- Lifetimes are capped at 84 days + 1 h (7,261,200 s).

### Privacy Considerations

- Key packages are public (anyone can see)
- Don't include sensitive info in client field
- Rotate key packages periodically

## Related

- [Key Packages](./key-packages) - Generating key packages
- [Protocol](./protocol) - Event kinds and constants
