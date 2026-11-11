/**
 * The index of sorted maps, and the two indexes of LRU caches: a persistent
 * B+ tree of (order, key) entries.
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

function isSplit(result: ISortedIndexNode | Split): result is Split {
  return (result as Split).right !== undefined;
}

const freeze = Object.freeze;

// Freezing the node is what makes Immer skip it. Its arrays are left unfrozen:
// V8 copies and reads frozen arrays far more slowly, and nothing outside this
// module can reach them.
function makeNode(o: any[], k: Key[], c?: ISortedIndexNode[]): ISortedIndexNode {
  return c === undefined ? freeze({o, k}) : freeze({o, k, c});
}

// Stored arrays are copied with spread syntax, never slice or concat: Immer
// freezes the arrays of a state restored from JSON, and V8 slices frozen
// arrays very slowly. Spread copies frozen and unfrozen arrays alike, and
// several times faster than an element-by-element loop. (Arrays just built
// here are not frozen yet, and may be sliced.)
function inserted<T>(array: ReadonlyArray<T>, index: number, value: T): T[] {
  const copy = [...array];
  let i = copy.push(value) - 1;
  for (; i > index; i--) copy[i] = copy[i - 1];
  copy[index] = value;
  return copy;
}

function removed<T>(array: ReadonlyArray<T>, index: number): T[] {
  const copy = [...array];
  const last = copy.length - 1;
  for (let i = index; i < last; i++) copy[i] = copy[i + 1];
  copy.pop();
  return copy;
}

function joined<T>(...parts: ReadonlyArray<T>[]): T[] {
  const result: T[] = [];
  for (const part of parts) result.push(...part);
  return result;
}

function firstLeaf(node: ISortedIndexNode): ISortedIndexNode {
  while (node.c !== undefined) node = node.c[0];
  return node;
}

/** A stored order. An undefined order reads back from JSON as null; it is undefined again here. */
function orderAt(node: ISortedIndexNode, index: number): any {
  const order = node.o[index];
  return order === null ? undefined : order;
}

function width(node: ISortedIndexNode): number {
  return node.c === undefined ? node.o.length : node.c.length;
}

/** A total order on keys: numbers (NaN first) before strings. -0 and +0 are equal. */
function defaultCompareKeys(a: Key, b: Key): number {
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
   * @param compareKeys A total order on keys, in place of the default (numbers, NaN first, before strings).
   */
  constructor(private compareOrders: Comparer<O>, private max: number, private compareKeys: Comparer<Key> = defaultCompareKeys) {
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
    if (!isSplit(result)) return result;
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
    const leaf = this.leafFor(root, order, key);
    return this.position(leaf, order, key) >= 0;
  }

  /**
   * The stored order of the entry found for (order, key), or undefined if
   * there is none: for an index whose comparer ignores part of the order.
   */
  storedOrder(root: ISortedIndexNode, order: O, key: Key): O|undefined {
    const leaf = this.leafFor(root, order, key);
    const index = this.position(leaf, order, key);
    return index < 0 ? undefined : orderAt(leaf, index);
  }

  /**
   * Replaces the stored order of the entry found for (order, key), leaving it
   * where it is: for an index whose comparer ignores the difference. Returns
   * the new index and the order replaced, or undefined if there is no entry.
   */
  replaceOrder(root: ISortedIndexNode, order: O, key: Key, replacement: O): {index: ISortedIndexNode, previous: O}|undefined {
    let previous: O|undefined;
    const replace = (node: ISortedIndexNode): ISortedIndexNode|undefined => {
      if (node.c === undefined) {
        const index = this.position(node, order, key);
        if (index < 0) return undefined;
        previous = orderAt(node, index);
        const o = [...node.o];
        o[index] = replacement;
        return makeNode(o, node.k as Key[]);
      }
      const index = this.childIndex(node, order, key);
      const child = replace(node.c[index]);
      if (child === undefined) return undefined;
      const c = [...node.c];
      c[index] = child;
      let o = node.o as any[];
      // A separator is a copy of the first entry of the child after it.
      if (index > 0 && this.compareKeys(node.k[index - 1], key) === 0) {
        o = [...o];
        o[index - 1] = replacement;
      }
      return makeNode(o, node.k as Key[], c);
    };
    const replaced = replace(root);
    return replaced === undefined ? undefined : {index: replaced, previous: previous as O};
  }

  /** The first (or last) key, or undefined when empty. */
  edgeKey(root: ISortedIndexNode, last: boolean): Key|undefined {
    let node = root;
    while (node.c !== undefined) node = node.c[last ? node.c.length - 1 : 0];
    return node.k[last ? node.k.length - 1 : 0];
  }

  /** The first count entries, in order. */
  firstEntries(root: ISortedIndexNode, count: number): {orders: O[], keys: Key[]} {
    const orders: O[] = [], keys: Key[] = [];
    const visit = (node: ISortedIndexNode) => {
      if (node.c !== undefined) {
        for (let i = 0; i < node.c.length && keys.length < count; i++) visit(node.c[i]);
      } else {
        for (let i = 0; i < node.k.length && keys.length < count; i++) {
          orders.push(orderAt(node, i));
          keys.push(node.k[i]);
        }
      }
    };
    visit(root);
    return {orders, keys};
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

  /** Where the entry (order, key) is in a leaf, or -1 if it is not there. */
  private position(leaf: ISortedIndexNode, order: O, key: Key): number {
    const index = this.lowerBound(leaf, order, key);
    return index < leaf.o.length && this.compare(order, key, leaf, index) === 0 ? index : -1;
  }

  /** The leaf whose range holds (order, key). */
  private leafFor(root: ISortedIndexNode, order: O, key: Key): ISortedIndexNode {
    let node = root;
    while (node.c !== undefined) node = node.c[this.childIndex(node, order, key)];
    return node;
  }

  private compare(order: O, key: Key, node: ISortedIndexNode, index: number): number {
    return this.compareOrders(order, orderAt(node, index)) || this.compareKeys(key, node.k[index]);
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
    if (!isSplit(result)) {
      const c = [...node.c];
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
      const index = this.position(node, order, key);
      if (index < 0) return undefined;
      return makeNode(removed(node.o, index), removed(node.k, index));
    }

    const children = node.c;
    const index = this.childIndex(node, order, key);
    const child = this.removeFrom(children[index], order, key);
    if (child === undefined) return undefined;
    // Only a root being collapsed (see remove) has a single child.
    if (width(child) < this.min && children.length > 1) return this.refill(node, index, child);

    const c = [...children];
    c[index] = child;
    let o = node.o as any[];
    let k = node.k as Key[];
    // A separator is a copy of the first entry of the child after it. When that
    // entry goes, the child's new first entry replaces it, so the tree keeps no
    // removed order: one held by reference may be mutated once it is removed.
    if (index > 0 && this.compareKeys(k[index - 1], key) === 0) {
      const first = firstLeaf(child);
      o = [...o];
      k = [...k];
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

    const parentO = [...node.o];
    const parentK = [...node.k];
    const parentC = [...siblings];
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
