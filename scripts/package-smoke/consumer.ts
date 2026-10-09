// Type-level consumer contract for @internet-privacy/marmot-ts. Compiled (not run) under
// both nodenext and bundler module resolution to prove the packed tarball's declaration
// files resolve correctly and are not silently degraded to `any`.

import {
  MarmotClient,
  marmotAuthService as rootAuthService,
  type GroupImageProfile as RootImageProfile,
  type GroupImageReadResult as RootImageReadResult,
  type GroupImageMutationResult as RootImageMutationResult,
} from "@internet-privacy/marmot-ts";
import {
  createSimpleGroup,
  marmotAuthService as coreAuthService,
  encodeGroupBlossomImage,
  decodeGroupBlossomImage,
  encryptGroupImage,
  decryptGroupImage,
  getGroupImageSource,
  getGroupImageSnapshotIdentity,
  type GroupBlossomImage,
  type GroupBlossomImagePresent,
  type EncryptedGroupImage,
  type GroupImageSource,
  type GroupImageSnapshotIdentity,
} from "@internet-privacy/marmot-ts/core";
import {
  GroupImageService,
  fetchGroupImageTransport,
  type MarmotGroup,
  type GroupImageProfile,
  type GroupImageContactPolicy,
  type GroupImageTransport,
  type GroupImageTransportRequest,
  type GroupImageTransportResponse,
  type GroupImageReadResult,
  type GroupImageUnavailableReason,
  type GroupImageOperationOptions,
  type GroupImageReplacementResult,
  type GroupImageClearResult,
  type GroupImagePublicationResult,
} from "@internet-privacy/marmot-ts/client";
import {
  encode,
  groupContextEncoder,
  type ClientState,
  type GroupContext,
  type AuthenticationService,
} from "@internet-privacy/marmot-ts/mls";

// Both supported surfaces must expose the actual vendored MLS policy contract.
export const publicAuthServices: AuthenticationService[] = [
  rootAuthService,
  coreAuthService,
];

// @ts-expect-error - The policy must retain its credential/key types, not become `any`.
coreAuthService.validateCredential(42, new Uint8Array());

// @ts-expect-error - The root export must retain the same typed policy contract.
rootAuthService.validateCredential(42, new Uint8Array());

export function encodeGroupContext(gc: GroupContext): Uint8Array {
  return encode(groupContextEncoder, gc);
}

// `/core` and `/mls` must resolve to the exact same vendored ClientState declaration.
// CoreState is derived from `/core`'s createSimpleGroup return type; the two identity
// functions below only type-check if CoreState and ClientState are the same type.
export type CoreState = Awaited<
  ReturnType<typeof createSimpleGroup>
>["clientState"];

export function coreStateToClientState(state: CoreState): ClientState {
  return state;
}

export function clientStateToCoreState(state: ClientState): CoreState {
  return state;
}

// Non-any guards: if any of these types silently degrade to `any` under skipLibCheck,
// assigning a bare number to them stops being an error, the `@ts-expect-error` directive
// above it becomes unused, and tsc fails on "Unused '@ts-expect-error' directive".

// @ts-expect-error - ClientState is not `any`; a number is not assignable to it.
export const clientStateGuard: ClientState = 42;

// @ts-expect-error - GroupContext is not `any`; a number is not assignable to it.
export const groupContextGuard: GroupContext = 42;

// @ts-expect-error - MarmotClient is not `any`; a number is not assignable to it.
export const marmotClientGuard: MarmotClient = 42;

// Realistic image calls use public entries, the same owner and explicit routing.
export const imageContactPolicy: GroupImageContactPolicy = ({ url }) =>
  new URL(url).origin === "https://images.example.com";
export const imageProfile: RootImageProfile & GroupImageProfile = {
  endpoints: ["https://images.example.com"],
  transport: fetchGroupImageTransport,
  contactPolicy: imageContactPolicy,
  maxUploadBytes: 1024 * 1024,
  maxDownloadBytes: 1024 * 1024 + 16,
  maxDiagnosticBytes: 1024,
  maxEndpointCandidates: 4,
  deadlineMs: 30_000,
};

