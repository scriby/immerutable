import {BTree, IBTreeNode as IStorageNode, TreePath} from './btree';
import {readSlot, slotName} from './slots';
import {lazyIterable, originalOf, untouched} from './util';

/** A node of the collection's B-tree. Its layout is internal (see btree.ts). */
export interface IBTreeNode<T> extends IStorageNode {}

export interface ISortedCollection<T> {
  // Keep every access to 'root' quoted: untouched (util.ts) looks it up by
  // name, so a minifier must not rename it.
  'root': IBTreeNode<T>;
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

/** The default equality: the same object or value, where a draft counts as the object it is a draft of. */
function sameItem(a: unknown, b: unknown): boolean {
  return a === b || originalOf(a) === originalOf(b);
}

function identical(a: unknown, b: unknown): boolean {
  return a === b;
}

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
   * @param args.equalityComparer A function which tests a stored item against a value for equality. Optional (by
   *                              default, the same object or value, where an Immer draft counts as the object it is
   *                              a draft of). In a producer, the stored item it receives may be either the item in
   *                              the state the producer started with or a draft of it. Whatever the comparer, an
   *                              item is searched for by order first, so the value passed to update, remove or
   *                              lookupValuePath must have the item's current order.
   * @param args.maxItemsPerLevel Don't set this value; it is only available for use in unit testing.
   */
  constructor(args: {
    orderComparer: Comparer<T>,
    equalityComparer?: EqualityComparer<T>,
    maxItemsPerLevel?: number,
  }) {
    this.orderComparer = args.orderComparer;
    // An item and a draft of it are the same item: a search may read items
    // from the state a draft was created from, or through the draft (see find).
    this.equalityComparer = args.equalityComparer || sameItem;
    this.tree = new BTree<T>(this, args.maxItemsPerLevel || MAX_ITEMS_PER_LEVEL);
  }

  /**
   * Creates a new Immerutable Sorted Collection. This collection should be stored in the ngrx store.
   * It should not be modified or read from directly. All interaction with this collection should
   * happen through this adapter class.
   */
  create(): ISortedCollection<T> {
    return { 'root': this.tree.createRoot(), size: 0 };
  }

  /** Inserts an item into the collection in sorted order. */
  insert(collection: ISortedCollection<T>, value: T): void {
    // See find for the search root. It must be taken before the root is read.
    const searchRoot = untouched(collection, 'root');
    this.setRoot(collection, this.tree.insert(collection['root'], value, searchRoot));
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
    const path = this.find(collection, value);
    if (path === undefined) return;

    const node = path.nodes[path.nodes.length - 1];
    const base = this.tree.baseOf(path);
    const existing: T = readSlot(node, base);
    const updated = updater(existing) as T|undefined;

    // Replace the value if a new value was returned.
    if (updated !== undefined) node[slotName(base)] = updated;

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
    if (readSlot(node, base) !== nodeInfo.valueNode.value) node[slotName(base)] = nodeInfo.valueNode.value;

    this.reposition(collection, path);
  }

  lookupValuePath(collection: ISortedCollection<T>, value: T): LookupNodeInfo<T>|undefined {
    const path = this.find(collection, value);
    if (path === undefined) return;

    const node = path.nodes[path.nodes.length - 1];
    const base = this.tree.baseOf(path);
    return {
      // Reads and assignments go to the element's slot, so assigning a
      // replacement stores it, as with the wrapper nodes of earlier versions.
      valueNode: {
        get value(): T { return readSlot(node, base); },
        set value(value: T) { node[slotName(base)] = value; },
      },
      parentPath: path.nodes.map((pathNode, i) => ({ node: pathNode, index: path.ranks[i] })),
    };
  }

  getFirst(collection: ISortedCollection<T>): T|undefined {
    return this.tree.edge(collection['root'], false);
  }

  getLast(collection: ISortedCollection<T>): T|undefined {
    return this.tree.edge(collection['root'], true);
  }

  remove(collection: ISortedCollection<T>, value: T): void {
    const path = this.find(collection, value);
    if (path === undefined) return;

    this.setRoot(collection, this.tree.remove(collection['root'], path));
    collection.size--;
  }

  /** Iterates in order. DO NOT add or remove items while iterating! */
  getIterable(collection: ISortedCollection<T>, direction: 'forward'|'backward' = 'forward'): Iterable<T> {
    return lazyIterable(() => this.tree.iterate(collection['root'], direction === 'backward'));
  }

  /**
   * The path to the item equal to value, or undefined. Until something
   * reaches the tree through a draft, the search runs on the state the draft
   * was created from, where comparing items creates no drafts; only the nodes
   * on the path found are then drafted.
   */
  private find(collection: ISortedCollection<T>, value: T): TreePath|undefined {
    // The root is read (which drafts it) only if the original state cannot
    // be searched, or once an item is found there.
    const original = untouched(collection, 'root');
    if (original === undefined) return this.search(collection['root'], value);
    const path = this.search(original, value);
    return path === undefined ? undefined : this.tree.retrace(collection['root'], path);
  }

  private search(root: IBTreeNode<T>, value: T): TreePath|undefined {
    if (this.equalityComparer !== sameItem) return this.tree.find(root, value);
    // The same object may be stored more than once, and each occurrence has
    // its own draft: prefer the occurrence that is the very value given.
    // Either side may be a draft, whatever the root is: a root created in an
    // outer producer is a plain object that holds that producer's drafts.
    return this.tree.find(root, value, identical) || this.tree.find(root, value);
  }

  /** Moves the element a path ends at if it is no longer between its neighbours. */
  private reposition(collection: ISortedCollection<T>, path: TreePath): void {
    if (this.tree.inOrder(path)) return;

    const value = readSlot(path.nodes[path.nodes.length - 1], this.tree.baseOf(path));
    this.setRoot(collection, this.tree.remove(collection['root'], path));
    this.setRoot(collection, this.tree.insert(collection['root'], value));
  }

  private setRoot(collection: ISortedCollection<T>, root: IBTreeNode<T>): void {
    // An unchanged root must not be reassigned: Immer would copy the collection.
    if (collection['root'] !== root) collection['root'] = root;
  }
}
