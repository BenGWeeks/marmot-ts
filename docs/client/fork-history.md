# Fork History

Marmot groups can **fork**: because group events arrive over Nostr with no
guaranteed order, two members can commit from the same epoch at the same time,
producing competing branches. The convergence engine deterministically picks one
canonical branch, but the others still happened.

marmot-ts retains the **whole fork tree** — every group state ever observed, the
canonical branch and every abandoned fork — so you can inspect and debug forks,
and re-converge onto a branch that wins within the protocol's rollback horizon.
This page covers the retention policy and the customer-facing API for reading the
tree.

::: warning Forward secrecy
Retaining old group states keeps the MLS secrets for those epochs, so a device
compromise exposes more of the group's history than MLS alone would. Store the
rewind backend encrypted at rest.
:::

## The history tree

Each node in the tree is one MLS group state, identified by the hex of its MLS
**confirmation tag** (unique per state). Edges are commits: a node's parent is
the state its commit was applied to. Every non-root node has exactly one parent,
so the structure is a tree rooted at the welcome/creation state — **more than one
child marks a fork**.

```
        root (epoch 1)
        ├── A (epoch 2)   ← canonical tip (group.state)
        └── B (epoch 2)   ← abandoned fork, still retained
```

Snapshots are stored as serialized bytes, never as live objects, and each node's
state rehydrates independently on demand.

## Retention policy

The rollback horizon is the convergence policy's `maxRewindCommits` (5 in
convergence policy v1). It bounds how far back a fork may diverge and still be
eligible for re-convergence, and how much retained state the engine keeps for that
purpose.

`maxRewindCommits` is a **pinned protocol constant**
([`protocol-core/convergence.md`](https://github.com/marmot-protocol/marmot/blob/master/protocol-core/convergence.md)).
Every client must use the same value. A client with a different horizon can select
a different canonical branch than its peers, and the group forks. Production
clients must leave `MarmotClient`'s `convergencePolicy` option at its default,
`DEFAULT_CONVERGENCE_POLICY`.

The option exists only for test harnesses and forensic or debug tools that never
send to a real group:

```ts
import { MarmotClient } from "@internet-privacy/marmot-ts/client";
import { DEFAULT_CONVERGENCE_POLICY } from "@internet-privacy/marmot-ts/core";

// Debug/forensics only. Non-conformant: never use in a client that sends.
const client = new MarmotClient({
  // ...stores, signer, network...
  convergencePolicy: {
    ...DEFAULT_CONVERGENCE_POLICY,
    maxRewindCommits: Infinity,
  },
});
```

With a non-default horizon, this client may adopt a branch its peers consider out
of range (or reject one they adopt), so its view of the group can diverge from
everyone else's.

### Persistence

Pass a `rewindStore` to persist the tree across restarts. It is written
incrementally and append-only under a per-group key prefix, so a save costs
`O(new nodes)` rather than re-serializing the whole tree. On load the light index
is restored eagerly; heavy snapshots are fetched lazily with a bounded cache, so
memory stays bounded even as the tree grows. Without a `rewindStore`, the tree is
in-memory only and rebuilt from the current tip after each restart.

## Reading the tree

Every [`MarmotGroup`](./marmot-group) exposes two views.

### `group.forkTree` — live queries

The live [`GroupHistoryTree`](https://github.com/marmot-protocol/marmot-ts/blob/master/src/engine/history-tree.ts) for ad-hoc traversal:

```ts
const tree = group.forkTree;

tree.rootTag; // root node tag, or undefined if empty
tree.tips(); // leaf states — the competing branches
tree.childrenOf(tag); // fork children of a node
tree.path(tag); // root → node tags
tree.lowestCommonAncestor(a, b); // the fork point of two branches

await tree.stateAt(tag); // rehydrate that branch's ClientState
await tree.commitMessageOf(tag); // the commit that produced the node
```

### `group.forkTreeView()` — a rendering snapshot

A plain, serializable snapshot for building UIs. Nodes on the path from the root
to the **canonical (live) tip** — the branch convergence settled on, i.e. the one
matching `group.state` — are flagged `canonical`:

```ts
const view = group.forkTreeView();

view.rootTag; // root tag
view.canonicalTip; // the live tip you send from
view.canonicalPath; // root → canonical tip
view.tips; // all tips (canonical and abandoned)

for (const node of view.nodes) {
  node.tag; // node id
  node.epoch; // MLS epoch
  node.parentTag; // parent, or undefined for the root
  node.childTags; // > 1 ⇒ a fork here
  node.isTip; // leaf state
  node.canonical; // on the canonical path
  node.isCanonicalTip; // the live tip
  node.commit?.digestHex; // edge identity (absent for the root)
  node.commit?.senderLeafIndex; // committer's MLS leaf, when known
}
```

### Reacting to changes

The `historyChanged` event fires whenever ingest grows the tree — a new commit or
a newly observed fork branch. It fires even when the canonical state is unchanged
(a superseded fork still adds a node), so a debugging UI can re-render on it:

```ts
group.on("historyChanged", (g) => render(g.forkTreeView()));
```
