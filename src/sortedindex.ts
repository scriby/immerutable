/**
 * The index of sorted maps (and so of LRU caches): a persistent B+ tree of
 * (order, key) entries.
 *
 * The index is never accessed through Immer drafts. Its entries are keys and
 * ordering keys, so there is nothing in it for Immer to track. Instead (see
 * readTree and writeTree in sortedmap.ts):
 *
 * - The adapter reads the current version without creating drafts.
 * - A change builds a new version, copying only the nodes on the changed path
 *   and freezing them, and assigns its root. Immer does not traverse frozen
 *   objects, so the index costs Immer one property read and one write per
 *   change, however large it is, and unchanged subtrees are shared.
 *
 * Orders must not be null (callers pass undefined instead): a stored null is
 * read as undefined, since JSON turns undefined array elements into null.
 *
 * Leaves hold entries in order. In an interior node, (o[i], k[i]) is a lower
 * bound for the entries under c[i + 1] and an upper bound (exclusive) for
 * those under c[i].
 */

import {Key} from './map';
import {Comparer} from './sortedcollection';

export interface ISortedIndexNode {
  o: ReadonlyArray<any>;
  k: ReadonlyArray<Key>;
  c?: ReadonlyArray<ISortedIndexNode>;
}

interface Split {
  left: ISortedIndexNode;
  order: any;
  key: Key;
  right: ISortedIndexNode;
}

const freeze = Object.freeze;

// Freezing the node is what makes Immer skip it. Its arrays are left unfrozen:
// V8 copies and reads frozen arrays far more slowly, and nothing outside this
// module can reach them.
function makeNode(o: any[], k: Key[], c?: ISortedIndexNode[]): ISortedIndexNode {
  return c === undefined ? freeze({o, k}) : freeze({o, k, c});
}

// Node arrays are copied with loops, never slice or concat: Immer freezes the
// arrays of nodes it copies, and V8 slices frozen arrays very slowly.
function copyRange<T>(array: ReadonlyArray<T>, from = 0, to = array.length): T[] {
  const copy: T[] = [];
  for (let i = from; i < to; i++) copy.push(array[i]);
  return copy;
}

function inserted<T>(array: ReadonlyArray<T>, index: number, value: T): T[] {
  const length = array.length;
  const copy: T[] = new Array(length + 1);
  for (let i = 0; i < index; i++) copy[i] = array[i];
  copy[index] = value;
  for (let i = index; i < length; i++) copy[i + 1] = array[i];
  return copy;
}

function removed<T>(array: ReadonlyArray<T>, index: number): T[] {
  const length = array.length - 1;
  const copy: T[] = new Array(length);
  for (let i = 0; i < index; i++) copy[i] = array[i];
  for (let i = index; i < length; i++) copy[i] = array[i + 1];
  return copy;
}

function joined<T>(...parts: ReadonlyArray<T>[]): T[] {
  const result: T[] = [];
  for (const part of parts) for (let i = 0; i < part.length; i++) result.push(part[i]);
  return result;
}

function firstLeaf(node: ISortedIndexNode): ISortedIndexNode {
  while (node.c !== undefined) node = node.c[0];
  return node;
}

function width(node: ISortedIndexNode): number {
  return node.c === undefined ? node.o.length : node.c.length;
}

/** A total order on keys: numbers (NaN first) before strings. -0 and +0 are equal. */
function compareKeys(a: Key, b: Key): number {
  if (a === b) return 0;
  const aType = typeof a;
  if (aType !== typeof b) return aType === 'number' ? -1 : 1;
  if (a < b) return -1;
  if (a > b) return 1;
  // Only NaN remains.
  return a !== a ? (b !== b ? 0 : -1) : 1;
}

export class SortedIndex<O> {
  private readonly min: number;

  /**
   * @param compareOrders Orders two ordering keys; ties are broken by key.
   * @param max The most entries in a leaf, and children in an interior node.
   */
  constructor(private compareOrders: Comparer<O>, private max: number) {
    // Merging two minimal nodes must fit in one, and every node other than
    // the root needs at least two children for removals to rebalance.
    if (max < 4) throw new Error('maxItemsPerLevel must be at least 4');
    this.min = max >> 1;
  }

  empty(): ISortedIndexNode {
    return makeNode([], []);
  }

