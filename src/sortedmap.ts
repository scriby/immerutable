import {IMap, MapAdapter} from './map';
import {Comparer, ISortedCollection, LookupNodeInfo, SortedCollectionAdapter} from './sortedcollection';
import {iterableToIterableIterator, mapIterable, sameValueZero} from './util';

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

// Keep entry handles inside adapter composition rather than exposing them on
// the public MapAdapter API. This avoids a second lookup to distinguish a
// missing key from an existing undefined value (especially during insertion).
class SortedMapStorageAdapter<K extends Key, V> extends MapAdapter<K, V> {
  findEntry(map: IMap<K, V>, key: K) {
    return this.lookupEntry(map, key);
  }
}

export class SortedMapAdapter<K extends Key, V, O=any> {
  private getOrderingKey: GetOrderingKey<V, O>;
  private mapAdapter = new SortedMapStorageAdapter<K, V>();
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
      equalityComparer: (a, b) => sameValueZero(a.key, b.key),
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

  getIterable(sortedMap: ISortedMap<K, V, O>, direction: 'forward'|'backward' = 'forward'): Iterable<[K, V]> {
    return mapIterable(this.sortedCollectionAdapter.getIterable(sortedMap.sortedCollection, direction), (item) => {
      return [ item.key, this.mapAdapter.get(sortedMap.map, item.key)! ] as [K, V];
    });
  }

  getValuesIterable(sortedMap: ISortedMap<K, V, O>, direction: 'forward'|'backward' = 'forward'): Iterable<V> {
    return mapIterable(this.sortedCollectionAdapter.getIterable(sortedMap.sortedCollection, direction), (item) => {
      return this.mapAdapter.get(sortedMap.map, item.key)!;
    });
  }

  getKeysIterable(sortedMap: ISortedMap<K, V, O>): Iterable<K> {
    return mapIterable(this.sortedCollectionAdapter.getIterable(sortedMap.sortedCollection), (item) => {
      return item.key;
    });
  }

  set(sortedMap: ISortedMap<K, V, O>, key: K, value: V): void {
    const existing = this.mapAdapter.findEntry(sortedMap.map, key);

    if (existing === undefined) {
      this.sortedCollectionAdapter.insert(sortedMap.sortedCollection, { key, order: this.getOrderingKey(value) });
      this.mapAdapter.set(sortedMap.map, key, value);
    } else {
      const node = this.lookupSortedNode(sortedMap, key, existing.value);
      // Assignment is unconditional, including undefined. It must not use the
      // updater callback's undefined-means-no-replacement convention.
      this.mapAdapter.set(sortedMap.map, key, value);
      this.updateSortedOrder(sortedMap, node, value);
    }
  }

  remove(sortedMap: ISortedMap<K, V, O>, key: K): void {
    const existing = this.mapAdapter.findEntry(sortedMap.map, key);
    if (existing === undefined) return;

    this.sortedCollectionAdapter.remove(sortedMap.sortedCollection, { key: key, order: this.getOrderingKey(existing.value) });
    this.mapAdapter.remove(sortedMap.map, key);
  }

  update(sortedMap: ISortedMap<K, V, O>, key: K, updater: (item: V) => V|void): void|V {
    const existing = this.mapAdapter.findEntry(sortedMap.map, key);
    if (existing === undefined) return;

    const previousValue = existing.value;
    const node = this.lookupSortedNode(sortedMap, key, previousValue);
    const updated = updater(previousValue) as V|undefined;

    if (updated !== undefined) {
      this.mapAdapter.set(sortedMap.map, key, updated);
    }

    const value = updated === undefined ? previousValue : updated;
    this.updateSortedOrder(sortedMap, node, value);
    return value;
  }

  private lookupSortedNode(sortedMap: ISortedMap<K, V, O>, key: K, value: V): LookupNodeInfo<IKeyWithOrder<K, O>> {
    const existingSorted = this.sortedCollectionAdapter.lookupValuePath(
      sortedMap.sortedCollection,
      { key, order: this.getOrderingKey(value) },
    );

    if (existingSorted === undefined) {
      throw new Error(`Key ${key} not found in sorted collection`);
    }

    return existingSorted;
  }

  private updateSortedOrder(sortedMap: ISortedMap<K, V, O>, node: LookupNodeInfo<IKeyWithOrder<K, O>>, value: V): void {
    const order = this.getOrderingKey(value);
    const changed = !sameValueZero(node.valueNode.value.order, order);
    if (changed) node.valueNode.value.order = order;
    // A mutable ordering object can change in place without changing identity.
    // Primitive keys retain the no-reordering fast path.
    if (changed || (order !== null && (typeof order === 'object' || typeof order === 'function'))) {
      this.sortedCollectionAdapter.ensureSortedOrderOfNode(sortedMap.sortedCollection, node);
    }
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

  asReadonlyMap(sortedMap: ISortedMap<K, V, O>): ReadonlyMap<K, V> {
    const adapter = this;
    const readonlyMap: ReadonlyMap<K, V> = {
      [Symbol.iterator]: () => iterableToIterableIterator(this.getIterable(sortedMap))[Symbol.iterator](),
      entries: () => iterableToIterableIterator(this.getIterable(sortedMap)),
      keys: () => iterableToIterableIterator(this.getKeysIterable(sortedMap)),
      values: () => iterableToIterableIterator(this.getValuesIterable(sortedMap)),
      forEach: (callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: any) => {
        const iterator = readonlyMap.entries();
        while (true) {
          const next = iterator.next();
          if (next.done) break;
          callbackfn.call(thisArg, next.value[1], next.value[0], readonlyMap);
        }
      },
      get: (key: K) => this.get(sortedMap, key),
      has: (key: K) => this.has(sortedMap, key),
      get size() { return adapter.getSize(sortedMap); },
    };

    return readonlyMap;
  }

  keysAsReadonlySet(sortedMap: ISortedMap<K, V, O>): ReadonlySet<K> {
    const adapter = this;
    const readonlySet: ReadonlySet<K> = {
      [Symbol.iterator]: () => iterableToIterableIterator(this.getKeysIterable(sortedMap))[Symbol.iterator](),
      entries: () => iterableToIterableIterator(mapIterable(this.getKeysIterable(sortedMap), (key) => [key, key] as [K, K])),
      keys: () => iterableToIterableIterator(this.getKeysIterable(sortedMap)),
      values: () => iterableToIterableIterator(this.getKeysIterable(sortedMap)),
      forEach: (callbackfn: (value: K, key: K, set: ReadonlySet<K>) => void, thisArg?: any) => {
        const iterator = readonlySet.keys();
        while (true) {
          const next = iterator.next();
          if (next.done) break;
          callbackfn.call(thisArg, next.value, next.value, readonlySet);
        }
      },
      has: (key: K) => this.has(sortedMap, key),
      get size() { return adapter.getSize(sortedMap); },
    };

    return readonlySet;
  }
}
