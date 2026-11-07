import {BTree, IBTreeNode as IStorageNode, TreePath} from './btree';
import {lazyIterable} from './util';

/** A node of the collection's B-tree. Its layout is internal (see btree.ts). */
export interface IBTreeNode<T> extends IStorageNode {}

export interface ISortedCollection<T> {
  root: IBTreeNode<T>;
  size: number;
}

export interface IBTreeValueNode<T> {
  value: T;
}

export type ParentPath<T> = {
  index: number;
  node: IBTreeNode<T>;
}[];

export interface LookupNodeInfo<T> {
  valueNode: IBTreeValueNode<T>;
  parentPath: ParentPath<T>;
}

export type Comparer<T> = (a: T, b: T) => number;

export type EqualityComparer<T> = (a: T, b: T) => boolean;

// Small nodes suit Immer: a change copies and finalizes every property of each
// node on its path. 10 also keeps a node's rank string under 13 characters,
// the length at which V8 starts building concatenations as ropes that must be
// flattened (copied) on their next read.
const MAX_ITEMS_PER_LEVEL = 10; // Must be even for this implementation

/**
 * This adapter class can be used to interact with an Immerutable Sorted Collection stored in the ngrx store.
 * This collection is backed by a B-tree which can efficiently handle insertions and deletions while maintaining
 * the sorted order of the collection. B-trees also allow for structural sharing such that only a portion
 * of the data structure needs to be shallow copied when items are added or removed.
 *
 * This data structure allows duplicates and does not provide key-based lookups. A SortedMap should be used instead
 * if these properties are desirable.
 *
 * Runtimes:
 * Insert: O(log(n))
 * Remove: O(log(n))
 * Iterate: O(n)
 */
export class SortedCollectionAdapter<T> {
  orderComparer: Comparer<T>;
  equalityComparer: EqualityComparer<T>;
  private tree: BTree<T>;

  /**
   * @param args.orderComparer A function which compares two values (similar to Array.sort). Used for ordering this collection.
   * @param args.equalityComparer A function which tests two values for equality. Optional (by default uses ===).
   * @param args.maxItemsPerLevel Don't set this value; it is only available for use in unit testing.
   */
  constructor(args: {
    orderComparer: Comparer<T>,
    equalityComparer?: EqualityComparer<T>,
    maxItemsPerLevel?: number,
  }) {
    this.orderComparer = args.orderComparer;
    this.equalityComparer = args.equalityComparer || ((a, b) => a === b);
    this.tree = new BTree<T>(this, args.maxItemsPerLevel || MAX_ITEMS_PER_LEVEL);
  }

  /**
   * Creates a new Immerutable Sorted Collection. This collection should be stored in the ngrx store.
   * It should not be modified or read from directly. All interaction with this collection should
   * happen through this adapter class.
   */
  create(): ISortedCollection<T> {
    return { root: this.tree.createRoot(), size: 0 };
  }

  /** Inserts an item into the collection in sorted order. */
  insert(collection: ISortedCollection<T>, value: T): void {
    this.setRoot(collection, this.tree.insert(collection.root, value));
    collection.size++;
  }

  getSize(collection: ISortedCollection<T>) {
    return collection.size;
  }

  /**
   * Updates an item using an updater function, which may mutate the item or return a replacement.
   * Returns the current item (the replacement, if one was returned), or undefined if the item was not found.
   * The updater must not insert or remove items in the same collection.
   */
  update(collection: ISortedCollection<T>, value: T, updater: (item: T) => T|void|undefined): T|undefined {
    const path = this.tree.find(collection.root, value);
    if (path === undefined) return;

    const node = path.nodes[path.nodes.length - 1];
    const base = this.tree.baseOf(path);
    const existing: T = node[base];
    const updated = updater(existing) as T|undefined;

    // Replace the value if a new value was returned.
    if (updated !== undefined) node[base] = updated;

    this.reposition(collection, path);
    return updated === undefined ? existing : updated;
  }

  /**
   * Ensures that a value is still in sorted order after being mutated.
   * In general, prefer using the "update" method instead.
   *
   * @param nodeInfo The return value of of calling lookupValuePath for the value being mutated.
   */
  ensureSortedOrderOfNode(collection: ISortedCollection<T>, nodeInfo: LookupNodeInfo<T>): void {
    const path: TreePath = {
      nodes: nodeInfo.parentPath.map(entry => entry.node),
      ranks: nodeInfo.parentPath.map(entry => entry.index),
    };
    // A handle built by hand (not by lookupValuePath) may carry a replacement.
    const node = path.nodes[path.nodes.length - 1];
    const base = this.tree.baseOf(path);
    if (node[base] !== nodeInfo.valueNode.value) node[base] = nodeInfo.valueNode.value;

    this.reposition(collection, path);
  }

  lookupValuePath(collection: ISortedCollection<T>, value: T): LookupNodeInfo<T>|undefined {
    const path = this.tree.find(collection.root, value);
    if (path === undefined) return;

    const node = path.nodes[path.nodes.length - 1];
    const base = this.tree.baseOf(path);
    return {
      // Reads and assignments go to the element's slot, so assigning a
      // replacement stores it, as with the wrapper nodes of earlier versions.
      valueNode: {
        get value(): T { return node[base]; },
        set value(value: T) { node[base] = value; },
      },
      parentPath: path.nodes.map((pathNode, i) => ({ node: pathNode, index: path.ranks[i] })),
    };
  }

  getFirst(collection: ISortedCollection<T>): T|undefined {
    return this.tree.edge(collection.root, false);
  }

  getLast(collection: ISortedCollection<T>): T|undefined {
    return this.tree.edge(collection.root, true);
  }

  remove(collection: ISortedCollection<T>, value: T): void {
    const path = this.tree.find(collection.root, value);
    if (path === undefined) return;

    this.setRoot(collection, this.tree.remove(collection.root, path));
    collection.size--;
  }

  /** Iterates in order. DO NOT add or remove items while iterating! */
  getIterable(collection: ISortedCollection<T>, direction: 'forward'|'backward' = 'forward'): Iterable<T> {
    return lazyIterable(() => this.tree.iterate(collection.root, direction === 'backward'));
  }

  /** Moves the element a path ends at if it is no longer between its neighbours. */
  private reposition(collection: ISortedCollection<T>, path: TreePath): void {
    if (this.tree.inOrder(path)) return;

    const value = path.nodes[path.nodes.length - 1][this.tree.baseOf(path)];
    this.setRoot(collection, this.tree.remove(collection.root, path));
    this.setRoot(collection, this.tree.insert(collection.root, value));
  }

  private setRoot(collection: ISortedCollection<T>, root: IBTreeNode<T>): void {
    // An unchanged root must not be reassigned: Immer would copy the collection.
    if (collection.root !== root) collection.root = root;
  }
}
