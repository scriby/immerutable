/**
 * The B-tree behind SortedCollectionAdapter. Its elements are user objects,
 * which must be reached through Immer drafts so that mutating them is tracked.
 * (The sorted map's index holds only primitives, so it avoids drafts entirely;
 * see sortedindex.ts.)
 *
 * The layout is designed for Immer, where every property access on a draft
 * runs a proxy trap, the first read of each object creates a draft (and, in
 * modern Immer, copies its parent), and every modified object is copied and
 * finalized property by property when the producer finishes:
 *
 * - A node is an object with one property per position, not an array (see
 *   slots.ts for why, and for the property names). Position 0 holds a string:
 *   its first character tags the node as a leaf ('L') or interior node ('I'),
 *   and character r + 1 holds the slot of the rank-r element, as a printable
 *   character counting from '0' (some stores reject the NUL character in
 *   persisted text). Inserting or removing an element writes its slot and
 *   replaces that string (a primitive), instead of shifting every later
 *   element through the draft, which would also draft each one. Freed slots
 *   are cleared and later reused, so elements never move.
 * - A leaf keeps the element in slot s at position 1 + s. An interior node
 *   keeps its leftmost child at position 1, the element in slot s at 2 + 2s,
 *   and the child to that element's right at 3 + 2s.
 * - Every element is stored once (a classic B-tree, not a B+ tree), so no
 *   separator copy can go stale when an element is mutated in place.
 */

import {checkLayout, readSlot, slotName} from './slots';

export interface IBTreeNode {
  [position: string]: any;
}

/**
 * An object with the first count positions present (and undefined). Nodes are
 * spread copies of one, so all nodes of a kind share a shape, which V8 copies
 * fastest. It is parsed rather than built by assignment: V8 switches an
 * object that gains many properties one by one to a dictionary, which Immer
 * copies several times more slowly.
 */
function template(count: number): IBTreeNode {
  const names: string[] = [];
  for (let i = 0; i < count; i++) names.push(slotName(i));
  const node: IBTreeNode = JSON.parse('{' + names.map(name => JSON.stringify(name) + ':null').join(',') + '}');
  for (const name of names) node[name] = undefined;
  return node;
}

/**
 * A root-to-element path: nodes[i] is entered through child rank ranks[i - 1],
 * and the last rank is the element's rank within the last node.
 */
export interface TreePath {
  nodes: IBTreeNode[];
  ranks: number[];
}

/** How elements are ordered and identified. Read on every use, so changes to it apply at once. */
export interface ElementComparers<T> {
  orderComparer(a: T, b: T): number;
  equalityComparer(a: T, b: T): boolean;
}

const fromCharCode = String.fromCharCode;
const LEAF = 'L';
const INTERIOR = 'I';
const LEAF_CODE = LEAF.charCodeAt(0);
/** The character code of slot 0 in a rank string. */
const SLOT_BASE = '0'.charCodeAt(0);

function isLeaf(p: string): boolean {
  return p.charCodeAt(0) === LEAF_CODE;
}

/** The slot recorded at position i (1 or more) of a rank string. */
function slotAt(p: string, i: number): number {
  return p.charCodeAt(i) - SLOT_BASE;
}

function slotChar(slot: number): string {
  return fromCharCode(SLOT_BASE + slot);
}

// The smallest slot not referenced by p. With n elements it is at most n.
function freeSlot(p: string): number {
  const n = p.length - 1;
  // Usually slots 0..n-1 are all in use, leaving n free.
  let i = 1;
  while (i <= n && slotAt(p, i) !== n) i++;
  if (i > n) return n;
  const used: boolean[] = [];
  for (let j = 1; j <= n; j++) {
    const slot = slotAt(p, j);
    if (slot <= n) used[slot] = true;
  }
  let slot = 0;
  while (used[slot]) slot++;
  return slot;
}

/** p with slot inserted at rank. Appending (in-order insertion) needs one concatenation. */
function withRank(p: string, rank: number, slot: number): string {
  return rank === p.length - 1 ? p + slotChar(slot) : p.slice(0, rank + 1) + slotChar(slot) + p.slice(rank + 1);
}

