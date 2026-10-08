# Proposals

Group changes — adding members, removing members, updating metadata, leaving — are expressed as MLS **proposals** that an admin gathers into a **commit**. The `Proposals` namespace provides type-safe builders for the common Marmot operations.

```typescript
import { Proposals } from "@internet-privacy/marmot-ts";
```

Each builder returns a `ProposalAction`, an async function `(context) => Proposal | Proposal[]` that is resolved against the current group state. How you pass it to `client.groups.commit(...)` depends on what it returns:

- A builder that returns a **single** proposal (`proposeInviteUser`) can go straight into `extraProposals`; the session resolves it when the commit is built.
- Builders that return an **array** (`proposeRemoveUser`, `proposeUpdateMetadata`, `proposeLeaveGroup`) must be resolved first with `group.session.proposalContext()`. Pass the resulting proposals to `extraProposals`. Passing the action itself does not type-check, because `extraProposals` only accepts actions that return one proposal.

## Inviting users

`proposeInviteUser` builds an Add proposal from a key package event (or a raw `KeyPackage`). The invitee's LeafNode must carry a valid `marmot.member.account-identity-proof.v2` (`0x8009`) proof, validated with its own ciphersuite — the builder throws `AccountIdentityProofError` if it is missing, invalid, or the legacy extension.

For a single invite, the `client.groups.invite` shortcut handles the commit and Welcome delivery for you:

```typescript
await client.groups.invite(group.id, keyPackageEvent);
```

To add several key packages (e.g. multiple devices) in one commit, build one invite intent per KeyPackage with `createInviteIntent` and merge them. Each intent carries the Add proposal and the `welcomeRecipients` entry for its invitee:

```typescript
import { createInviteIntent } from "@internet-privacy/marmot-ts/client";

const actorPubkey = await client.signer.getPublicKey();
const intents = [keyPackageEventA, keyPackageEventB].map((keyPackageEvent) =>
  createInviteIntent({ keyPackageEvent, actorPubkey }),
);

await client.groups.commit(group.id, {
  extraProposals: intents.flatMap((intent) => intent.extraProposals ?? []),
  welcomeRecipients: intents.flatMap(
    (intent) => intent.welcomeRecipients ?? [],
  ),
});
```

`createInviteIntent` (which `client.groups.invite` also uses) checks the KeyPackage event before trusting it: the event signature, the `d` / `i` / `mls_protocol_version` tags, the Lifetime, that the credential identity matches the event author, and that the `mls_proposals` tag matches the leaf. `Proposals.proposeInviteUser(event)` only checks the account identity proof, so prefer `createInviteIntent` for KeyPackage events fetched from relays.

## Removing users

`proposeRemoveUser(pubkey)` removes **all** leaf nodes (devices) belonging to a Nostr user. It throws if the user is not a member.

```typescript
// One Remove per leaf: resolve against the current state, then commit them all
const removals = await Proposals.proposeRemoveUser(memberPubkey)(
  group.session.proposalContext(),
);
await client.groups.commit(group.id, { extraProposals: removals });
```

## Updating metadata

`proposeUpdateMetadata(fields)` produces one `app_data_update` proposal per app component you touch. Each proposal fully replaces that component, with unchanged fields copied from the current group view. All fields are optional; only the components whose fields you set are updated. Supported fields map onto the group's app components (the builder also accepts `nostrGroupId` and `encryptedMedia`):

```typescript
const updates = await Proposals.proposeUpdateMetadata({
  name: "Engineering",
  description: "Secure team chat",
  adminPubkeys: [alice, bob],
  relays: ["wss://relay.example.com"],
  avatarUrl: "https://example.com/avatar.png",
  messageRetention: 0, // seconds; 0 = disappearing messages disabled
})(group.session.proposalContext());

await client.groups.commit(group.id, { extraProposals: updates });
```

You can combine it with other proposals in the same commit — for example, removing a member and shrinking the admin set at once:

```typescript
const context = group.session.proposalContext();
const removals = await Proposals.proposeRemoveUser(memberPubkey)(context);
const adminUpdate = await Proposals.proposeUpdateMetadata({
  adminPubkeys: remainingAdmins,
})(context);

await client.groups.commit(group.id, {
  extraProposals: [...removals, ...adminUpdate],
});
```

## Leaving a group

A member leaves with an MLS `self_remove` proposal. Because RFC 9420 forbids a committer from removing their own leaf, the proposal is committed by **another** member (the deterministically-elected auto-committer or an admin), not by the leaver. The high-level helper publishes the proposal for you:

```typescript
await client.groups.leave(group.id);
```

The builder `Proposals.proposeLeaveGroup(ownPubkey)` is available if you need the raw action.

## Combining proposals into a commit

`client.groups.commit(groupId, options)` accepts:

| Option              | Type                                                | Purpose                                                                         |
| ------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------- |
| `extraProposals`    | `(Proposal \| ProposalAction<Proposal> \| array)[]` | Proposals, or builders that return a single proposal, to include in this commit |
| `proposalRefs`      | `string[]`                                          | Keys of `group.unappliedProposals` (proposals already received)                 |
| `welcomeRecipients` | `WelcomeRecipient[]`                                | Invitees to deliver gift-wrapped Welcomes to after the commit                   |

Commits that change membership or group metadata require admin rights; self-updates (`group.selfUpdate()`) and `self_remove`-only auto-commits do not. The commit advances the group epoch, is published as a kind 445 event, and (when adding members) delivers a kind 444 Welcome inside a kind 1059 gift wrap to each recipient.

::: tip Standalone proposals
To broadcast a proposal without committing it immediately, use `group.propose(action)` or `group.sendProposal(proposal)`. Other members collect it and an admin commits it later (reference it via `proposalRefs`).
:::

## Next steps

- **[MarmotGroup](/client/marmot-group)** — the group surface that hosts commits and events
- **[Members](/core/members)** — how membership maps to MLS leaf nodes
- **[Welcome Messages](/core/welcome)** — how invitees join from a Welcome
