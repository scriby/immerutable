import {Key} from './map';
import {ISortedMap, SortedMapAdapter} from './sortedmap';
import {createReadonlyMap, createReadonlySet, mapIterable} from './util';

/**
 * An LRU cache is a sorted map from each key to its value and the order of
 * its last use, sorted by that order.
 */
export interface ILruCache<K, V> extends ISortedMap<K, ILruEntry<V>> {
  nextOrder: number;
}

interface ILruEntry<V> {
  value: V;
  order: number;
}

export class LruCacheAdapter<K extends Key, V> {
  private evictionThreshold: number;
  private sortedMapAdapter = new SortedMapAdapter<K, ILruEntry<V>, number>({
    getOrderingKey: (entry) => entry.order,
    orderComparer: (a, b) => a - b,
  });

  /**
   * Create a new LRU Cache adapter.
   * @param suggestedSize The max suggested # of entries for the LRU Cache to store. Up to 10% more than the provided
   *                      number may be stored. A size of zero retains no entries.
   */
  constructor(private suggestedSize: number) {
    this.evictionThreshold = Math.floor(suggestedSize * 1.1);
  }

  create(): ILruCache<K, V> {
    return { ...this.sortedMapAdapter.create(), nextOrder: 0 };
  }

  set(lru: ILruCache<K, V>, key: K, value: V): void {
    this.sortedMapAdapter.set(lru, key, { value, order: lru.nextOrder++ });

    // With Immer, it's more efficient to do multiple removals at once, so we store up to 10% extra entries
    // and then remove them all at once.
    if (this.getSize(lru) > this.evictionThreshold) {
      const count = this.getSize(lru) - Math.floor(this.suggestedSize);
      // The sorted map's index is persistent, so this iterator stays valid while entries are removed.
      const oldest = this.sortedMapAdapter.getKeysIterable(lru)[Symbol.iterator]();
      for (let i = 0; i < count; i++) this.sortedMapAdapter.remove(lru, oldest.next().value);
    }
  }

  get(lru: ILruCache<K, V>, key: K): V|undefined {
    const entry = this.sortedMapAdapter.update(lru, key, (entry) => { entry.order = lru.nextOrder++; }) as ILruEntry<V>|undefined;
    return entry === undefined ? undefined : entry.value;
  }

  peek(lru: ILruCache<K, V>, key: K): V|undefined {
    const entry = this.sortedMapAdapter.get(lru, key);
    return entry === undefined ? undefined : entry.value;
  }

  has(lru: ILruCache<K, V>, key: K): boolean {
    return this.sortedMapAdapter.has(lru, key);
  }

  /** Iterates from least to most recently used. DO NOT add or remove items while iterating! */
  getIterable(lru: ILruCache<K, V>): Iterable<[K, V]> {
    return mapIterable(this.sortedMapAdapter.getIterable(lru), ([key, entry]) => [key, entry.value] as [K, V]);
  }

  getValuesIterable(lru: ILruCache<K, V>): Iterable<V> {
    return mapIterable(this.sortedMapAdapter.getValuesIterable(lru), (entry) => entry.value);
  }

  getKeysIterable(lru: ILruCache<K, V>): Iterable<K> {
    return this.sortedMapAdapter.getKeysIterable(lru);
  }

  update(lru: ILruCache<K, V>, key: K, updater: (item: V) => V|void): V|undefined {
    const entry = this.sortedMapAdapter.update(lru, key, (entry) => {
      const updated = updater(entry.value) as V|undefined;
      if (updated !== undefined) entry.value = updated;
      entry.order = lru.nextOrder++;
    }) as ILruEntry<V>|undefined;
    return entry === undefined ? undefined : entry.value;
  }

  getSize(lru: ILruCache<K, V>): number {
    return this.sortedMapAdapter.getSize(lru);
  }

  remove(lru: ILruCache<K, V>, key: K): void {
    this.sortedMapAdapter.remove(lru, key);
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
}