export const imageResolverProfile: GroupImageProfile = {
  async resolveEndpoints(source: GroupImageSource, signal: AbortSignal) {
    if (signal.aborted || source.kind === "none") return [];
    return ["https://images.example.com"];
  },
};

export const imageTransport: GroupImageTransport = async (
  request: GroupImageTransportRequest,
): Promise<GroupImageTransportResponse> => fetchGroupImageTransport(request);

export function imageCodecRoundtrip(bytes: Uint8Array): Uint8Array {
  const encrypted: EncryptedGroupImage = encryptGroupImage(bytes, "image/png");
  const metadata: GroupBlossomImage = decodeGroupBlossomImage(
    encodeGroupBlossomImage(encrypted.metadata),
  );
  if (metadata.kind === "empty") throw new Error("Unexpected empty metadata");
  const present: GroupBlossomImagePresent = metadata;
  const identity: GroupImageSnapshotIdentity =
    getGroupImageSnapshotIdentity(present);
  if (!identity) throw new Error("Missing snapshot identity");
  return decryptGroupImage(encrypted.ciphertext, present);
}

export function sameOwnerImageService(group: MarmotGroup): GroupImageService {
  return new GroupImageService({
    getState: () => group.state,
    isClosed: () => group.closedSignal.aborted,
    maxCacheEntries: 0,
    maxCacheBytes: 0,
    maxActiveReads: 2,
  });
}

export async function readImage(
  group: MarmotGroup,
  signal: AbortSignal,
): Promise<RootImageReadResult & GroupImageReadResult> {
  const source: GroupImageSource = getGroupImageSource(group.state);
  if (source.kind === "none")
    return { kind: "unavailable", reason: "no-image" };
  if (source.kind === "url")
    return { kind: "unavailable", reason: "url-selected" };
  const options: GroupImageOperationOptions = { signal };
  const result = await group.image.read(imageProfile, options);
  if (result.kind === "unavailable") {
    const reason: GroupImageUnavailableReason = result.reason;
    return { kind: "unavailable", reason };
  }
  const current = group.image.source();
  if (
    current.kind !== "blossom" ||
    current.snapshotIdentity !== result.snapshotIdentity
  )
    return { kind: "unavailable", reason: "stale" };
  const bytes: Uint8Array = result.bytes;
  const mediaType: string = result.mediaType;
  return { ...result, bytes, mediaType };
}

export async function replaceAndClearImage(
  client: MarmotClient,
  group: MarmotGroup,
  bytes: Uint8Array,
  signal: AbortSignal,
): Promise<RootImageMutationResult> {
  const replaced: GroupImageReplacementResult =
    await client.groups.replaceGroupImage(
      group.id,
      bytes,
      "image/png",
      imageProfile,
      { signal },
    );
  if (replaced.kind === "published") {
    for (const publication of replaced.publications) {
      const existingResult: GroupImagePublicationResult = publication;
      if (existingResult.retryPublication) return replaced;
    }
  }
  const cleared: GroupImageClearResult = await client.groups.clearGroupImage(
    group.id,
  );
  return cleared;
}

// Non-any guards protect the discriminants, opaque identity and typed profile.
// @ts-expect-error - The profile is not any and does not select a built-in default server.
export const imageProfileGuard: GroupImageProfile = 42;
// @ts-expect-error - Only the stable unavailable union is accepted.
export const imageReasonGuard: GroupImageUnavailableReason = "unknown";
// @ts-expect-error - Read results require bytes, MIME and complete snapshot identity.
export const imageReadGuard: GroupImageReadResult = { kind: "available" };
// @ts-expect-error - The opaque fingerprint cannot be a caller-invented string.
export const imageIdentityGuard: GroupImageSnapshotIdentity = "invented";
