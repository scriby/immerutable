import {EntryMapAdapter, IMap, ISingleValueNode, Key} from './map';
import {checkLayout} from './slots';
import {ISortedIndexNode, SortedIndex} from './sortedindex';
import {createReadonlyMap, createReadonlySet, lazyIterable, readWhole, sameValueZero} from './util';

/**
 * An LRU cache is a map from each key to its value (its own `root` and
 * `size`), plus two indexes that are never read or changed through Immer
 * drafts (see sortedindex.ts):
 * `tree` holds the keys in order of last use, and `uses` holds each key's
 * position in that order. Using an entry therefore changes only the indexes;
 * the entry itself is not written.
 */
export interface ILruCache<K, V> extends IMap<K, V> {
  'tree': ISortedIndexNode;
  'uses': ISortedIndexNode;
  nextOrder: number;
}

const MAX_ITEMS_PER_LEVEL = 32;

/**
 * Where a key sorts in the `uses` index, before its value is compared. JSON
 * turns NaN and the infinities into null, so those keys come first, and a
 * null (which is what they are restored as) before them: entries restored
 * from JSON are then still in order, and the other keys can still be found.
 */
function keyClass(key: Key|null): number {
  if (key === null) return 0;
  if (typeof key === 'string') return 5;
  return key !== key ? 1 : key === -Infinity ? 2 : key === Infinity ? 3 : 4;
}

