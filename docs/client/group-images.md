# Group images

Use `MarmotGroup.image` to select the current rendering source and retrieve verified encrypted Blossom images. Use `client.groups.replaceGroupImage()` and `client.groups.clearGroupImage()` to change image metadata through the normal MLS publication lifecycle. Image availability is separate from group validity: a missing or refused blob does not clear authenticated metadata or invalidate the group.

## Configure the service

Each read or replacement takes an explicit `GroupImageProfile`. The library chooses no default server and stores no endpoint in MLS metadata. Supply an HTTPS origin that your application trusts:

```typescript
import {
  fetchGroupImageTransport,
  type GroupImageProfile,
} from "@internet-privacy/marmot-ts/client";

const profile: GroupImageProfile = {
  endpoints: ["https://images.example.com"],
  transport: fetchGroupImageTransport,
  contactPolicy: ({ url }) =>
    new URL(url).origin === "https://images.example.com",
  maxUploadBytes: 5 * 1024 * 1024,
  maxDownloadBytes: 5 * 1024 * 1024 + 16,
  deadlineMs: 30_000,
};
```

Alternatively, `resolveEndpoints(source, signal)` asynchronously returns origins; when provided, it replaces `endpoints`. Honor its signal and return a bounded list. Origins must have no path beyond `/`, credentials, query or fragment. HTTP, local/private/non-routable literal hosts, redirects and malformed request paths are refused. Host validation does not pin DNS addresses: your application or injected transport must enforce any DNS or network routing policy it requires.

A `GroupImageTransport` accepts `{ url, method, headers, body?, signal, maxBytes, maxDiagnosticBytes?, deadlineMs }` and returns `{ status, body: Uint8Array, headers? }`. Custom transports must enforce streaming limits and cancellation, return whole ciphertext or descriptor bytes, and preserve the approved authorization and request destination. The standard adapter omits browser credentials, referrer and HTTP caching and rejects redirects. Never forward account credentials in an image request.

### Blossom HTTP profile

Downloads use `GET /<64-lowercase-hex-ciphertext-hash>` with no authorization header. A successful download requires HTTP 200, a bounded whole body, a matching SHA-256 ciphertext hash, then successful ChaCha20-Poly1305 authentication. HTTP 404 maps to `missing-blob`. Other status/response failures never yield plaintext.

Uploads use `PUT /upload` with encrypted bytes and exactly `Content-Type: application/octet-stream`, `X-SHA-256: <ciphertext-hash>` and `Authorization: Nostr <unpadded-base64url-event-json>`. A fresh image-specific Nostr key signs kind 24242, content `Upload Blob`, with ordered `t=upload`, `expiration`, `x=<hash>` and `server=<lowercase-hostname>` tags. The event is created one second before the current second and expires ten minutes later; it is bound to this ciphertext and server. The member's account signer is not used for upload authorization.

HTTP 200 or 201 upload responses must contain valid UTF-8 JSON with matching `sha256`, exact ciphertext `size`, `type: "application/octet-stream"`, a nonnegative safe-integer `uploaded` time, and a same-origin `url` whose path is `/<hash>` with an optional alphanumeric extension. Credentials, query and fragment are forbidden. Upload validation happens before any image commit.

### Resource bounds

| Setting                                             | Default           | Meaning                                                                      |
| --------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------- |
| `maxUploadBytes`                                    | 10 MiB            | Replacement plaintext and decrypted read plaintext ceiling                   |
| `maxDownloadBytes`                                  | 10 MiB + 16 bytes | Whole ciphertext including the AEAD tag                                      |
| `maxDescriptorBytes`                                | 16 KiB            | Upload response body                                                         |
| `maxDiagnosticBytes`                                | 1024 bytes        | Separate error-response body budget                                          |
| `maxEndpointCandidates`                             | 4                 | Endpoint list before normalization/deduplication                             |
| `deadlineMs`                                        | 60,000 ms         | One read/upload budget covering resolver, policy, transport and body reading |
| `maxCacheEntries` (`GroupImageService` constructor) | 16                | Verified plaintext LRU entries                                               |
| `maxCacheBytes` (`GroupImageService` constructor)   | 20 MiB            | Total cached plaintext                                                       |
| `maxActiveReads` (`GroupImageService` constructor)  | 4                 | Concurrent physical reads                                                    |
| `GroupsManagerOptions.maxPendingImageMutations`     | 16                | Active plus queued image mutations per loaded group                          |

Profile limits and active-read/mutation capacities require finite positive safe integers; deadlines cannot exceed 2,147,483,647 ms. Cache constructor capacities permit zero to disable caching. Profile overrides apply per operation. The built-in `group.image` uses the cache/read constructor defaults; those constructor options are available when integrating `GroupImageService` directly with the same canonical owner's `getState` and `isClosed` callbacks and arranging `close()` on owner teardown. They are not profile fields. Mutation capacity is a manager constructor option. Capacity refusal reports `byte-limit` rather than retaining unbounded work.

