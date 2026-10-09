import type { NostrEvent } from "applesauce-core/helpers/event";
import {
  appDataUpdateProposalType,
  appDataDictionaryExtensionType,
  createCommit,
  createProposal,
  defaultCryptoProvider,
  defaultProposalTypes,
  getCiphersuiteImpl,
  getAppDataDictionary,
  makeAppDataDictionaryExtension,
  joinGroup,
  type CiphersuiteImpl,
  type Proposal,
  type ClientState,
  unsafeTestingAuthenticationService,
} from "ts-mls";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { testAccount } from "../../__tests__/helpers/test-accounts.js";
import { serializeClientState } from "../../core/client-state.js";
import { encodeGroupBlossomImage } from "../../core/components/blossom-image.js";
import { GROUP_BLOSSOM_IMAGE_COMPONENT_ID } from "../../core/components/ids.js";
import { createCredential } from "../../core/credential.js";
import { createSimpleGroup } from "../../core/group.js";
import {
  createGroupEvent,
  decryptGroupMessages,
} from "../../core/group-message.js";
import { generateKeyPackage } from "../../core/key-package.js";
import {
  createAdminCommitPolicyCallback,
  validatePreApplyProposals,
} from "../admin-policy.js";
import { validateCommitLegality } from "../../core/components/integrity.js";
import {
  validateGroupImageLegality,
  validateGroupImageProposals,
} from "../../core/components/image-validation.js";
import { encodeAdminPolicyV1 } from "../../core/components/admin-policy.js";
import { GROUP_ADMIN_POLICY_COMPONENT_ID } from "../../core/components/ids.js";
import {
  APP_COMPONENTS_COMPONENT_ID,
  ACCOUNT_IDENTITY_PROOF_COMPONENT_ID,
  GROUP_LIFECYCLE_COMPONENT_ID,
  SAFE_AAD_COMPONENT_ID,
} from "../../core/components/ids.js";
import { encodeComponentsList } from "../../core/components/app-components-list.js";
import { getAppComponents } from "../../core/components/dictionary.js";
import { CommitLegalityError, MarmotGroupEngine } from "../group-engine.js";
import type { GroupPeeler } from "../types.js";

function imageProposal(
  operation: "update" | "clear" | "remove" = "update",
): Proposal {
  return {
    proposalType: appDataUpdateProposalType,
    appDataUpdate:
      operation === "remove"
        ? { componentId: GROUP_BLOSSOM_IMAGE_COMPONENT_ID, operation: "remove" }
        : {
            componentId: GROUP_BLOSSOM_IMAGE_COMPONENT_ID,
            operation: "update",
            update: encodeGroupBlossomImage(
              operation === "clear"
                ? { kind: "empty" }
                : {
                    kind: "present",
                    imageHash: new Uint8Array(32).fill(1),
                    imageKey: new Uint8Array(32).fill(2),
                    imageNonce: new Uint8Array(12).fill(3),
                    imageUploadKey: new Uint8Array(32).fill(4),
                    mediaType: "image/png",
                  },
            ),
          },
  };
}

function peeler(ciphersuite: CiphersuiteImpl): GroupPeeler<NostrEvent> {
  return {
    async peelGroupMessages(envelopes, state) {
      const { read, unreadable } = await decryptGroupMessages(
        envelopes,
        state,
        ciphersuite,
      );
      return {
        read: read.map(({ event, message }) => ({ envelope: event, message })),
        unreadable,
      };
    },
    wrapGroupMessage: (message, state) =>
      createGroupEvent({ message, state, ciphersuite }),
    idOf: (event) => event.id,
  };
}

