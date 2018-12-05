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

  getIterable(lru: ILruCache<K, V>): IterableIterator<[K, V]> {
    return iterableToIterableIterator({
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
    });
  }

  getValuesIterable(lru: ILruCache<K, V>): IterableIterator<V> {
    return iterableToIterableIterator(mapIterable(this.getIterable(lru), (entry) => entry[1]));
  }

  getKeysIterable(lru: ILruCache<K, V>): IterableIterator<K> {
    return iterableToIterableIterator(mapIterable(this.getIterable(lru), (entry) => entry[0]));
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

  private getNextOrder(lru: ILruCache<K, V>): number {
    return lru.nextOrder++;
  }
}