/** A rank string over slots 0..count-1 in order. */
function denseRanks(tag: string, count: number): string {
  let p = tag;
  for (let i = 0; i < count; i++) p += slotChar(i);
  return p;
}

/** The index of the element in slot s. */
function slotIndex(p: string, slot: number): number {
  return isLeaf(p) ? 1 + slot : 2 + 2 * slot;
}

export class BTree<T> {
  private readonly maxEntries: number;
  private readonly minEntries: number;
  private readonly leafTemplate: IBTreeNode;
  private readonly interiorTemplate: IBTreeNode;

  constructor(private comparers: ElementComparers<T>, maxItemsPerLevel: number) {
    if (maxItemsPerLevel % 2 === 1) throw new Error('maxItemsPerLevel must be even');
    if (maxItemsPerLevel < 3) throw new Error('maxItemsPerLevel must be at least 3');
    // A node has at most maxItemsPerLevel children. Merging two minimal nodes
    // and their separator must fit: 2 * min + 1 <= max.
    this.maxEntries = maxItemsPerLevel - 1;
    this.minEntries = maxItemsPerLevel / 2 - 1;
    // A node briefly holds one element more than the maximum, before it splits.
    this.leafTemplate = template(this.maxEntries + 2);
    this.interiorTemplate = template(2 * this.maxEntries + 4);
  }

  createRoot(): IBTreeNode {
    return this.newNode(LEAF);
  }

  /** A node with rank string p and nothing else. Every position is present, so all nodes of a kind share a shape. */
  private newNode(p: string): IBTreeNode {
    const node = isLeaf(p) ? {...this.leafTemplate} : {...this.interiorTemplate};
    node[slotName(0)] = p;
    return node;
  }

  /**
   * Inserts value as a new element. Returns the (possibly new) root.
   *
   * @param searchRoot The same tree in a form that is cheaper to search: for a draft that nothing has modified, the
   *                   root of the state under it, where comparing elements creates no drafts.
   */
  insert(root: IBTreeNode, value: T, searchRoot: IBTreeNode = root): IBTreeNode {
    checkLayout(root);
    const nodes: IBTreeNode[] = [];
    const ranks: number[] = [];
    let node = searchRoot;
    let p: string = readSlot(node, 0);
    let rank: number;

    for (;;) {
      rank = this.insertionRank(node, p, value);
      if (isLeaf(p)) break;
      nodes.push(node);
      ranks.push(rank);
      node = this.childAt(node, p, rank);
      p = readSlot(node, 0);
    }
    // The search ran on undrafted state: draft only the nodes on the path.
    if (searchRoot !== root) {
      node = root;
      for (let i = 0; i < ranks.length; i++) {
        nodes[i] = node;
        node = this.childAt(node, readSlot(node, 0), ranks[i]);
      }
    }

    if (this.insertAt(node, p, rank, value, undefined).length - 1 <= this.maxEntries) return root;
    return this.splitUpwards(root, node, rank, nodes, ranks);
  }

  /**
   * Finds the element equal to value, or undefined.
   *
   * @param equals Tests a stored element against the value, in place of the equality comparer.
   */
  find(root: IBTreeNode, value: T, equals?: (element: T, value: T) => boolean): TreePath|undefined {
    checkLayout(root);
    const path: TreePath = { nodes: [], ranks: [] };
    return this.findIn(root, value, path, equals) ? path : undefined;
  }

  /**
   * The same path through another form of the same tree: for a path found in
   * the state a draft was created from, the path through the draft. Walking
   * it drafts the nodes on it, and no others.
   */
  retrace(root: IBTreeNode, path: TreePath): TreePath {
    let node = root;
    for (let i = 0; i < path.nodes.length; i++) {
      if (i > 0) node = this.childAt(node, readSlot(node, 0), path.ranks[i - 1]);
      path.nodes[i] = node;
    }
    return path;
  }

  /** The index of the element a path ends at, in the path's last node. */
  baseOf(path: TreePath): number {
    const last = path.nodes.length - 1;
    return this.baseAt(readSlot(path.nodes[last], 0), path.ranks[last]);
  }

