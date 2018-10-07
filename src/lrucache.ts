import {ISortedMap, Key, SortedMapAdapter} from './sortedmap';

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

  constructor(private maxSize: number) {}

  create(): ILruCache<K, V> {
    return {
      ...this.sortedMapAdapter.create(),
      nextOrder: 0,
    };
  }

  set(lru: ILruCache<K, V>, key: K, value: V): void {
    this.sortedMapAdapter.set(lru, key, { value, order: this.getNextOrder(lru) });

    if (this.getSize(lru) > this.maxSize) {
      const oldestKey = this.sortedMapAdapter.getIterable(lru)[Symbol.iterator]().next().value.key;

      this.sortedMapAdapter.remove(lru, oldestKey);
    }
  }

  get(lru: ILruCache<K, V>, key: K): V|undefined {
    const existing = this.sortedMapAdapter.update(lru, key, (item) => {
      item.order = this.getNextOrder(lru);
    }) as LruWrapper<V>|undefined;

    return existing && existing.value;
  }

  getIterable(lru: ILruCache<K, V>): Iterable<{ key: K, value: V }> {
    return {
      [Symbol.iterator]: () => {
        const sortedIterable = this.sortedMapAdapter.getIterable(lru)[Symbol.iterator]();

        return {
          next: () => {
            const next = sortedIterable.next();

            if (next.done) {
              return { value: undefined as any, done: true };
            } else {
              return { value: { key: next.value.key, value: next.value.value.value }, done: false };
            }
          }
        };
      }
    }
  }

  getValuesIterable(lru: ILruCache<K, V>): Iterable<{ key: K, value: V }> {
    return {
      [Symbol.iterator]: () => {
        const sortedIterable = this.sortedMapAdapter.getIterable(lru)[Symbol.iterator]();

        return {
          next: () => {
            const next = sortedIterable.next();

            if (next.done) {
              return { value: undefined as any, done: true };
            } else {
              return { value: next.value.value.value, done: false };
            }
          }
        };
      }
    }
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