  /** Adds an entry, which must not already be present. */
  insert(root: ISortedIndexNode, order: O, key: Key): ISortedIndexNode {
    const result = this.insertInto(root, order, key);
    if (!('right' in result)) return result;
    return makeNode([result.order], [result.key], [result.left, result.right]);
  }

  /** Removes an entry. Returns undefined if it is not present. */
  remove(root: ISortedIndexNode, order: O, key: Key): ISortedIndexNode|undefined {
    let result = this.removeFrom(root, order, key);
    while (result !== undefined && result.c !== undefined && result.c.length === 1) result = result.c[0];
    return result;
  }

  /** Changes an entry's order. Returns undefined if the entry is not present. */
  move(root: ISortedIndexNode, from: O, to: O, key: Key): ISortedIndexNode|undefined {
    const without = this.remove(root, from, key);
    return without === undefined ? undefined : this.insert(without, to, key);
  }

  contains(root: ISortedIndexNode, order: O, key: Key): boolean {
    let node = root;
    while (node.c !== undefined) node = node.c[this.childIndex(node, order, key)];
    const index = this.lowerBound(node, order, key);
    return index < node.o.length && this.compare(order, key, node, index) === 0;
  }

  /** The first (or last) key, or undefined when empty. */
  edgeKey(root: ISortedIndexNode, last: boolean): Key|undefined {
    let node = root;
    while (node.c !== undefined) node = node.c[last ? node.c.length - 1 : 0];
    return node.k[last ? node.k.length - 1 : 0];
  }

  /** Iterates keys in order (or reverse order), projecting each one. */
  iterate<R>(root: ISortedIndexNode, backward: boolean, project: (key: any) => R): Iterable<R> {
    return {
      [Symbol.iterator]: (): Iterator<R> => {
        const nodes: ISortedIndexNode[] = [];
        const positions: number[] = [];
        let leaf: ReadonlyArray<Key> = [];
        let index = 0;

        const descend = (node: ISortedIndexNode) => {
          while (node.c !== undefined) {
            const first = backward ? node.c.length - 1 : 0;
            nodes.push(node);
            positions.push(first);
            node = node.c[first];
          }
          leaf = node.k;
          index = backward ? leaf.length - 1 : 0;
        };
        descend(root);

        return {
          next: (): IteratorResult<R> => {
            for (;;) {
              if (index >= 0 && index < leaf.length) {
                const key = leaf[index];
                index += backward ? -1 : 1;
                return { value: project(key), done: false };
              }
              // Advance the deepest ancestor with another child to visit.
              let top = nodes.length - 1;
              while (top >= 0) {
                const next = positions[top] + (backward ? -1 : 1);
                const children = nodes[top].c!;
                if (next >= 0 && next < children.length) {
                  positions[top] = next;
                  nodes.length = top + 1;
                  positions.length = top + 1;
                  descend(children[next]);
                  break;
                }
                top--;
              }
              if (top < 0) return { value: undefined as any as R, done: true };
            }
          }
        };
      }
    };
  }

  private compare(order: O, key: Key, node: ISortedIndexNode, index: number): number {
    // A stored undefined order reads back from JSON as null; compare it as undefined.
    const stored = node.o[index];
    return this.compareOrders(order, stored === null ? undefined : stored) || compareKeys(key, node.k[index]);
  }