  /** Whether the element a path ends at is ordered correctly relative to its neighbours. */
  inOrder(path: TreePath): boolean {
    const value: T = readSlot(path.nodes[path.nodes.length - 1], this.baseOf(path));
    const before = this.neighbour(path, -1);
    if (before !== undefined && this.compare(value, before.node, before.base) < 0) return false;
    const after = this.neighbour(path, 1);
    return after === undefined || this.compare(value, after.node, after.base) <= 0;
  }

  /** Removes the element a path ends at. The path is consumed. Returns the (possibly new) root. */
  remove(root: IBTreeNode, path: TreePath): IBTreeNode {
    const {nodes, ranks} = path;
    let node = nodes[nodes.length - 1];
    let p: string = readSlot(node, 0);
    let rank = ranks[ranks.length - 1];

    if (!isLeaf(p)) {
      // Replace an interior element with its predecessor, the largest element
      // of the subtree to its left, and remove that from its leaf instead.
      const base = this.baseAt(p, rank);
      let child = this.childAt(node, p, rank);
      let childP: string = readSlot(child, 0);
      while (!isLeaf(childP)) {
        const childRank = childP.length - 1;
        nodes.push(child);
        ranks.push(childRank);
        child = this.childAt(child, childP, childRank);
        childP = readSlot(child, 0);
      }
      const leafRank = childP.length - 2;
      node[slotName(base)] = readSlot(child, this.baseAt(childP, leafRank));
      nodes.push(child);
      ranks.push(leafRank);
      node = child;
      p = childP;
      rank = leafRank;
    }

    this.removeRank(node, p, rank);
    return this.rebalance(root, nodes, ranks);
  }

  /** The first or last element, or undefined when empty. */
  edge(root: IBTreeNode, last: boolean): T|undefined {
    checkLayout(root);
    let node = root;
    let p: string = readSlot(node, 0);
    while (!isLeaf(p)) {
      node = this.childAt(node, p, last ? p.length - 1 : 0);
      p = readSlot(node, 0);
    }
    if (p.length === 1) return undefined;
    return readSlot(node, this.baseAt(p, last ? p.length - 2 : 0));
  }

  /** Iterates elements in order (or reverse order). */
  iterate(root: IBTreeNode, backward: boolean): Iterable<T> {
    return { [Symbol.iterator]: () => this.iterator(root, backward) };
  }

  private iterator(root: IBTreeNode, backward: boolean): Iterator<T> {
    checkLayout(root);
    const step = backward ? -1 : 1;
    // Ancestors, with the rank of the child currently being visited in each.
    const nodes: IBTreeNode[] = [];
    const perms: string[] = [];
    const children: number[] = [];
    let leaf: IBTreeNode;
    let leafP: string;
    let rank = 0;

    const descend = (node: IBTreeNode) => {
      let p: string = readSlot(node, 0);
      while (!isLeaf(p)) {
        const child = backward ? p.length - 1 : 0;
        nodes.push(node);
        perms.push(p);
        children.push(child);
        node = this.childAt(node, p, child);
        p = readSlot(node, 0);
      }
      leaf = node;
      leafP = p;
      rank = backward ? p.length - 2 : 0;
    };
    descend(root);

    return {
      next: (): IteratorResult<T> => {
        if (rank >= 0 && rank < leafP.length - 1) {
          const value = readSlot(leaf, 1 + slotAt(leafP, rank + 1));
          rank += step;
          return { value, done: false };
        }
        // Back up to the nearest ancestor with an element left on this side,
        // visit it, then the subtree beyond it.
        while (nodes.length > 0) {
          const top = nodes.length - 1;
          const p = perms[top];
          const child = children[top];
          const element = backward ? child - 1 : child;
          if (element >= 0 && element < p.length - 1) {
            const node = nodes[top];
            children[top] = child + step;
            const value = readSlot(node, 2 + 2 * slotAt(p, element + 1));
            descend(this.childAt(node, p, child + step));
            return { value, done: false };
          }
          nodes.pop();
          perms.pop();
          children.pop();
        }
        return { value: undefined as any as T, done: true };
      }
    };
  }