## Read a group image

`source()` is synchronous and performs no HTTP I/O. Its `GroupImageSource` union is `url`, `blossom` or `none`. A nonempty URL avatar wins and keeps optional `dim` and `thumbhash` render hints. Empty or removed URL metadata permits Blossom fallback. Reading while a URL wins returns `url-selected` without a Blossom download.

```typescript
import type {
  MarmotGroup,
  GroupImageProfile,
} from "@internet-privacy/marmot-ts/client";

async function readCurrentImage(
  group: MarmotGroup,
  profile: GroupImageProfile,
) {
  const source = group.image.source();
  if (source.kind === "url") return source; // Render using your URL policy.
  if (source.kind === "none") return source;

  const controller = new AbortController();
  const result = await group.image.read(profile, { signal: controller.signal });
  if (result.kind === "unavailable") return result;

  // Repeat this check immediately before display, after any additional await.
  const current = group.image.source();
  if (
    current.kind !== "blossom" ||
    current.snapshotIdentity !== result.snapshotIdentity
  ) {
    return { kind: "unavailable", reason: "stale" } as const;
  }
  return result; // Owned Uint8Array bytes, canonical mediaType, snapshotIdentity.
}
```

`available` results contain verified plaintext `bytes`, canonical `mediaType` and an opaque `snapshotIdentity` covering every metadata field, including both keys and nonce. Applications own presentation and object-URL lifetime. Avoid logging or persisting secret metadata, image keys, upload credentials or plaintext by default. URL rendering remains your application's policy; selecting a URL does not verify or download it.

The service rechecks source selection and complete canonical metadata before cache use and delivery. Replacement, clearing, URL takeover or fork rewind can invalidate a pending result. Your own asynchronous work can create a later race, so compare the returned identity with the current descriptor immediately before display.

### Cancellation, sharing and cache scope

Pass `{ signal }` to `read()`, replacement or `clearGroupImage(group.id, { signal })` and call the caller's `AbortController.abort()` when that work is no longer needed. Image mutations honor cancellation while queued and during MLS preparation, including signing and wrapping. Once network publication begins, cancellation cannot retract the commit: the operation returns its publication outcome. Identical reads share physical work only when complete metadata and effective endpoint/resolver outcome, resolver/transport/policy identity, authorization, limits and deadline match. Every caller resolves endpoints and passes current policy before cache/shared admission; policy is checked again before delivery. A restrictive caller cannot borrow another caller's authorized cache entry or request.

Cancelling one waiter returns `cancelled` for that caller and preserves a request needed by other waiters. The final waiter releases the underlying operation and listeners. Successful callers receive independent copies. Only verified/decrypted success is cached, in a dual-bound LRU scoped to that service and compatible caller provenance; there is no default persistence.

`group.image.close()` is idempotent and permanently closes that image service. It aborts owned reads and uploads, releases queued image changes, listeners and timers, wipes owned plaintext buffers, and prevents late image delivery and publication of image work still being prepared. Closing only the image service leaves ordinary group operations usable. Group unload, destruction and terminal teardown use the same release seam. Independently copied results and caller input remain the caller's responsibility. A newly loaded group instance has a new service; stale work cannot attach to it.

## Replace a group image

An active member who is currently an admin can replace the image. Peers must support the image component. Supply a `Uint8Array` and declared MIME; the library canonicalizes an image-only MIME, but does not decode, resize or otherwise edit image content.

```typescript
import type {
  MarmotClient,
  GroupImageProfile,
} from "@internet-privacy/marmot-ts";

async function replaceImage(
  client: MarmotClient,
  groupId: Uint8Array,
  bytes: Uint8Array,
  profile: GroupImageProfile,
  signal: AbortSignal,
) {
  const result = await client.groups.replaceGroupImage(
    groupId,
    bytes,
    "image/png",
    profile,
    { signal },
  );
  if (result.kind === "unavailable") return result;
  for (const publication of result.publications) {
    // Existing GroupPublishResult: inspect response, persistence,
    // welcomeDelivery, notifications and retryPublication.
    if (publication.retryPublication) {
      return publication; // Follow the existing publication retry workflow.
    }
  }
  return result;
}
```

Replacement creates independent fresh content key, nonce and upload key, uploads encrypted bytes, validates the descriptor, then submits a full metadata replacement through the existing manager/session/runtime publish-and-confirm path. Local replacements and clears share one bounded per-loaded-group FIFO. Membership, admin authority, profile support, lifecycle, loaded ownership and exact canonical parent are checked before upload, after asynchronous work and during actual MLS preparation. A changed parent refuses a stale candidate; unloading does not redirect it to a later instance.

