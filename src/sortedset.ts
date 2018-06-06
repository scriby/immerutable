import {IMap, MapAdapter} from './map';
import {Comparer, IBTree, SortedCollectionAdapter} from './sortedcollection';

export type Key = string | number;

export interface IKeyWithOrder<K, O> {
  key: K;
  order: O;
}

export interface ISortedSet<K, V, O> {
  map: IMap<K, V>,
  sortedCollection: IBTree<IKeyWithOrder<K, O>>,
}

export type GetOrderingKey<V, O> = (value: V) => O;

export class SortedSetAdapter<K extends Key, V, O> {
  private getOrderingKey: GetOrderingKey<V, O>;
  private mapAdapter = new MapAdapter<K, V>();
  private sortedCollectionAdapter: SortedCollectionAdapter<IKeyWithOrder<K, O>>;

  constructor(args: { getOrderingKey: GetOrderingKey<V, O> }) {
    this.getOrderingKey = args.getOrderingKey;
    this.sortedCollectionAdapter = new SortedCollectionAdapter({
      equalityComparer: (a, b) => a.key === b.key,
      orderComparer: (a, b) => a.order < b.order ? -1 : a.order > b.order ? 1 : 0,
    });
  }

  create(): ISortedSet<K, V, O> {
    return {
      map: this.mapAdapter.create(),
      sortedCollection: this.sortedCollectionAdapter.create(),
    };
  }

  get(sortedSet: ISortedSet<K ,V, O>, key: K): V|undefined {
    return this.mapAdapter.get(sortedSet.map, key);
  }

  getIterable(sortedSet: ISortedSet<K, V, O>): Iterable<V> {
    return {
      [Symbol.iterator]: () => {
        const sortedIterable = this.sortedCollectionAdapter.getIterable(sortedSet.sortedCollection)[Symbol.iterator]();

        return {
          next: () => {
            const next = sortedIterable.next();

            if (next.done) {
              return { value: {} as V, done: true };
            } else {
              return { value: this.mapAdapter.get(sortedSet.map, next.value.key)!, done: false };
            }
          }
        };
      }
    }
  }

  set(sortedSet: ISortedSet<K, V, O>, key: K, value: V): void {
    const exists = this.mapAdapter.has(sortedSet.map, key);
    this.mapAdapter.set(sortedSet.map, key, value);

    if (!exists) {
      this.sortedCollectionAdapter.insert(sortedSet.sortedCollection, { key, order: this.getOrderingKey(value) });
    }
  }

  update(sortedSet: ISortedSet<K, V, O>, key: K, updater: (item: V) => V|void): void {
    const existing = this.mapAdapter.get(sortedSet.map, key);console.log(existing)
    if (!existing) return;

    const existingSorted = this.sortedCollectionAdapter.lookupValuePath(
      sortedSet.sortedCollection,
      { key, order: this.getOrderingKey(existing) },
    );

    if (existingSorted === undefined) {
      throw new Error(`Key ${key} not found in sorted collection`);
    }

    const updated = updater(existing);

    if (updated !== undefined) {
      this.mapAdapter.set(sortedSet.map, key, updated);
    }

    existingSorted.valueNode.value.order = this.getOrderingKey(updated || existing);

    this.sortedCollectionAdapter.ensureSortedOrderOfNode(sortedSet.sortedCollection, existingSorted);
  }

  getSize(sortedSet: ISortedSet<K, V, O>): number {
    return this.mapAdapter.getSize(sortedSet.map);
  }
}