  /** The first leaf position whose entry is not less than (order, key). */
  private lowerBound(node: ISortedIndexNode, order: O, key: Key): number {
    let low = 0, high = node.o.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.compare(order, key, node, mid) > 0) low = mid + 1;
      else high = mid;
    }
    return low;
  }

  /** The child of an interior node whose range holds (order, key). */
  private childIndex(node: ISortedIndexNode, order: O, key: Key): number {
    let low = 0, high = node.o.length;
    // Favour in-order insertion: an entry past the last separator goes last.
    if (high > 0 && this.compare(order, key, node, high - 1) >= 0) return high;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.compare(order, key, node, mid) >= 0) low = mid + 1;
      else high = mid;
    }
    return low;
  }

  private insertInto(node: ISortedIndexNode, order: O, key: Key): ISortedIndexNode|Split {
    if (node.c === undefined) {
      const count = node.o.length;
      const index = count > 0 && this.compare(order, key, node, count - 1) > 0 ? count : this.lowerBound(node, order, key);
      const o = inserted(node.o, index, order);
      const k = inserted(node.k, index, key);
      if (o.length <= this.max) return makeNode(o, k);
      // Appending (or prepending) keeps the full side full, which packs
      // in-order (or reverse-order) insertion densely.
      const at = index === o.length - 1 ? index : index === 0 ? 1 : o.length >> 1;
      return {
        left: makeNode(o.slice(0, at), k.slice(0, at)),
        order: o[at],
        key: k[at],
        right: makeNode(o.slice(at), k.slice(at)),
      };
    }

    const index = this.childIndex(node, order, key);
    const result = this.insertInto(node.c[index], order, key);
    if (!('right' in result)) {
      const c = copyRange(node.c);
      c[index] = result;
      return makeNode(node.o as any[], node.k as Key[], c);
    }

    const c = inserted(node.c, index + 1, result.right);
    c[index] = result.left;
    const o = inserted(node.o, index, result.order);
    const k = inserted(node.k, index, result.key);
    if (c.length <= this.max) return makeNode(o, k, c);
    // Appending keeps the left side nearly full. The right side gets two
    // children, never one: a lone child has no sibling to borrow from or merge
    // with, so it could be left empty by removals.
    const at = index === c.length - 2 ? c.length - 2 : c.length >> 1;
    return {
      left: makeNode(o.slice(0, at - 1), k.slice(0, at - 1), c.slice(0, at)),
      order: o[at - 1],
      key: k[at - 1],
      right: makeNode(o.slice(at), k.slice(at), c.slice(at)),
    };
  }

  private removeFrom(node: ISortedIndexNode, order: O, key: Key): ISortedIndexNode|undefined {
    if (node.c === undefined) {
      const index = this.lowerBound(node, order, key);
      if (index >= node.o.length || this.compare(order, key, node, index) !== 0) return undefined;
      return makeNode(removed(node.o, index), removed(node.k, index));
    }

    const children = node.c;
    const index = this.childIndex(node, order, key);
    const child = this.removeFrom(children[index], order, key);
    if (child === undefined) return undefined;
    // Only a root being collapsed (see remove) has a single child.
    if (width(child) < this.min && children.length > 1) return this.refill(node, index, child);

    const c = copyRange(children);
    c[index] = child;
    let o = node.o as any[];
    let k = node.k as Key[];
    // A separator is a copy of the first entry of the child after it. When that
    // entry goes, the child's new first entry replaces it, so the tree keeps no
    // removed order: one held by reference may be mutated once it is removed.
    if (index > 0 && compareKeys(k[index - 1], key) === 0) {
      const first = firstLeaf(child);
      o = copyRange(o);
      k = copyRange(k);
      o[index - 1] = first.o[0];
      k[index - 1] = first.k[0];
    }
    return makeNode(o, k, c);
  }

  /**
   * Replaces the underfull child at index: joins it with a sibling (the left
   * one, if any) and splits the result evenly again if it is too wide. Either
   * way the separators around the child are rebuilt from the entries.
   */
  private refill(node: ISortedIndexNode, index: number, child: ISortedIndexNode): ISortedIndexNode {
    const siblings = node.c!;
    const at = index > 0 ? index - 1 : index;
    const first = at === index ? child : siblings[at];
    const second = at === index ? siblings[at + 1] : child;
    let o: any[], k: Key[], c: ISortedIndexNode[]|undefined;
    if (child.c === undefined) {
      o = joined(first.o, second.o);
      k = joined(first.k, second.k);
    } else {
      // The separator between the two moves down; it is second's first entry.
      const separator = firstLeaf(second);
      o = joined(first.o, [separator.o[0]], second.o);
      k = joined(first.k, [separator.k[0]], second.k);
      c = joined(first.c!, second.c!);
    }

    const parentO = copyRange(node.o);
    const parentK = copyRange(node.k);
    const parentC = copyRange(siblings);
    const total = c === undefined ? o.length : c.length;
    if (total <= this.max) {
      parentC.splice(at, 2, makeNode(o, k, c));
      parentO.splice(at, 1);
      parentK.splice(at, 1);
    } else {
      // A leaf's separator is the right half's first entry; an interior
      // node's moves up out of the halves.
      const mid = total >> 1;
      const end = c === undefined ? mid : mid - 1;
      parentC[at] = makeNode(o.slice(0, end), k.slice(0, end), c && c.slice(0, mid));
      parentC[at + 1] = makeNode(o.slice(mid), k.slice(mid), c && c.slice(mid));
      parentO[at] = o[end];
      parentK[at] = k[end];
    }
    return makeNode(parentO, parentK, parentC);
  }
}