The `published` discriminant wraps existing `GroupPublishResult[]`; it is not a new guarantee that every publication confirmed or persisted. Inspect the actual relay `response`, `retryPublication`, `persistence` and `welcomeDelivery`. Confirmed work with failed persistence must not be republished (`retryPublication: false`). Read the current descriptor to determine canonical selection, particularly when a URL avatar still wins.

Upload completion does not confirm the replacement. Follow the existing MLS publish and confirmation result before treating it as current.

The replacement was not uploaded. The current group image is unchanged; check the service and retry. This recovery copy applies to failed upload results. Invalid upload responses also produce no image commit. If upload succeeds but preparation/authorization/publication subsequently refuses the operation, an orphan blob can remain; the library performs no cleanup deletion. Authorization, unsupported-profile, lifecycle and preparation errors can reject the operation's promise rather than return asset unavailability. Catch those errors separately:

Only an active group admin can change the Blossom image. Recheck current membership and admin state before retrying.

Direct image-changing session/facade commits require `expectedParent: group.session.parentToken`, captured before any asynchronous preparation. The manager replacement helper captures and checks this token for you. Candidate-parent authorization also applies to standalone proposals, referenced authors, committers, clears and component removal on inbound and recovery paths.

## Clear the Blossom image

```typescript
const result = await client.groups.clearGroupImage(group.id);
if (result.kind === "published") {
  // Inspect result.publications through the existing confirmation workflow.
  const current = group.image.source(); // URL avatar or none after confirmation.
}
```

Clearing removes the Blossom image metadata from canonical group state. It keeps any URL avatar and does not delete the remote blob or revoke shared upload credentials.

Clear writes the canonical all-empty image state, with the same active-admin and publication rules as replacement. It needs no endpoint and performs no remote DELETE. If a URL avatar remains, it still wins.

The image upload secret is distributed in encrypted group metadata to group members. A member who learned it retains that credential after removal, replacement or clear. Image-specific keys avoid exposing the member's account identity; they do not revoke a disclosed upload credential or guarantee server-side access revocation. Remote retention/deletion and credential policy belong to your configured service/application.

## No group image is configured

The rendering source is none. An active admin can configure a URL avatar or replace the Blossom image.

This is a `none` descriptor, not an unavailable blob. A failed asset request leaves valid metadata intact.

## Unavailable results and recovery

`GroupImageUnavailableReason` is the stable machine-readable union below. Applications may localize this guide copy.

| Reason                          | Recovery meaning                                                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `no-image`                      | The rendering source is none. An active admin can configure a URL avatar or replace the Blossom image.                              |
| `url-selected`                  | A URL avatar wins. Render the current URL descriptor under your application's URL policy.                                           |
| `endpoint-absent`               | No image endpoint is configured. Supply an endpoint or resolver before retrying.                                                    |
| `missing-blob`, `transport`     | The group image could not be downloaded. Check the configured service and retry the current snapshot.                               |
| `contact-denied`, `byte-limit`  | The image request exceeds local resource or contact policy. Review the configured limits and allowed endpoints before retrying.     |
| `deadline`                      | The image request exceeded its time budget. Check the service or configured deadline and retry the current snapshot.                |
| `invalid-response`              | The configured service returned a response outside this profile. Discard it, check the service and retry the current snapshot.      |
| `hash-mismatch`, `aead-failure` | The downloaded image failed verification. Discard the response and retrieve the current snapshot from a trusted configured service. |
| `stale`                         | The group image changed while it was loading. Read the current rendering source and request that snapshot.                          |
| `cancelled`                     | The image request was cancelled. Start a new request if the image is still needed.                                                  |
| `closed`                        | The owning image service is closed. Obtain the current loaded group instance before requesting its image.                           |

## Pure helpers and public entrypoints

Root and `/core` export `encodeGroupBlossomImage`, `decodeGroupBlossomImage`, `canonicalizeGroupImageMediaType`, `buildGroupImageAad`, `encryptGroupImage`, `decryptGroupImage`, `getGroupImageSource`, `getGroupImageSnapshotIdentity` and their metadata/source types. The strict `0x8002` codec accepts complete present metadata or the five-empty-field clear state and rejects partial, malformed, noncanonical or trailing data. New KeyPackages advertise support; malformed wire components are protocol-invalid, unlike an unavailable blob with valid metadata.

Root and `/client` export `GroupImageService`, `fetchGroupImageTransport`, profile, transport, read/mutation/operation types, `GroupImageSource`, `GroupImageSnapshotIdentity` and `GroupImagePublicationResult` (the existing publication contract). Import public entries, never `dist/` paths. See the topic-based [group Blossom image specification](https://github.com/marmot-protocol/marmot/blob/master/app-components/group-blossom-image-v1.md) for image wire/AAD rules.
