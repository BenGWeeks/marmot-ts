# Members

Query group membership and the leaves (devices) each account has in a group.

## Querying Members

### Get All Members

```typescript
import { getGroupMemberPubkeys } from "@internet-privacy/marmot-ts";

const members = getGroupMemberPubkeys(clientState);
// Unique Nostr pubkeys (hex); leaves with invalid identities are skipped

console.log(`Group has ${members.length} members`);
```

`getGroupMembers` is a deprecated alias of `getGroupMemberPubkeys`. Don't confuse it with ts-mls's own `getGroupMembers` on the `/mls` entrypoint, which returns `LeafNode`s.

## Multiple Leaves per Account

An account MAY have several leaves (one per device) in the same group, all with the same Nostr pubkey ([`foundation/identity.md`](https://github.com/marmot-protocol/marmot/blob/master/foundation/identity.md)). These helpers enumerate them; device linking and roster management (multi-device) are not yet specified by Marmot.

### Get Leaf Nodes for a Pubkey

```typescript
import { getPubkeyLeafNodes } from "@internet-privacy/marmot-ts";

const leafNodes = getPubkeyLeafNodes(clientState, pubkey);
console.log(`${pubkey} has ${leafNodes.length} devices`);
```

### Get Leaf Node Indexes

Needed for remove operations:

```typescript
import { getPubkeyLeafNodeIndexes } from "@internet-privacy/marmot-ts";

const indexes = getPubkeyLeafNodeIndexes(clientState, pubkey);
// Returns array of leaf node indexes
```

### Get Indexes by Credential

```typescript
import { getCredentialLeafNodeIndexes } from "@internet-privacy/marmot-ts";

const indexes = getCredentialLeafNodeIndexes(clientState, credential);
```

## Removing Members

Removing another member requires an active admin ([`app-components/admin-policy-v1.md`](https://github.com/marmot-protocol/marmot/blob/master/app-components/admin-policy-v1.md)). Use the client helper, which removes every leaf for the pubkey:

```typescript
import { Proposals } from "@internet-privacy/marmot-ts";

// proposeRemoveUser returns one Remove per leaf; resolve it against the
// group's current state, then commit the resulting proposals
const removals = await Proposals.proposeRemoveUser(targetPubkey)(
  group.session.proposalContext(),
);
await client.groups.commit(group.id, { extraProposals: removals });
```

At the core/MLS level, the equivalent proposals are:

```typescript
import { getPubkeyLeafNodeIndexes } from "@internet-privacy/marmot-ts";
import {
  defaultProposalTypes,
  type ProposalRemove,
} from "@internet-privacy/marmot-ts/mls";

const removeProposals: ProposalRemove[] = getPubkeyLeafNodeIndexes(
  clientState,
  targetPubkey,
).map((removed) => ({
  proposalType: defaultProposalTypes.remove,
  remove: { removed },
}));
```

If the target is a listed admin and the commit removes their last leaf, the same commit MUST also remove them from the admin policy. When you commit through `client.groups.commit`, the engine splices that admin-policy update in automatically, and refuses a commit that would leave no admin. Members leave voluntarily with `self_remove` (`client.groups.leave`), not a Remove proposal ([`protocol-core/member-departure.md`](https://github.com/marmot-protocol/marmot/blob/master/protocol-core/member-departure.md)).

## Example: Multi-Device User

```typescript
import {
  getGroupMemberPubkeys,
  getPubkeyLeafNodes,
  getPubkeyLeafNodeIndexes,
} from "@internet-privacy/marmot-ts";

// Get all unique members
const members = getGroupMemberPubkeys(clientState);

// Check each member's devices
for (const pubkey of members) {
  const leafNodes = getPubkeyLeafNodes(clientState, pubkey);
  console.log(`${pubkey}: ${leafNodes.length} device(s)`);

  if (leafNodes.length > 1) {
    // User has multiple devices
    const indexes = getPubkeyLeafNodeIndexes(clientState, pubkey);
    console.log(`  Leaf indexes: ${indexes.join(", ")}`);
  }
}
```

## Related

- [Credentials](./credentials) - Identity in MLS
- [Messages](./messages) - Sending messages to group members
