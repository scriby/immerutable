import {IMap, MapAdapter} from './map';
import {Comparer, IBTree, SortedCollectionAdapter} from './sortedcollection';

export type Key = string | number;

export interface ISortedSet<K, V> {
  map: IMap<K, V>,
  sortedCollection: IBTree<K>,
}

export class SortedSetAdapter<K extends Key, V> {
  private comparer: Comparer<V>;
  private mapAdapter = new MapAdapter<K, V>();
  private sortedCollectionAdapter: SortedCollectionAdapter<K>;

  constructor(args: { comparer: Comparer<V> }) {
    this.comparer = args.comparer;
    this.sortedCollectionAdapter = new SortedCollectionAdapter({ comparer: () => 0 });
  }

  create(): ISortedSet<K, V> {
    return {
      map: this.mapAdapter.create(),
      sortedCollection: this.sortedCollectionAdapter.create(),
    };
  }

  get(sortedSet: ISortedSet<K ,V>, key: K): V|undefined {
    return this.mapAdapter.get(sortedSet.map, key);
  }

  getIterable(sortedSet: ISortedSet<K, V>): Iterable<V> {
    return {
      [Symbol.iterator]: () => {
        const sortedIterable = this.sortedCollectionAdapter.getIterable(sortedSet.sortedCollection)[Symbol.iterator]();

        return {
          next: () => {
            const next = sortedIterable.next();

            if (next.done) {
              return { value: {} as V, done: true };
            } else {
              return { value: this.mapAdapter.get(sortedSet.map, next.value)!, done: false };
            }
          }
        };
      }
    }
  }

  set(sortedSet: ISortedSet<K, V>, key: K, value: V): void {
    const exists = this.mapAdapter.has(sortedSet.map, key);
    this.mapAdapter.set(sortedSet.map, key, value);

    if (!exists) {
      this.sortedCollectionAdapter.comparer = this.getComparer(sortedSet);
      this.sortedCollectionAdapter.insert(sortedSet.sortedCollection, key);
    }
  }

  update(sortedSet: ISortedSet<K, V>, key: K, updater: (item: V) => V|void): void {
    const existing = this.mapAdapter.get(sortedSet.map, key);
    if (!existing) return;

    this.sortedCollectionAdapter.comparer = this.getComparer(sortedSet);
    const existingSorted = this.sortedCollectionAdapter.lookupValuePath(sortedSet.sortedCollection, key);

    if (existingSorted === undefined) {
      throw new Error(`Key ${key} not found in sorted collection`);
    }

    const updated = updater(existing);

    if (updated !== undefined) {
      this.mapAdapter.set(sortedSet.map, key, updated);
    }

    this.sortedCollectionAdapter.ensureSortedOrderOfNode(sortedSet.sortedCollection, existingSorted);
  }

  getSize(sortedSet: ISortedSet<K, V>): number {
    return this.mapAdapter.getSize(sortedSet.map);
  }

  private getComparer(sortedSet: ISortedSet<K, V>) {
    return (a: K, b: K) => this.comparer(this.mapAdapter.get(sortedSet.map, a)!, this.mapAdapter.get(sortedSet.map, b)!);
  }
}