  private compare(value: T, node: IBTreeNode, base: number): number {
    return this.comparers.orderComparer(value, readSlot(node, base));
  }

  /** The index of the rank-r element of a node with rank string p. */
  private baseAt(p: string, rank: number): number {
    return slotIndex(p, slotAt(p, rank + 1));
  }

  /** The child left of the rank-r element (or right of the last element, for r = count). */
  private childAt(node: IBTreeNode, p: string, rank: number): IBTreeNode {
    return rank === 0 ? readSlot(node, 1) : readSlot(node, 3 + 2 * slotAt(p, rank));
  }

  private insertionRank(node: IBTreeNode, p: string, value: T): number {
    const count = p.length - 1;
    if (count === 0) return 0;
    // Favour in-order and reverse-order insertion.
    if (this.compare(value, node, this.baseAt(p, count - 1)) >= 0) return count;
    if (this.compare(value, node, this.baseAt(p, 0)) <= 0) return 0;
    return this.search(node, p, value, 1, count - 2);
  }

  /** Binary search for a rank whose element compares equal, else the insertion rank. */
  private search(node: IBTreeNode, p: string, value: T, low: number, high: number): number {
    while (low <= high) {
      const mid = (low + high) >>> 1;
      const comparison = this.compare(value, node, this.baseAt(p, mid));
      if (comparison < 0) high = mid - 1;
      else if (comparison > 0) low = mid + 1;
      else return mid;
    }
    return low;
  }

  private findIn(node: IBTreeNode, value: T, path: TreePath, equals: ((element: T, value: T) => boolean)|undefined): boolean {
    const p: string = readSlot(node, 0);
    const count = p.length - 1;
    const interior = !isLeaf(p);
    const start = this.search(node, p, value, 0, count - 1);

    // Equal elements may sit on either side of the search result, in this node
    // or in the subtrees between them.
    for (let rank = start; ; rank++) {
      const base = rank < count ? this.baseAt(p, rank) : -1;
      if (base >= 0 && this.matches(readSlot(node, base), value, equals)) {
        path.nodes.push(node);
        path.ranks.push(rank);
        return true;
      }
      if (interior && this.findInChild(node, p, rank, value, path, equals)) return true;
      if (base < 0 || this.compare(value, node, base) !== 0) break;
    }

    for (let rank = start - 1; rank >= 0; rank--) {
      const base = this.baseAt(p, rank);
      if (this.matches(readSlot(node, base), value, equals)) {
        path.nodes.push(node);
        path.ranks.push(rank);
        return true;
      }
      // The child left of this element can only hold a match when the element
      // ties with the value. Descending without this check makes a miss
      // visit O(2^height) nodes.
      if (this.compare(value, node, base) !== 0) break;
      if (interior && this.findInChild(node, p, rank, value, path, equals)) return true;
    }

    return false;
  }

  private matches(element: T, value: T, equals: ((element: T, value: T) => boolean)|undefined): boolean {
    return equals === undefined ? this.comparers.equalityComparer(element, value) : equals(element, value);
  }

  private findInChild(node: IBTreeNode, p: string, rank: number, value: T, path: TreePath, equals: ((element: T, value: T) => boolean)|undefined): boolean {
    path.nodes.push(node);
    path.ranks.push(rank);
    if (this.findIn(this.childAt(node, p, rank), value, path, equals)) return true;
    path.nodes.pop();
    path.ranks.pop();
    return false;
  }