function withComponent(
  state: ClientState,
  id: number,
  data: Uint8Array | undefined,
): ClientState {
  const dictionary = getAppDataDictionary(state.groupContext.extensions)!;
  return {
    ...state,
    groupContext: {
      ...state.groupContext,
      extensions: state.groupContext.extensions.map((extension) =>
        extension.extensionType === appDataDictionaryExtensionType
          ? makeAppDataDictionaryExtension(
              [
                ...dictionary.filter((entry) => entry.componentId !== id),
                ...(data === undefined ? [] : [{ componentId: id, data }]),
              ].sort((a, b) => a.componentId - b.componentId),
            )
          : extension,
      ),
    },
  };
}

async function fixture() {
  const admin = testAccount(6),
    member = testAccount(9);
  const impl = await getCiphersuiteImpl(
    "MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519",
    defaultCryptoProvider,
  );
  const ctx = {
    cipherSuite: impl,
    authService: unsafeTestingAuthenticationService,
  };
  const makeKp = (account: typeof admin) =>
    generateKeyPackage({
      credential: createCredential(account.pubkey),
      signer: account.signer,
      ciphersuiteImpl: impl,
    });
  const adminKp = await makeKp(admin),
    memberKp = await makeKp(member);
  const { clientState } = await createSimpleGroup(adminKp, impl, "Images", {
    relays: ["wss://relay.test"],
  });
  const image = imageProposal();
  if (!("appDataUpdate" in image) || image.appDataUpdate.operation !== "update")
    throw new Error("expected image update");
  const imageData = image.appDataUpdate.update;
  const dictionary = getAppDataDictionary(clientState.groupContext.extensions)!;
  clientState.groupContext.extensions = clientState.groupContext.extensions.map(
    (extension) =>
      extension.extensionType === appDataDictionaryExtensionType
        ? makeAppDataDictionaryExtension(
            [
              ...dictionary,
              {
                componentId: GROUP_BLOSSOM_IMAGE_COMPONENT_ID,
                data: imageData,
              },
            ].sort((a, b) => a.componentId - b.componentId),
          )
        : extension,
  );
  const added = await createCommit({
    context: ctx,
    state: clientState,
    extraProposals: [
      {
        proposalType: defaultProposalTypes.add,
        add: { keyPackage: memberKp.publicPackage },
      },
    ],
    ratchetTreeExtension: true,
  });
  const memberState = await joinGroup({
    context: ctx,
    welcome: added.welcome!.welcome!,
    keyPackage: memberKp.publicPackage,
    privateKeys: memberKp.privatePackage,
    ratchetTree: undefined,
  });
  return { impl, ctx, admin, member, adminState: added.newState, memberState };
}

