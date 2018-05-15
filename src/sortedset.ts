import {IMap, MapAdapter} from './map';
import {Comparer, IBTree, SortedCollectionAdapter} from './sortedcollection';
import {shallowCopy} from './util';

export type Key = string | number;

export interface ISortedSet<K, V> {
  map: IMap<K, V>,
  sortedCollection: IBTree<V>,
}

export class SortedSetAdapter<K extends Key, V> {
  private mapAdapter = new MapAdapter<K, V>();
  private sortedCollectionAdapter: SortedCollectionAdapter<V>;

  constructor(private comparer: Comparer<V>) {
    this.sortedCollectionAdapter = new SortedCollectionAdapter({ comparer });
  }

  create(): ISortedSet<K, V> {
    return {
      map: this.mapAdapter.create(),
      sortedCollection: this.sortedCollectionAdapter.create(),
    };
  }

  set(sortedSet: ISortedSet<K, V>, key: K, value: V): void {
    const exists = this.mapAdapter.has(sortedSet.map, key);

    if (!exists) {
      this.sortedCollectionAdapter.insert(sortedSet.sortedCollection, value);
    }

    this.mapAdapter.set(sortedSet.map, key, value);
  }

  update(sortedSet: ISortedSet<K, V>, key: K, value: V, updater: (item: V) => V|void|undefined) {
    throw new Error('Not Implemented');
    /*const positionChanged = this.comparer(beforeUpdate, afterUpdate!) !== 0;

    if (positionChanged) {
      //Remove from sortedCollection and re-insert
    }*/
  }

  getSize(sortedSet: ISortedSet<K, V>): number {
    return this.mapAdapter.getSize(sortedSet.map);
  }
}