  /** The element before (direction -1) or after (+1) the element a path ends at. */
  private neighbour(path: TreePath, direction: -1|1): {node: IBTreeNode, base: number}|undefined {
    const {nodes, ranks} = path;
    const last = nodes.length - 1;
    const node = nodes[last];
    const rank = ranks[last];
    const p: string = readSlot(node, 0);

    if (!isLeaf(p)) {
      // The extreme element of the adjacent subtree.
      let child = this.childAt(node, p, direction < 0 ? rank : rank + 1);
      let childP: string = readSlot(child, 0);
      while (!isLeaf(childP)) {
        child = this.childAt(child, childP, direction < 0 ? childP.length - 1 : 0);
        childP = readSlot(child, 0);
      }
      return { node: child, base: this.baseAt(childP, direction < 0 ? childP.length - 2 : 0) };
    }

    const sibling = rank + direction;
    if (sibling >= 0 && sibling < p.length - 1) return { node, base: this.baseAt(p, sibling) };

    // The nearest ancestor entered from a child other than its first (or last).
    for (let i = last - 1; i >= 0; i--) {
      const ancestorP: string = readSlot(nodes[i], 0);
      const elementRank = direction < 0 ? ranks[i] - 1 : ranks[i];
      if (elementRank >= 0 && elementRank < ancestorP.length - 1) {
        return { node: nodes[i], base: this.baseAt(ancestorP, elementRank) };
      }
    }
    return undefined;
  }

  /**
   * Inserts value at rank in a node whose rank string is p (and, in an
   * interior node, the child to its right). Returns the new rank string.
   */
  private insertAt(node: IBTreeNode, p: string, rank: number, value: T, rightChild: IBTreeNode|undefined): string {
    const slot = freeSlot(p);
    const base = slotIndex(p, slot);
    node[slotName(base)] = value;
    if (!isLeaf(p)) node[slotName(base + 1)] = rightChild;
    return node[slotName(0)] = withRank(p, rank, slot);
  }

  /**
   * Clears a slot and drops its rank. Slots are overwritten with undefined
   * rather than deleted, so the node keeps its shape.
   */
  private removeRank(node: IBTreeNode, p: string, rank: number): void {
    const base = this.baseAt(p, rank);
    node[slotName(base)] = undefined;
    if (!isLeaf(p)) node[slotName(base + 1)] = undefined;
    node[slotName(0)] = p.slice(0, rank + 1) + p.slice(rank + 2);
  }

  private splitUpwards(root: IBTreeNode, node: IBTreeNode, insertedRank: number, nodes: IBTreeNode[], ranks: number[]): IBTreeNode {
    for (let depth = nodes.length; (readSlot(node, 0) as string).length - 1 > this.maxEntries; ) {
      const {right, median} = this.split(node, insertedRank);

      if (depth === 0) {
        const newRoot = this.newNode(INTERIOR);
        newRoot[slotName(1)] = node;
        this.insertAt(newRoot, INTERIOR, 0, median, right);
        return newRoot;
      }

      const parent = nodes[--depth];
      const rank = ranks[depth];
      this.insertAt(parent, readSlot(parent, 0), rank, median, right);
      node = parent;
      insertedRank = rank;
    }
    return root;
  }

  /** Splits an overfull node around a median element, moving the elements after it into a new node. */
  private split(node: IBTreeNode, insertedRank: number): {right: IBTreeNode, median: T} {
    const p: string = readSlot(node, 0);
    const count = p.length - 1;
    const leaf = isLeaf(p);
    const width = leaf ? 1 : 2;

    // A leaf split by an insertion at its end (or start) keeps all but one
    // element together, which packs ascending (or descending) insertions densely.
    const median = !leaf ? count >> 1
      : insertedRank === count - 1 ? count - 2
      : insertedRank === 0 ? 1
      : count >> 1;
    const medianBase = this.baseAt(p, median);
    const medianValue: T = readSlot(node, medianBase);
    const right = this.newNode(denseRanks(p.charAt(0), count - 1 - median));
    let next = 1;
    if (!leaf) right[slotName(next++)] = readSlot(node, medianBase + 1);

    for (let rank = median + 1; rank < count; rank++) {
      const base = this.baseAt(p, rank);
      for (let k = 0; k < width; k++) {
        right[slotName(next++)] = readSlot(node, base + k);
        node[slotName(base + k)] = undefined;
      }
    }
    for (let k = 0; k < width; k++) node[slotName(medianBase + k)] = undefined;
    node[slotName(0)] = p.slice(0, median + 1);
    return { right, median: medianValue };
  }

