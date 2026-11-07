import {EntryMapAdapter, IMap} from './map';
import {Comparer} from './sortedcollection';
import {ISortedIndexNode, SortedIndex} from './sortedindex';
import {createReadonlyMap, createReadonlySet, currentOf, isDraft, lazyIterable, originalOf} from './util';

const freeze = Object.freeze;
const hasOwn = Object.prototype.hasOwnProperty;
const propertyIsEnumerable = Object.prototype.propertyIsEnumerable;
const defineProperty = Object.defineProperty;

export type Key = string | number;

export interface IKeyWithOrder<K, O> {
  key: K;
  order: O;
}

/**
 * A sorted map is a map (its own `root` and `size`) plus `tree`, an index of
 * (order, key) entries that Immer never drafts (see sortedindex.ts).
 */
export interface ISortedMap<K, V, O=any> extends IMap<K, V> {
  tree: ISortedIndexNode;
}

export type GetOrderingKey<V, O> = (value: V) => O;

// The index is not drafted, so node size only trades the copying each change
// does (path copying) against tree depth. 32 measured best for both.
const MAX_ITEMS_PER_LEVEL = 32;

// Relational operators treat undefined and NaN as equal to every value, which
// is not a consistent ordering and corrupts the index. Sort them last instead,
// as Array.prototype.sort does with undefined.
function defaultOrderComparer(a: any, b: any): number {
  const aUnordered = a === undefined || a !== a;
  const bUnordered = b === undefined || b !== b;
  if (aUnordered || bUnordered) return aUnordered === bUnordered ? 0 : aUnordered ? 1 : -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Reads the index without creating a draft of it. The index is persistent
 * (see sortedindex.ts): changes build a new version and assign it as a whole
 * (see writeTree), so Immer records them as one patch replacing the index.
 */
function readTree(sortedMap: ISortedMap<any, any>): ISortedIndexNode {
  // On a draft, a property descriptor carries the stored value, where a plain
  // read would create a draft of it. If something did draft it, nothing has
  // modified it (it is only ever replaced), so the draft's original is current.
  return originalOf(Object.getOwnPropertyDescriptor(sortedMap, 'tree')!.value);
}

/**
 * The ordering key to store, protected from later mutation where that is cheap:
 * an Immer draft is replaced by its current state (which shares unchanged
 * parts with the base state), and a frozen object, such as finished Immer
 * state, is stored as is. Other arrays and plain objects are copied deeply and
 * frozen, keeping their enumerable string and symbol properties, and Dates are
 * copied. Primitives and other objects are stored as is. Objects may therefore
 * still be shared with the caller; see isSharedOrder.
 */
export function snapshotOrder<O>(order: O): O {
  if (order === null || typeof order !== 'object') return order;
  if (isDraft(order)) return currentOf(order as any);
  if (Object.isFrozen(order)) return order;
  if (order instanceof Date) return new Date(order.getTime()) as any as O;
  let copy: any;
  if (Array.isArray(order)) {
    copy = order.map(snapshotOrder);
  } else {
    const prototype = Object.getPrototypeOf(order);
    if (prototype !== Object.prototype && prototype !== null) return order;
    copy = prototype === null ? Object.create(null) : {};
  }
  // For an array this adds any named properties alongside its elements.
  for (const property of Object.keys(order)) {
    if (hasOwn.call(copy, property)) continue;
    const value = snapshotOrder((order as any)[property]);
    // Assigning an own __proto__ property would set the prototype instead.
    if (property === '__proto__') defineProperty(copy, property, {value, enumerable: true, writable: true, configurable: true});
    else copy[property] = value;
  }
  for (const symbol of Object.getOwnPropertySymbols(order)) {
    if (propertyIsEnumerable.call(order, symbol)) copy[symbol] = snapshotOrder((order as any)[symbol]);
  }
  return freeze(copy);
}

/**
 * Whether a stored order may share an object with the caller's data (any
 * object or function may), so that mutating the caller's ordering key in
 * place can change the stored order too.
 */
function isSharedOrder(order: unknown): boolean {
  return order !== null && (typeof order === 'object' || typeof order === 'function');
}

/**
 * Counts index writes per sorted map (or draft of one), so update can tell
 * when its updater changed the same map's index.
 */
const indexWrites = new WeakMap<object, number>();

export class SortedMapAdapter<K extends Key, V, O=any> {
  private getOrderingKey: GetOrderingKey<V, O>;
  private orderComparer: Comparer<O>;
  private mapAdapter = new EntryMapAdapter<K, V>();
  private index: SortedIndex<O>;

  /**
   * @param args.getOrderingKey Returns the value an entry is sorted by. Entries with equal ordering keys are ordered by
   *                            map key. An object used as an ordering key may be kept by reference (Immer state and
   *                            other frozen objects are; unfrozen arrays, plain objects and Dates are copied), so it
   *                            may be mutated in place only inside an `update` callback for its own entry, and only
   *                            if no other entry's ordering key refers to it, or once its entry is removed or
   *                            replaced. A null ordering key is treated as undefined (sorted last by default).
   * @param args.orderComparer Compares two ordering keys (like Array.sort). Never receives null. Optional.
   * @param args.maxItemsPerLevel Don't set this value; it is only available for use in unit testing.
   */
  constructor(args: {
    getOrderingKey: GetOrderingKey<V, O>,
    orderComparer?: Comparer<O>,
    maxItemsPerLevel?: number,
  }) {
    this.getOrderingKey = args.getOrderingKey;
    this.orderComparer = args.orderComparer || defaultOrderComparer;
    this.index = new SortedIndex<O>(this.orderComparer, args.maxItemsPerLevel || MAX_ITEMS_PER_LEVEL);
  }

  create(): ISortedMap<K, V, O> {
    const map = this.mapAdapter.create();
    return { root: map.root, size: map.size, tree: this.index.empty() };
  }

  get(sortedMap: ISortedMap<K ,V, O>, key: K): V|undefined {
    return this.mapAdapter.get(sortedMap, key);
  }

  has(sortedMap: ISortedMap<K ,V, O>, key: K): boolean {
    return this.mapAdapter.has(sortedMap, key);
  }

  /** Iterates in order. DO NOT add or remove items while iterating! */
  getIterable(sortedMap: ISortedMap<K, V, O>, direction: 'forward'|'backward' = 'forward'): Iterable<[K, V]> {
    return lazyIterable(() => this.index.iterate(readTree(sortedMap), direction === 'backward', (key: K) => [key, this.mapAdapter.get(sortedMap, key)!] as [K, V]));
  }

  getValuesIterable(sortedMap: ISortedMap<K, V, O>, direction: 'forward'|'backward' = 'forward'): Iterable<V> {
    return lazyIterable(() => this.index.iterate(readTree(sortedMap), direction === 'backward', (key: K) => this.mapAdapter.get(sortedMap, key)!));
  }

  getKeysIterable(sortedMap: ISortedMap<K, V, O>): Iterable<K> {
    return lazyIterable(() => this.index.iterate(readTree(sortedMap), false, (key: K) => key));
  }

  set(sortedMap: ISortedMap<K, V, O>, key: K, value: V): void {
    const existing = this.mapAdapter.findEntry(sortedMap, key);

    if (existing === undefined) {
      const tree = readTree(sortedMap);
      this.writeTree(sortedMap, tree, this.index.insert(tree, this.orderOf(value), key));
      this.mapAdapter.set(sortedMap, key, value);
      return;
    }

    const previousValue = existing.value;
    const previousOrder = this.orderOf(previousValue);
    // Re-setting the same object may follow an in-place mutation of its
    // order, which would leave the index stale. Check before changing anything.
    if (previousValue === value && !this.index.contains(readTree(sortedMap), previousOrder, key)) {
      throw this.notFound(key);
    }
    // Move the index entry first, so a stale index throws before the value
    // changes. Assignment is unconditional, including undefined: it must not
    // use the updater callback's undefined-means-no-replacement convention.
    this.reorder(sortedMap, key, previousOrder, this.orderOf(value));
    existing.value = value;
  }

  remove(sortedMap: ISortedMap<K, V, O>, key: K): void {
    const existing = this.mapAdapter.findEntry(sortedMap, key);
    if (existing === undefined) return;

    // Update the index first, so a stale index throws before either half changes.
    const tree = readTree(sortedMap);
    const updated = this.index.remove(tree, this.orderOf(existing.value), key);
    if (updated === undefined) throw this.notFound(key);
    this.writeTree(sortedMap, tree, updated);
    this.mapAdapter.remove(sortedMap, key);
  }

  /**
   * Updates an entry using an updater function, which may mutate the value or return a replacement. Returns the
   * current value, or undefined if the key is not present. An updater that mutates the entry's ordering key in place
   * must not change the same sorted map before returning.
   */
  update(sortedMap: ISortedMap<K, V, O>, key: K, updater: (item: V) => V|void): void|V {
    const existing = this.mapAdapter.findEntry(sortedMap, key);
    if (existing === undefined) return;

    const previousValue = existing.value;
    // The updater may mutate the value (or its ordering key), so capture the order first.
    const previousOrder = this.orderOf(previousValue);
    // An object ordering key may be shared with the stored order, so the
    // updater could change both in place, hiding the entry. Take it out first.
    let tree: ISortedIndexNode|undefined;
    let without: ISortedIndexNode|undefined;
    if (isSharedOrder(previousOrder)) {
      tree = readTree(sortedMap);
      without = this.index.remove(tree, previousOrder, key);
      if (without === undefined) throw this.notFound(key);
    }
    const writes = indexWrites.get(sortedMap);

    const updated = updater(previousValue) as V|undefined;
    if (updated !== undefined) existing.value = updated;

    const value = updated === undefined ? previousValue : updated;
    if (indexWrites.get(sortedMap) !== writes) {
      // The updater changed this map's index (through an adapter), so `tree`,
      // `without` and previousOrder may be out of date. Rebuild from the map.
      this.writeTree(sortedMap, readTree(sortedMap), this.rebuildIndex(sortedMap));
    } else if (without !== undefined) {
      this.writeTree(sortedMap, tree!, this.index.insert(without, this.orderOf(value), key));
    } else {
      this.reorder(sortedMap, key, previousOrder, this.orderOf(value));
    }
    return value;
  }

  getSize(sortedMap: ISortedMap<K, V, O>): number {
    return sortedMap.size;
  }

  getFirst(sortedMap: ISortedMap<K, V, O>): V|undefined {
    const key = this.index.edgeKey(readTree(sortedMap), false) as K|undefined;
    return key === undefined ? undefined : this.mapAdapter.get(sortedMap, key);
  }

  getLast(sortedMap: ISortedMap<K, V, O>): V|undefined {
    const key = this.index.edgeKey(readTree(sortedMap), true) as K|undefined;
    return key === undefined ? undefined : this.mapAdapter.get(sortedMap, key);
  }

  asReadonlyMap(sortedMap: ISortedMap<K, V, O>): ReadonlyMap<K, V> {
    return createReadonlyMap<K, V>({
      entries: () => this.getIterable(sortedMap),
      keys: () => this.getKeysIterable(sortedMap),
      values: () => this.getValuesIterable(sortedMap),
      get: (key) => this.get(sortedMap, key),
      has: (key) => this.has(sortedMap, key),
      size: () => this.getSize(sortedMap),
    });
  }

  keysAsReadonlySet(sortedMap: ISortedMap<K, V, O>): ReadonlySet<K> {
    return createReadonlySet<K>({
      keys: () => this.getKeysIterable(sortedMap),
      has: (key) => this.has(sortedMap, key),
      size: () => this.getSize(sortedMap),
    });
  }

  /**
   * The order to index a value by. null is read as undefined: JSON turns an
   * undefined order stored in the index into null, so the two must be one order.
   */
  private orderOf(value: V): O {
    const orderingKey = this.getOrderingKey(value);
    return orderingKey === null ? undefined as any as O : snapshotOrder(orderingKey);
  }

  /**
   * Moves the index entry for key if its order changed. An unchanged order
   * skips the index, unless the stored order is an object other than the new
   * one: the caller may mutate that object once it is replaced.
   */
  private reorder(sortedMap: ISortedMap<K, V, O>, key: K, from: O, to: O): void {
    if (this.orderComparer(from, to) === 0 && (from === to || !isSharedOrder(from))) return;
    const tree = readTree(sortedMap);
    const updated = this.index.move(tree, from, to, key);
    if (updated === undefined) throw this.notFound(key);
    this.writeTree(sortedMap, tree, updated);
  }

  private rebuildIndex(sortedMap: ISortedMap<K, V, O>): ISortedIndexNode {
    let tree = this.index.empty();
    for (const [key, value] of this.mapAdapter.getIterable(sortedMap)) tree = this.index.insert(tree, this.orderOf(value), key);
    return tree;
  }

  private writeTree(sortedMap: ISortedMap<K, V, O>, before: ISortedIndexNode, after: ISortedIndexNode): void {
    indexWrites.set(sortedMap, (indexWrites.get(sortedMap) || 0) + 1);
    if (after !== before) sortedMap.tree = after;
  }

  private notFound(key: K): Error {
    return new Error(`Key ${key} not found in sorted collection`);
  }
}
