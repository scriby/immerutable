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

  create(): ISortedSet<K, V, O> {
    return {
      map: this.mapAdapter.create(),
      sortedCollection: this.sortedCollectionAdapter.create(),
    };
  }

  get(sortedSet: ISortedSet<K ,V, O>, key: K): V|undefined {
    return this.mapAdapter.get(sortedSet.map, key);
  }

  getIterable(sortedSet: ISortedSet<K, V, O>): Iterable<{ key: K, value: V }> {
    return {
      [Symbol.iterator]: () => {
        const sortedIterable = this.sortedCollectionAdapter.getIterable(sortedSet.sortedCollection)[Symbol.iterator]();

        return {
          next: () => {
            const next = sortedIterable.next();

            if (next.done) {
              return { value: undefined as any, done: true };
            } else {
              return { value: { key: next.value.key, value: this.mapAdapter.get(sortedSet.map, next.value.key)! }, done: false };
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

  remove(sortedSet: ISortedSet<K, V, O>, key: K): void {
    const existing = this.mapAdapter.get(sortedSet.map, key);
    if (existing === undefined) return;

    this.sortedCollectionAdapter.remove(sortedSet.sortedCollection, { key: key, order: this.getOrderingKey(existing) });
    this.mapAdapter.remove(sortedSet.map, key);
  }

  update(sortedSet: ISortedSet<K, V, O>, key: K, updater: (item: V) => V|void): void {
    const existing = this.mapAdapter.get(sortedSet.map, key);
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

  getFirst(sortedSet: ISortedSet<K, V, O>): V|undefined {
    const firstKeyWithOrder = this.sortedCollectionAdapter.getFirst(sortedSet.sortedCollection);
    if (firstKeyWithOrder === undefined) return;

    return this.mapAdapter.get(sortedSet.map, firstKeyWithOrder.key);
  }

  getLast(sortedSet: ISortedSet<K, V, O>): V|undefined {
    const lastKeyWithOrder = this.sortedCollectionAdapter.getLast(sortedSet.sortedCollection);
    if (lastKeyWithOrder === undefined) return;

    return this.mapAdapter.get(sortedSet.map, lastKeyWithOrder.key);
  }
}