import {IMap, MapAdapter} from './map';
import {Comparer, IBTree, SortedCollectionAdapter} from './sortedcollection';

export type Key = string | number;

export interface ISortedSet<K, V> {
  map: IMap<K, V>,
  sortedCollection: IBTree<K>,
}

export class SortedSetAdapter<K extends Key, V> {
  private mapAdapter = new MapAdapter<K, V>();
  private sortedCollectionAdapter: SortedCollectionAdapter<K>;

  constructor(private comparer: Comparer<K>) {
    this.sortedCollectionAdapter = new SortedCollectionAdapter({ comparer });
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

  set(sortedSet: ISortedSet<K, V>, key: K, value: V): void {
    const exists = this.mapAdapter.has(sortedSet.map, key);

    if (!exists) {
      this.sortedCollectionAdapter.insert(sortedSet.sortedCollection, key);
    }

    this.mapAdapter.set(sortedSet.map, key, value);
  }

  update(sortedSet: ISortedSet<K, V>, key: K, updater: (item: V) => V|void): void {
    const existing = this.mapAdapter.get(sortedSet.map, key);
    if (!existing) return;

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
}