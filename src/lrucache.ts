import {ISortedMap, Key, SortedMapAdapter} from './sortedmap';
import {iterableToIterableIterator, mapIterable} from './util';

export interface ILruCache<K, V> extends ISortedMap<K, LruWrapper<V>> {
  nextOrder: number;
}

interface LruWrapper<V> {
  value: V;
  order: number;
}

export class LruCacheAdapter<K extends Key, V> {
  private sortedMapAdapter = new SortedMapAdapter<K, LruWrapper<V>, number>({
    getOrderingKey: (item) => item.order
  });

  /**
   * Create a new LRU Cache adapter.
   * @param suggestedSize The max suggested # of entries for the LRU Cache to store. Up to 10% more than the provided
   *                      number may be stored.
   */
  constructor(private suggestedSize: number) {}

  create(): ILruCache<K, V> {
    return {
      ...this.sortedMapAdapter.create(),
      nextOrder: 0,
    };
  }

  set(lru: ILruCache<K, V>, key: K, value: V): void {
    this.sortedMapAdapter.set(lru, key, { value, order: this.getNextOrder(lru) });

    // With Immer, it's more efficient to do multiple removals at once, so we store up to 10% extra entries
    // and then remove them all at once.
    if (this.getSize(lru) > this.suggestedSize * 1.1) {
      const iterable = this.sortedMapAdapter.getIterable(lru)[ Symbol.iterator ]();

      do {
        const oldestKey = iterable.next().value[0];

        this.sortedMapAdapter.remove(lru, oldestKey);
      } while (this.getSize(lru) > this.suggestedSize);
    }
  }

  get(lru: ILruCache<K, V>, key: K): V|undefined {
    const existing = this.sortedMapAdapter.update(lru, key, (item) => {
      item.order = this.getNextOrder(lru);
    }) as LruWrapper<V>|undefined;

    return existing && existing.value;
  }

  peek(lru: ILruCache<K, V>, key: K): V|undefined {
    const existing = this.sortedMapAdapter.get(lru, key);

    return existing && existing.value;
  }

  has(lru: ILruCache<K, V>, key: K): boolean {
    return this.sortedMapAdapter.has(lru, key);
  }

  getIterable(lru: ILruCache<K, V>): Iterable<[K, V]> {
    return {
      [Symbol.iterator]: () => {
        const sortedIterable = this.sortedMapAdapter.getIterable(lru)[Symbol.iterator]();

        return {
          next: () => {
            const next = sortedIterable.next();

            if (next.done) {
              return { value: undefined as any, done: true };
            } else {
              return { value: [next.value[0], next.value[1].value], done: false };
            }
          }
        };
      }
    };
  }

  getValuesIterable(lru: ILruCache<K, V>): Iterable<V> {
    return mapIterable(this.getIterable(lru), (entry) => entry[1]);
  }

  getKeysIterable(lru: ILruCache<K, V>): Iterable<K> {
    return mapIterable(this.getIterable(lru), (entry) => entry[0]);
  }

  update(lru: ILruCache<K, V>, key: K, updater: (item: V) => V|void): V|undefined {
    const updated = this.sortedMapAdapter.update(lru, key, (item) => {
      const updated = updater(item.value);

      if (updated) {
        item.value = updated;
      }

      item.order = this.getNextOrder(lru);
    }) as LruWrapper<V>|undefined;

    return updated && updated.value;
  }

  getSize(lru: ILruCache<K, V>): number {
    return this.sortedMapAdapter.getSize(lru);
  }

  remove(lru: ILruCache<K, V>, key: K): void {
    return this.sortedMapAdapter.remove(lru, key);
  }

  asReadonlyMap(lru: ILruCache<K, V>): ReadonlyMap<K, V> {
    const readonlyMap: ReadonlyMap<K, V> = {
      [Symbol.iterator]: () => iterableToIterableIterator(this.getIterable(lru))[Symbol.iterator](),
      entries: () => iterableToIterableIterator(this.getIterable(lru)),
      keys: () => iterableToIterableIterator(this.getKeysIterable(lru)),
      values: () => iterableToIterableIterator(this.getValuesIterable(lru)),
      forEach: (callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: any) => {
        const iterator = readonlyMap.entries();
        while (true) {
          const next = iterator.next();
          if (next.done) break;
          callbackfn.call(thisArg, next.value[1], next.value[0], readonlyMap);
        }
      },
      get: (key: K) => this.peek(lru, key),
      has: (key: K) => this.has(lru, key),
      size: this.getSize(lru),
    };

    return readonlyMap;
  }

  keysAsReadonlySet(lru: ILruCache<K, V>): ReadonlySet<K> {
    const readonlySet: ReadonlySet<K> = {
      [Symbol.iterator]: () => iterableToIterableIterator(this.getKeysIterable(lru))[Symbol.iterator](),
      entries: () => iterableToIterableIterator(mapIterable(this.getKeysIterable(lru), (key) => [key, key] as [K, K])),
      keys: () => iterableToIterableIterator(this.getKeysIterable(lru)),
      values: () => iterableToIterableIterator(this.getKeysIterable(lru)),
      forEach: (callbackfn: (value: K, key: K, set: ReadonlySet<K>) => void, thisArg?: any) => {
        const iterator = readonlySet.keys();
        while (true) {
          const next = iterator.next();
          if (next.done) break;
          callbackfn.call(thisArg, next.value, next.value, readonlySet);
        }
      },
      has: (key: K) =>  this.has(lru, key),
      size: this.getSize(lru),
    };

    return readonlySet;
  }

  private getNextOrder(lru: ILruCache<K, V>): number {
    return lru.nextOrder++;
  }
}