  /** Restores minimum occupancy along a path after a removal. */
  private rebalance(root: IBTreeNode, nodes: IBTreeNode[], ranks: number[]): IBTreeNode {
    const min = this.minEntries;

    for (let i = nodes.length - 1; i > 0; i--) {
      const node = nodes[i];
      const nodeP: string = readSlot(node, 0);
      if (nodeP.length - 1 >= min) break;

      const parent = nodes[i - 1];
      const parentP: string = readSlot(parent, 0);
      const childRank = ranks[i - 1];
      const right = childRank < parentP.length - 1 ? this.childAt(parent, parentP, childRank + 1) : undefined;
      if (right !== undefined && (readSlot(right, 0) as string).length - 1 > min) {
        this.rotateLeft(parent, parentP, childRank, node, nodeP, right);
        break;
      }
      const left = childRank > 0 ? this.childAt(parent, parentP, childRank - 1) : undefined;
      if (left !== undefined && (readSlot(left, 0) as string).length - 1 > min) {
        this.rotateRight(parent, parentP, childRank - 1, left, node, nodeP);
        break;
      }
      if (left !== undefined) this.merge(parent, parentP, childRank - 1, left, node);
      else this.merge(parent, parentP, childRank, node, right!);
    }

    // A root emptied by a merge hands over to its only child.
    const rootP: string = readSlot(root, 0);
    return rootP.length === 1 && !isLeaf(rootP) ? readSlot(root, 1) : root;
  }

  /** Moves the separator down into node and the right sibling's first element up. */
  private rotateLeft(parent: IBTreeNode, parentP: string, separatorRank: number, node: IBTreeNode, nodeP: string, right: IBTreeNode): void {
    const separatorBase = this.baseAt(parentP, separatorRank);
    const rightP: string = readSlot(right, 0);
    const rightBase = this.baseAt(rightP, 0);
    let movedChild: IBTreeNode|undefined;
    if (!isLeaf(rightP)) {
      movedChild = readSlot(right, 1);
      right[slotName(1)] = readSlot(right, rightBase + 1);
    }
    this.insertAt(node, nodeP, nodeP.length - 1, readSlot(parent, separatorBase), movedChild);
    parent[slotName(separatorBase)] = readSlot(right, rightBase);
    this.removeRank(right, rightP, 0);
  }

  /** Moves the separator down into node and the left sibling's last element up. */
  private rotateRight(parent: IBTreeNode, parentP: string, separatorRank: number, left: IBTreeNode, node: IBTreeNode, nodeP: string): void {
    const separatorBase = this.baseAt(parentP, separatorRank);
    const leftP: string = readSlot(left, 0);
    const leftRank = leftP.length - 2;
    const leftBase = this.baseAt(leftP, leftRank);
    const separator: T = readSlot(parent, separatorBase);
    if (isLeaf(leftP)) {
      this.insertAt(node, nodeP, 0, separator, undefined);
    } else {
      const movedChild: IBTreeNode = readSlot(left, leftBase + 1);
      this.insertAt(node, nodeP, 0, separator, readSlot(node, 1));
      node[slotName(1)] = movedChild;
    }
    parent[slotName(separatorBase)] = readSlot(left, leftBase);
    this.removeRank(left, leftP, leftRank);
  }

  /** Appends the separator and all of `right` to `left`, then drops the separator from the parent. */
  private merge(parent: IBTreeNode, parentP: string, separatorRank: number, left: IBTreeNode, right: IBTreeNode): void {
    const rightP: string = readSlot(right, 0);
    const interior = !isLeaf(rightP);
    let leftP: string = readSlot(left, 0);
    leftP = this.insertAt(left, leftP, leftP.length - 1, readSlot(parent, this.baseAt(parentP, separatorRank)), interior ? readSlot(right, 1) : undefined);

    for (let rank = 0; rank < rightP.length - 1; rank++) {
      const base = this.baseAt(rightP, rank);
      leftP = this.insertAt(left, leftP, leftP.length - 1, readSlot(right, base), interior ? readSlot(right, base + 1) : undefined);
    }
    this.removeRank(parent, parentP, separatorRank);
  }
}