function compareUsedKeys(a: Key, b: Key): number {
  const classes = keyClass(a) - keyClass(b);
  if (classes !== 0 || a === b) return classes;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** An update call whose updater is running. */
interface UpdateInProgress {
  lru: object;
  key: Key;
  /** The entry found for the key before the updater ran. */
  entry: ISingleValueNode<any, any>;
  /**
   * Set once the updater has set the key again: the value that entry had
   * then, which is all that is left of it. The entry itself now carries the
   * new value (or has been replaced by a new one), and belongs to that set.
   */
  detached?: {value: any};
}

/**
 * The update calls in progress, innermost last. An updater may change the
 * cache it is updating, and update has to know whether that gave its key a
 * new entry (see update).
 */
const updatesInProgress: UpdateInProgress[] = [];

/**
 * Called before the key is set: the updates in progress on its entry stop
 * working on it, and share what is left of it.
 */
function entryReplaced(lru: object, key: Key): void {
  let detached: {value: any}|undefined;
  for (let i = 0; i < updatesInProgress.length; i++) {
    const update = updatesInProgress[i];
    if (update.lru === lru && update.detached === undefined && sameValueZero(update.key, key)) {
      update.detached = detached || (detached = {value: update.entry.value});
    }
  }
}

export class LruCacheAdapter<K extends Key, V> {
  private evictionThreshold: number;
  private mapAdapter = new EntryMapAdapter<K, V>();
  /** (order of last use, key), sorted by order. */
  private recency = new SortedIndex<number>((a, b) => a - b, MAX_ITEMS_PER_LEVEL);
  /** (order of last use, key), sorted by key alone. */
  private uses = new SortedIndex<number>(() => 0, MAX_ITEMS_PER_LEVEL, compareUsedKeys);

  /**
   * Create a new LRU Cache adapter.
   * @param suggestedSize The max suggested # of entries for the LRU Cache to store. Up to 10% more than the provided
   *                      number may be stored. A size of zero retains no entries.
   */
  constructor(private suggestedSize: number) {
    this.evictionThreshold = Math.floor(suggestedSize * 1.1);
  }

  create(): ILruCache<K, V> {
    const map = this.mapAdapter.create();
    return { 'root': map['root'], size: map.size, 'tree': this.recency.empty(), 'uses': this.uses.empty(), nextOrder: 0 };
  }

  set(lru: ILruCache<K, V>, key: K, value: V): void {
    let tree = this.read(lru, 'tree');
    let uses = this.read(lru, 'uses');
    const order = lru.nextOrder;
    const replaced = this.uses.replaceOrder(uses, 0, key, order);
    // A cache restored from JSON may hold entries whose keys JSON could not
    // represent (see the eviction below). They are first in `uses`, under a
    // null key. Set again after further restores, such a key can find one of
    // those entries in the map, which the indexes do not have under this
    // key. As in version 3, that fails, before anything is changed.
    if (replaced === undefined && this.uses.edgeKey(uses, false) === null && this.mapAdapter.has(lru, key)) {
      throw new Error(`Key ${key} not found in the LRU cache's index`);
    }
    entryReplaced(lru, key);
    this.mapAdapter.set(lru, key, value);
    lru.nextOrder = order + 1;
    if (replaced === undefined) {
      tree = this.recency.insert(tree, order, key);
      uses = this.uses.insert(uses, order, key);
    } else {
      tree = this.recency.insert(this.recency.remove(tree, replaced.previous, key)!, order, key);
      uses = replaced.index;
    }

    // With Immer, it's more efficient to do multiple removals at once, so we store up to 10% extra entries
    // and then remove them all at once.
    if (lru.size > this.evictionThreshold) {
      // Their orders come from the index, so the evicted entries are not read.
      const {orders, keys} = this.recency.firstEntries(tree, lru.size - Math.floor(this.suggestedSize));
      for (let i = 0; i < keys.length; i++) {
        const size = lru.size;
        this.mapAdapter.remove(lru, keys[i] as K);
        // A key that JSON could not represent (NaN, an infinity) is restored
        // as null, and the map may not find its entry again. The entry then
        // stays, in the indexes too, so that they keep describing the map.
        if (lru.size === size) continue;
        tree = this.recency.remove(tree, orders[i], keys[i])!;
        uses = this.uses.remove(uses, 0, keys[i])!;
      }
    }
    this.write(lru, tree, uses);
  }

  get(lru: ILruCache<K, V>, key: K): V|undefined {
    const entry = this.mapAdapter.findEntry(lru, key);
    if (entry === undefined) return undefined;
    this.use(lru, key);
    return entry.value;
  }

  peek(lru: ILruCache<K, V>, key: K): V|undefined {
    return this.mapAdapter.get(lru, key);
  }

  has(lru: ILruCache<K, V>, key: K): boolean {
    return this.mapAdapter.has(lru, key);
  }

  /** Iterates from least to most recently used. DO NOT add or remove items while iterating! */
  getIterable(lru: ILruCache<K, V>): Iterable<[K, V]> {
    return this.iterable(lru, (key) => [key, this.mapAdapter.get(lru, key)!] as [K, V]);
  }

  getValuesIterable(lru: ILruCache<K, V>): Iterable<V> {
    return this.iterable(lru, (key) => this.mapAdapter.get(lru, key)!);
  }

  getKeysIterable(lru: ILruCache<K, V>): Iterable<K> {
    return this.iterable(lru, (key) => key);
  }

  /**
   * Updates an entry using an updater function, which may mutate the value or return a replacement, and makes the
   * entry the most recently used. Returns the current value, or undefined if the key is not present.
   *
   * The updater may itself get, set, update or remove entries of the same cache. If it sets or removes the key it
   * is updating, the cache is left as the updater left it: what the updater returns is not stored, and the key is
   * not used again. It must not replace the cache object, for example with the result of a nested producer.
   */
  update(lru: ILruCache<K, V>, key: K, updater: (item: V) => V|void): V|undefined {
    const entry = this.mapAdapter.findEntry(lru, key);
    if (entry === undefined) return undefined;
    const update: UpdateInProgress = {lru, key, entry};
    updatesInProgress.push(update);
    let updated: V|undefined;
    try {
      updated = updater(entry.value) as V|undefined;
    } finally {
      updatesInProgress.pop();
    }
    // The updater set the key again: the entry now belongs to that set. What
    // was the entry's value goes on receiving the results of the updates that
    // were working on it, for them to return.
    const detached = update.detached;
    if (detached !== undefined) {
      if (updated !== undefined) detached.value = updated;
      return detached.value;
    }
    // If the updater removed the key, the entry is no longer in the cache,
    // and neither storing in it nor using the key changes anything.
    if (updated !== undefined) entry.value = updated;
    this.use(lru, key);
    return entry.value;
  }

  getSize(lru: ILruCache<K, V>): number {
    return lru.size;
  }

  remove(lru: ILruCache<K, V>, key: K): void {
    const uses = this.read(lru, 'uses');
    const order = this.uses.storedOrder(uses, 0, key);
    if (order === undefined) return;
    const tree = this.read(lru, 'tree');
    const size = lru.size;
    this.mapAdapter.remove(lru, key);
    // As for eviction in set: an entry the map cannot find stays in the indexes too.
    if (lru.size === size) return;
    this.write(lru, this.recency.remove(tree, order, key)!, this.uses.remove(uses, 0, key)!);
  }

  asReadonlyMap(lru: ILruCache<K, V>): ReadonlyMap<K, V> {
    return createReadonlyMap<K, V>({
      entries: () => this.getIterable(lru),
      keys: () => this.getKeysIterable(lru),
      values: () => this.getValuesIterable(lru),
      get: (key) => this.peek(lru, key),
      has: (key) => this.has(lru, key),
      size: () => this.getSize(lru),
    });
  }

  keysAsReadonlySet(lru: ILruCache<K, V>): ReadonlySet<K> {
    return createReadonlySet<K>({
      keys: () => this.getKeysIterable(lru),
      has: (key) => this.has(lru, key),
      size: () => this.getSize(lru),
    });
  }

  private iterable<R>(lru: ILruCache<K, V>, project: (key: K) => R): Iterable<R> {
    return lazyIterable(() => this.recency.iterate(this.read(lru, 'tree'), false, project));
  }

  /** Makes key the most recently used. Changes nothing if the cache does not hold it (any more). */
  private use(lru: ILruCache<K, V>, key: K): void {
    const order = lru.nextOrder;
    const replaced = this.uses.replaceOrder(this.read(lru, 'uses'), 0, key, order);
    if (replaced === undefined) return;
    const tree = this.recency.remove(this.read(lru, 'tree'), replaced.previous, key)!;
    lru.nextOrder = order + 1;
    this.write(lru, this.recency.insert(tree, order, key), replaced.index);
  }

  private read(lru: ILruCache<K, V>, name: 'tree'|'uses'): ISortedIndexNode {
    // The names stay quoted everywhere, so that Closure keeps the ones that
    // readWhole looks up.
    const index = readWhole(lru, name);
    // A cache stored by version 3 or earlier has no 'uses' index.
    if (index === undefined) checkLayout(lru['root']);
    return index!;
  }

  private write(lru: ILruCache<K, V>, tree: ISortedIndexNode, uses: ISortedIndexNode): void {
    lru['tree'] = tree;
    lru['uses'] = uses;
  }
}
