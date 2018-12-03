import {IMap, MapAdapter} from './map';
import {Comparer, ISortedCollection, SortedCollectionAdapter} from './sortedcollection';

export type Key = string | number;

export interface IKeyWithOrder<K, O> {
  key: K;
  order: O;
}

export interface ISortedMap<K, V, O=any> {
  map: IMap<K, V>,
  sortedCollection: ISortedCollection<IKeyWithOrder<K, O>>,
}

export type GetOrderingKey<V, O> = (value: V) => O;

export class SortedMapAdapter<K extends Key, V, O=any> {
  private getOrderingKey: GetOrderingKey<V, O>;
  private mapAdapter = new MapAdapter<K, V>();
  private sortedCollectionAdapter: SortedCollectionAdapter<IKeyWithOrder<K, O>>;

  constructor(args: {
    getOrderingKey: GetOrderingKey<V, O>,
    orderComparer?: Comparer<O>,
  }) {
    this.getOrderingKey = args.getOrderingKey;

    const orderComparer: Comparer<IKeyWithOrder<K, O>> = args.orderComparer ?
      (a, b) => args.orderComparer!(a.order, b.order) :
      (a, b) => a.order < b.order ? -1 : a.order > b.order ? 1 : 0;

    this.sortedCollectionAdapter = new SortedCollectionAdapter({
      equalityComparer: (a, b) => a.key === b.key,
      orderComparer,
    });
  }

  create(): ISortedMap<K, V, O> {
    return {
      map: this.mapAdapter.create(),
      sortedCollection: this.sortedCollectionAdapter.create(),
    };
  }

  get(sortedMap: ISortedMap<K ,V, O>, key: K): V|undefined {
    return this.mapAdapter.get(sortedMap.map, key);
  }

  has(sortedMap: ISortedMap<K ,V, O>, key: K): boolean {
    return this.mapAdapter.has(sortedMap.map, key);
  }

  getIterable(sortedMap: ISortedMap<K, V, O>, direction: 'forward'|'backward' = 'forward'): Iterable<{ key: K, value: V }> {
    return {
      [Symbol.iterator]: () => {
        const sortedIterable = this.sortedCollectionAdapter.getIterable(sortedMap.sortedCollection, direction)[Symbol.iterator]();

        return {
          next: () => {
            const next = sortedIterable.next();

            if (next.done) {
              return { value: undefined as any, done: true };
            } else {
              return { value: { key: next.value.key, value: this.mapAdapter.get(sortedMap.map, next.value.key)! }, done: false };
            }
          }
        };
      }
    }
  }

  getValuesIterable(sortedMap: ISortedMap<K, V, O>, direction: 'forward'|'backward' = 'forward'): Iterable<V> {
    return {
      [Symbol.iterator]: () => {
        const sortedIterable = this.sortedCollectionAdapter.getIterable(sortedMap.sortedCollection, direction)[Symbol.iterator]();

        return {
          next: () => {
            const next = sortedIterable.next();

            if (next.done) {
              return { value: undefined as any, done: true };
            } else {
              return { value: this.mapAdapter.get(sortedMap.map, next.value.key)!, done: false };
            }
          }
        };
      }
    }
  }

  set(sortedMap: ISortedMap<K, V, O>, key: K, value: V): void {
    const exists = this.mapAdapter.has(sortedMap.map, key);

    if (!exists) {
      this.sortedCollectionAdapter.insert(sortedMap.sortedCollection, { key, order: this.getOrderingKey(value) });
      this.mapAdapter.set(sortedMap.map, key, value);
    } else {
      this.update(sortedMap, key, () => value);
    }
  }

  remove(sortedMap: ISortedMap<K, V, O>, key: K): void {
    const existing = this.mapAdapter.get(sortedMap.map, key);
    if (existing === undefined) return;

    this.sortedCollectionAdapter.remove(sortedMap.sortedCollection, { key: key, order: this.getOrderingKey(existing) });
    this.mapAdapter.remove(sortedMap.map, key);
  }

  update(sortedMap: ISortedMap<K, V, O>, key: K, updater: (item: V) => V|void): void|V {
    const existing = this.mapAdapter.get(sortedMap.map, key);
    if (!existing) return;

    const existingSorted = this.sortedCollectionAdapter.lookupValuePath(
      sortedMap.sortedCollection,
      { key, order: this.getOrderingKey(existing) },
    );

    if (existingSorted === undefined) {
      throw new Error(`Key ${key} not found in sorted collection`);
    }

    const updated = updater(existing) as V|undefined;

    if (updated !== undefined) {
      this.mapAdapter.set(sortedMap.map, key, updated);
    }

    const updatedOrExisting = updated || existing;
    const updatedOrderingKey = this.getOrderingKey(updatedOrExisting);

    if (existingSorted.valueNode.value.order !== updatedOrderingKey) {
      existingSorted.valueNode.value.order = updatedOrderingKey;
      this.sortedCollectionAdapter.ensureSortedOrderOfNode(sortedMap.sortedCollection, existingSorted);
    }

    return updatedOrExisting;
  }

  getSize(sortedMap: ISortedMap<K, V, O>): number {
    // Sorted collection is used to retrieve the size to support the use case where the map may be shared between
    // multiple sorted collections.
    return this.sortedCollectionAdapter.getSize(sortedMap.sortedCollection);
  }

  getFirst(sortedMap: ISortedMap<K, V, O>): V|undefined {
    const firstKeyWithOrder = this.sortedCollectionAdapter.getFirst(sortedMap.sortedCollection);
    if (firstKeyWithOrder === undefined) return;

    return this.mapAdapter.get(sortedMap.map, firstKeyWithOrder.key);
  }

  getLast(sortedMap: ISortedMap<K, V, O>): V|undefined {
    const lastKeyWithOrder = this.sortedCollectionAdapter.getLast(sortedMap.sortedCollection);
    if (lastKeyWithOrder === undefined) return;

    return this.mapAdapter.get(sortedMap.map, lastKeyWithOrder.key);
  }
}