describe("candidate-parent image authorization", () => {
  let f: Awaited<ReturnType<typeof fixture>>;
  beforeAll(async () => {
    f = await fixture();
  });

  function requiredImageParent() {
    return withComponent(
      f.adminState,
      APP_COMPONENTS_COMPONENT_ID,
      encodeComponentsList([
        ...getAppComponents(f.adminState.groupContext.extensions)!,
        GROUP_BLOSSOM_IMAGE_COMPONENT_ID,
      ]),
    );
  }
  function unrequireImage(): Proposal {
    return {
      proposalType: appDataUpdateProposalType,
      appDataUpdate: {
        componentId: APP_COMPONENTS_COMPONENT_ID,
        operation: "update",
        update: encodeComponentsList(
          getAppComponents(f.adminState.groupContext.extensions)!,
        ),
      },
    };
  }
  it("accepts atomic image unrequire and removal against the resulting list", () => {
    const parentState = requiredImageParent();
    const update = unrequireImage();
    if (
      !("appDataUpdate" in update) ||
      update.appDataUpdate.operation !== "update"
    )
      throw new Error("expected list update");
    const resultingState = withComponent(
      withComponent(
        parentState,
        APP_COMPONENTS_COMPONENT_ID,
        update.appDataUpdate.update,
      ),
      GROUP_BLOSSOM_IMAGE_COMPONENT_ID,
      undefined,
    );
    expect(
      validateCommitLegality({
        parentState,
        resultingState,
        proposals: [update, imageProposal("remove")],
        committerLeafIndex: Number(parentState.privatePath.leafIndex),
      }).kind,
    ).toBe("legal");
  });

  it("prepares an authorized atomic removal through actual MLS send", async () => {
    const state = requiredImageParent();
    const engine = new MarmotGroupEngine({
      state,
      ciphersuite: f.impl,
      peeler: peeler(f.impl),
    });
    const result = await engine.send({
      kind: "commit",
      actorPubkey: f.admin.pubkey,
      extraProposals: [unrequireImage(), imageProposal("remove")],
    });
    expect(result.kind).toBe("groupEvolution");
    if (result.kind !== "groupEvolution" || result.pending.kind !== "commit")
      throw new Error("expected staged commit");
    expect(
      getAppDataDictionary(
        result.pending.newState.groupContext.extensions,
      )?.some(
        (entry) => entry.componentId === GROUP_BLOSSOM_IMAGE_COMPONENT_ID,
      ),
    ).toBe(false);
    expect(
      getAppComponents(result.pending.newState.groupContext.extensions),
    ).not.toContain(GROUP_BLOSSOM_IMAGE_COMPONENT_ID);
    // Preparation remains a candidate; canonical image survives until confirm.
    expect(
      getAppDataDictionary(engine.state.groupContext.extensions)?.some(
        (entry) => entry.componentId === GROUP_BLOSSOM_IMAGE_COMPONENT_ID,
      ),
    ).toBe(true);
  });
  it("rejects image removal while still required and accepts canonical empty clear", () => {
    const parentState = requiredImageParent();
    for (const operation of ["remove", "clear"] as const) {
      const proposal = imageProposal(operation);
      if (!("appDataUpdate" in proposal))
        throw new Error("expected image proposal");
      const data =
        proposal.appDataUpdate.operation === "update"
          ? proposal.appDataUpdate.update
          : undefined;
      expect(
        validateCommitLegality({
          parentState,
          resultingState: withComponent(
            parentState,
            GROUP_BLOSSOM_IMAGE_COMPONENT_ID,
            data,
          ),
          proposals: [proposal],
          committerLeafIndex: Number(parentState.privatePath.leafIndex),
        }).kind,
      ).toBe(operation === "clear" ? "legal" : "violation");
    }
  });
  it.each([
    APP_COMPONENTS_COMPONENT_ID,
    SAFE_AAD_COMPONENT_ID,
    GROUP_LIFECYCLE_COMPONENT_ID,
    ACCOUNT_IDENTITY_PROOF_COMPONENT_ID,
  ])("keeps structural and leaf-only removal protected for %s", (id) => {
    const proposal: Proposal = {
      proposalType: appDataUpdateProposalType,
      appDataUpdate: { componentId: id, operation: "remove" },
    };
    expect(
      validatePreApplyProposals([unrequireImage(), proposal], f.impl.id),
    ).toBeDefined();
    expect(
      validateCommitLegality({
        parentState: f.adminState,
        resultingState: withComponent(f.adminState, id, undefined),
        proposals: [proposal],
        committerLeafIndex: Number(f.adminState.privatePath.leafIndex),
      }).kind,
    ).toBe("violation");
  });
  it("preserves the required account-proof profile when updating app_components", () => {
    const bytes = encodeComponentsList(
      getAppComponents(f.adminState.groupContext.extensions)!.filter(
        (id) => id !== ACCOUNT_IDENTITY_PROOF_COMPONENT_ID,
      ),
    );
    const proposal: Proposal = {
      proposalType: appDataUpdateProposalType,
      appDataUpdate: {
        componentId: APP_COMPONENTS_COMPONENT_ID,
        operation: "update",
        update: bytes,
      },
    };
    expect(
      validateCommitLegality({
        parentState: f.adminState,
        resultingState: withComponent(
          f.adminState,
          APP_COMPONENTS_COMPONENT_ID,
          bytes,
        ),
        proposals: [proposal],
        committerLeafIndex: Number(f.adminState.privatePath.leafIndex),
      }).kind,
    ).toBe("violation");
  });

  it("couples known image support to strict present and empty payload admission", () => {
    for (const operation of ["update", "clear"] as const)
      expect(
        validatePreApplyProposals([imageProposal(operation)], f.impl.id),
      ).toBeUndefined();
    for (const bytes of [
      new Uint8Array(),
      new Uint8Array([1]),
      new Uint8Array([0, 0, 0, 0, 0, 0]),
    ]) {
      const proposal: Proposal = {
        proposalType: appDataUpdateProposalType,
        appDataUpdate: {
          componentId: GROUP_BLOSSOM_IMAGE_COMPONENT_ID,
          operation: "update",
          update: bytes,
        },
      };
      expect(validatePreApplyProposals([proposal], f.impl.id)?.reason).toBe(
        "component-integrity",
      );
    }
    expect(
      validatePreApplyProposals(
        [
          {
            proposalType: appDataUpdateProposalType,
            appDataUpdate: {
              componentId: 0xeeee,
              operation: "update",
              update: new Uint8Array([1]),
            },
          },
        ],
        f.impl.id,
      ),
    ).toBeUndefined();
  });

  it("rejects malformed carried image bytes when proposal attribution is unavailable", () => {
    const malformed = withComponent(
      f.adminState,
      GROUP_BLOSSOM_IMAGE_COMPONENT_ID,
      new Uint8Array([1]),
    );
    expect(
      validateCommitLegality({
        parentState: malformed,
        resultingState: malformed,
        proposals: [],
      }).kind,
    ).toBe("violation");
  });

  it.each(["update", "clear", "remove"] as const)(
    "keeps %s proposal authors distinct from admin committers",
    (operation) => {
      const adminIndex = Number(f.adminState.privatePath.leafIndex);
      const memberIndex = Number(f.memberState.privatePath.leafIndex);
      for (const senderLeafIndex of [memberIndex, undefined, 1000]) {
        const outcome = validateGroupImageLegality({
          parentState: f.adminState,
          proposals: [{ proposal: imageProposal(operation), senderLeafIndex }],
          committerLeafIndex: adminIndex,
        });
        expect(outcome.kind).toBe(
          senderLeafIndex === undefined ? "undecidable" : "violation",
        );
      }
      expect(
        validateGroupImageLegality({
          parentState: f.adminState,
          proposals: [imageProposal(operation)],
          committerLeafIndex: adminIndex,
        }).kind,
      ).toBe("legal");
    },
  );

  it("prioritizes malformed payloads and definite unauthorized actors over absent attribution", () => {
    const unknown = { proposal: imageProposal(), senderLeafIndex: undefined };
    const member = {
      proposal: imageProposal("clear"),
      senderLeafIndex: Number(f.memberState.privatePath.leafIndex),
    };
    const adminIndex = Number(f.adminState.privatePath.leafIndex);
    expect(
      validateGroupImageLegality({
        parentState: f.adminState,
        proposals: [unknown, member],
        committerLeafIndex: adminIndex,
      }).kind,
    ).toBe("violation");
    expect(
      validateGroupImageLegality({
        parentState: f.adminState,
        proposals: [unknown],
        committerLeafIndex: Number(f.memberState.privatePath.leafIndex),
      }).kind,
    ).toBe("violation");
    const bad = imageProposal();
    if (!("appDataUpdate" in bad) || bad.appDataUpdate.operation !== "update")
      throw new Error("expected image");
    bad.appDataUpdate.update = new Uint8Array([1]);
    expect(
      validateGroupImageLegality({
        parentState: f.adminState,
        proposals: [unknown, { proposal: bad, senderLeafIndex: undefined }],
      }).kind,
    ).toBe("violation");
  });

  it("preserves shared undecidable attribution while definite coupling violations outrank it", () => {
    const proposal = { proposal: imageProposal(), senderLeafIndex: undefined };
    const committerLeafIndex = Number(f.adminState.privatePath.leafIndex);
    expect(
      validateCommitLegality({
        parentState: f.adminState,
        resultingState: f.adminState,
        proposals: [proposal],
        committerLeafIndex,
      }).kind,
    ).toBe("undecidable");
    const orphanedAdmins = encodeAdminPolicyV1([testAccount(0).pubkey]);
    const resultingState = withComponent(
      f.adminState,
      GROUP_ADMIN_POLICY_COMPONENT_ID,
      orphanedAdmins,
    );
    const policy: Proposal = {
      proposalType: appDataUpdateProposalType,
      appDataUpdate: {
        componentId: GROUP_ADMIN_POLICY_COMPONENT_ID,
        operation: "update",
        update: orphanedAdmins,
      },
    };
    const outcome = validateCommitLegality({
      parentState: f.adminState,
      resultingState,
      proposals: [
        proposal,
        { proposal: policy, senderLeafIndex: committerLeafIndex },
      ],
      committerLeafIndex,
    });
    expect(outcome.kind).toBe("violation");
    if (outcome.kind === "violation")
      expect(outcome.violation.reason).toBe("admin-leaf-coupling");
  });

  it("uses parent authority through promotion and demotion", () => {
    const adminIndex = Number(f.adminState.privatePath.leafIndex),
      memberIndex = Number(f.memberState.privatePath.leafIndex);
    const promoted = encodeAdminPolicyV1([f.admin.pubkey, f.member.pubkey]);
    const policyProposal: Proposal = {
      proposalType: appDataUpdateProposalType,
      appDataUpdate: {
        componentId: GROUP_ADMIN_POLICY_COMPONENT_ID,
        operation: "update",
        update: promoted,
      },
    };
    const resulting = withComponent(
      f.adminState,
      GROUP_ADMIN_POLICY_COMPONENT_ID,
      promoted,
    );
    expect(
      validateCommitLegality({
        parentState: f.adminState,
        resultingState: resulting,
        proposals: [
          { proposal: policyProposal, senderLeafIndex: adminIndex },
          { proposal: imageProposal(), senderLeafIndex: memberIndex },
        ],
        committerLeafIndex: memberIndex,
      }).kind,
    ).toBe("violation");
    const demoted = withComponent(
      f.adminState,
      GROUP_ADMIN_POLICY_COMPONENT_ID,
      encodeAdminPolicyV1([f.member.pubkey]),
    );
    const imageArgs = {
      parentState: f.adminState,
      resultingState: demoted,
      proposals: [imageProposal()],
      committerLeafIndex: adminIndex,
    };
    expect(validateGroupImageLegality(imageArgs).kind).toBe("legal");
  });

  it("rejects removed, invalid and unknown standalone actors even if the admin set names them", () => {
    const adminIndex = Number(f.adminState.privatePath.leafIndex);
    const tree = f.adminState.ratchetTree.slice();
    tree[adminIndex * 2] = undefined;
    for (const index of [adminIndex, -1, 0.5, Number.NaN, 1000, undefined]) {
      const callback = createAdminCommitPolicyCallback({
        ratchetTree: tree,
        adminPubkeys: [f.admin.pubkey],
        ciphersuiteId: f.impl.id,
      });
      expect(
        callback({
          kind: "proposal",
          proposal: { proposal: imageProposal(), senderLeafIndex: index },
        }),
      ).toBe("reject");
    }
    expect(
      validateGroupImageProposals({
        ratchetTree: tree,
        adminPubkeys: [f.admin.pubkey],
        proposals: [{ proposal: imageProposal(), senderLeafIndex: adminIndex }],
      }).kind,
    ).toBe("violation");
  });

  it("refuses staged member references locally without pruning, wrapping or lifecycle changes", async () => {
    const proposal = {
      proposal: imageProposal(),
      senderLeafIndex: Number(f.memberState.privatePath.leafIndex),
    };
    const state = {
      ...f.adminState,
      unappliedProposals: { badReference: proposal },
    };
    const transport = peeler(f.impl),
      wrap = vi.spyOn(transport, "wrapGroupMessage");
    const engine = new MarmotGroupEngine({
      state,
      ciphersuite: f.impl,
      peeler: transport,
    });
    const before = serializeClientState(engine.state);
    await expect(
      engine.send({
        kind: "commit",
        actorPubkey: f.admin.pubkey,
        proposalRefs: ["badReference"],
      }),
    ).rejects.toBeInstanceOf(CommitLegalityError);
    expect(serializeClientState(engine.state)).toEqual(before);
    expect(engine.state.unappliedProposals.badReference).toBe(proposal);
    expect(engine.lifecycle).toBe("Stable");
    expect(wrap).not.toHaveBeenCalled();
  });

  it.each(["update", "clear", "remove"] as const)(
    "rejects member %s commits on local and authenticated inbound seams",
    async (operation) => {
      const transport = peeler(f.impl),
        wrap = vi.spyOn(transport, "wrapGroupMessage");
      const sender = new MarmotGroupEngine({
        state: f.memberState,
        ciphersuite: f.impl,
        peeler: transport,
      });
      const before = serializeClientState(sender.state);
      await expect(
        sender.send({
          kind: "commit",
          actorPubkey: f.admin.pubkey,
          extraProposals: [imageProposal(operation)],
        }),
      ).rejects.toBeInstanceOf(CommitLegalityError);
      expect(serializeClientState(sender.state)).toEqual(before);
      expect(sender.lifecycle).toBe("Stable");
      expect(wrap).not.toHaveBeenCalled();
      // Build authenticated MLS input directly to exercise inbound enforcement.
      const raw = await createCommit({
        context: f.ctx,
        state: f.memberState,
        extraProposals: [imageProposal(operation)],
        wireAsPublicMessage: true,
      });
      const event = await createGroupEvent({
        message: raw.commit,
        state: f.memberState,
        ciphersuite: f.impl,
      });
      const receiver = new MarmotGroupEngine({
        state: f.adminState,
        ciphersuite: f.impl,
        peeler: peeler(f.impl),
      });
      const receiverBefore = serializeClientState(receiver.state);
      const results = [];
      for await (const result of receiver.ingest([event])) results.push(result);
      expect(results.some((result) => result.kind === "rejected")).toBe(true);
      expect(serializeClientState(receiver.state)).toEqual(receiverBefore);
      expect(receiver.lifecycle).toBe("Stable");
    },
  );

  it("admits authenticated admin standalone proposals and rejects an admin's laundering of a member reference inbound", async () => {
    const adminProposal = await createProposal({
      context: { ...f.ctx, externalPsks: {} },
      state: f.adminState,
      proposal: imageProposal(),
      wireAsPublicMessage: true,
    });
    const adminEvent = await createGroupEvent({
      message: adminProposal.message,
      state: f.adminState,
      ciphersuite: f.impl,
    });
    const receiver = new MarmotGroupEngine({
      state: f.memberState,
      ciphersuite: f.impl,
      peeler: peeler(f.impl),
    });
    for await (const _result of receiver.ingest([adminEvent])) {
      /* drain admission */
    }
    expect(Object.keys(receiver.state.unappliedProposals)).toHaveLength(1);

    const memberProposal = await createProposal({
      context: { ...f.ctx, externalPsks: {} },
      state: f.memberState,
      proposal: imageProposal(),
      wireAsPublicMessage: true,
    });
    const references = memberProposal.newState.unappliedProposals;
    expect(Object.values(references)[0]?.senderLeafIndex).toBe(
      Number(f.memberState.privatePath.leafIndex),
    );
    const stagedAdmin = { ...f.adminState, unappliedProposals: references };
    const stagedMember = { ...f.memberState, unappliedProposals: references };
    const raw = await createCommit({
      context: f.ctx,
      state: stagedAdmin,
      wireAsPublicMessage: true,
    });
    const event = await createGroupEvent({
      message: raw.commit,
      state: stagedAdmin,
      ciphersuite: f.impl,
    });
    const target = new MarmotGroupEngine({
      state: stagedMember,
      ciphersuite: f.impl,
      peeler: peeler(f.impl),
    });
    const before = serializeClientState(target.state);
    const results = [];
    for await (const result of target.ingest([event])) results.push(result);
    expect(results.some((result) => result.kind === "rejected")).toBe(true);
    expect(serializeClientState(target.state)).toEqual(before);
    expect(target.lifecycle).toBe("Stable");
  });

  it("rejects a member standalone image proposal before staging", () => {
    const callback = createAdminCommitPolicyCallback({
      ratchetTree: f.adminState.ratchetTree,
      adminPubkeys: [f.admin.pubkey],
      ciphersuiteId: f.impl.id,
    });
    expect(
      callback({
        kind: "proposal",
        proposal: {
          proposal: imageProposal(),
          senderLeafIndex: Number(f.memberState.privatePath.leafIndex),
        },
      }),
    ).toBe("reject");
  });

  it.each(["update", "clear", "remove"] as const)(
    "admits admin %s locally and inbound",
    async (operation) => {
      const sender = new MarmotGroupEngine({
        state: f.adminState,
        ciphersuite: f.impl,
        peeler: peeler(f.impl),
      });
      const receiver = new MarmotGroupEngine({
        state: f.memberState,
        ciphersuite: f.impl,
        peeler: peeler(f.impl),
      });
      const sent = await sender.send({
        kind: "commit",
        actorPubkey: f.admin.pubkey,
        extraProposals: [imageProposal(operation)],
      });
      expect(sent.kind).toBe("groupEvolution");
      if (sent.kind !== "groupEvolution")
        throw new Error("expected group evolution");
      const results = [];
      for await (const result of receiver.ingest([sent.envelope]))
        results.push(result);
      expect(results.some((result) => result.kind === "processed")).toBe(true);
    },
  );

  it.each(["update", "clear", "remove"] as const)(
    "refuses local member standalone %s without wrapping or state changes",
    async (operation) => {
      const transport = peeler(f.impl),
        wrap = vi.spyOn(transport, "wrapGroupMessage");
      const engine = new MarmotGroupEngine({
        state: f.memberState,
        ciphersuite: f.impl,
        peeler: transport,
      });
      const before = serializeClientState(engine.state);
      await expect(
        engine.send({ kind: "proposal", proposal: imageProposal(operation) }),
      ).rejects.toBeInstanceOf(CommitLegalityError);
      expect(serializeClientState(engine.state)).toEqual(before);
      expect(wrap).not.toHaveBeenCalled();
    },
  );

  it("rejects an authenticated inbound member proposal without queuing it", async () => {
    const created = await createProposal({
      context: { ...f.ctx, externalPsks: {} },
      state: f.memberState,
      proposal: imageProposal(),
      wireAsPublicMessage: true,
    });
    const event = await createGroupEvent({
      message: created.message,
      state: f.memberState,
      ciphersuite: f.impl,
    });
    const receiver = new MarmotGroupEngine({
      state: f.adminState,
      ciphersuite: f.impl,
      peeler: peeler(f.impl),
    });
    const before = serializeClientState(receiver.state);
    for await (const _result of receiver.ingest([event])) {
      /* drain admission */
    }
    expect(serializeClientState(receiver.state)).toEqual(before);
    expect(Object.keys(receiver.state.unappliedProposals)).toHaveLength(0);
  });
});
