import {produce, produceWithPatches, applyPatches, enablePatches} from 'immer';
import {MapAdapter, SortedCollectionAdapter, SortedMapAdapter, LruCacheAdapter} from '../src';

function equal(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

enablePatches();
const map = new MapAdapter<number, number | undefined>();
const plain = map.create();
map.set(plain, 1, undefined);
map.set(plain, 1 + 2 ** 28, 2);
const restored = JSON.parse(JSON.stringify(plain));
equal(Array.from(map.getKeysIterable(restored)).sort((a, b) => a - b), [1, 1 + 2 ** 28]);

const sorted = new SortedMapAdapter<number, {order: {rank: number}}, {rank: number}>({
  getOrderingKey: value => value.order,
  orderComparer: (a, b) => a.rank - b.rank,
  maxItemsPerLevel: 4,
});
const base = produce(sorted.create(), draft => {
  for (let i = 0; i < 100; i++) sorted.set(draft, i, {order: {rank: i}});
});
const [next, patches, inverse] = produceWithPatches(base, draft => {
  // Draft the index and object ordering keys before asking the adapter to use
  // original/current. Both must work without a global CommonJS require.
  JSON.stringify(draft);
  sorted.update(draft, 5, value => { value.order.rank = 1000; });
  sorted.remove(draft, 6);
  sorted.set(draft, 200, {order: {rank: -1}});
});
const expected = [200, ...Array.from({length: 100}, (_, i) => i).filter(i => i !== 5 && i !== 6), 5];
equal(Array.from(sorted.getKeysIterable(next)), expected);
equal(Array.from(sorted.getKeysIterable(applyPatches(base, patches))), expected);
equal(Array.from(sorted.getKeysIterable(applyPatches(next, inverse))), Array.from({length: 100}, (_, i) => i));
const nested = produce({map: next}, outer => {
  outer.map = produce(outer.map, inner => {
    JSON.stringify(inner);
    const item = sorted.get(inner, 5)!;
    sorted.remove(inner, 5);
    sorted.set(inner, 300, item);
  });
});
equal(Array.from(sorted.getKeysIterable(nested.map)), [...expected.slice(0, -1), 300]);
equal(Array.from(sorted.getKeysIterable(base)), Array.from({length: 100}, (_, i) => i));

for (const view of [sorted.asReadonlyMap(next), sorted.keysAsReadonlySet(next)]) {
  for (const method of ['keys', 'values', 'entries', Symbol.iterator] as const) {
    const iterator: any = view[method]();
    if (iterator[Symbol.iterator]() !== iterator) throw new Error('Iterator must return itself');
    const values = Array.from(iterator);
    equal(Array.from(iterator), []);
    if (typeof iterator.toArray === 'function') equal((view[method]() as any).toArray(), values);
  }
}

const lru = new LruCacheAdapter<number, number>(10);
let cache = produce(lru.create(), draft => {
  for (let i = 0; i < 10; i++) lru.set(draft, i, i);
});
cache = produce(cache, draft => {
  lru.get(draft, 0);
  lru.set(draft, 10, 10);
  lru.set(draft, 11, 11);
});
equal(Array.from(lru.getKeysIterable(cache)), [3, 4, 5, 6, 7, 8, 9, 0, 10, 11]);
// The properties that are looked up by name, and the map's slots, must keep
// their names in stored state, whatever a minifier renames.
const storedCache = JSON.parse(JSON.stringify(cache));
for (const name of ['root', 'tree', 'uses']) {
  if (!Object.keys(storedCache).includes(name)) throw new Error(`Stored cache has no property named ${name}`);
}
if (!Object.keys(storedCache['root']).every(name => /^#[0-9a-f]$/.test(name))) throw new Error('Unexpected slot names');
cache = produce(storedCache as typeof cache, draft => {
  // Presence is read from the state under the draft, found by property name.
  if (!lru.has(draft, 5) || lru.has(draft, 99)) throw new Error('Wrong presence on a draft');
  lru.get(draft, 3);
  lru.remove(draft, 4);
});
equal(Array.from(lru.getIterable(cache)), [[5, 5], [6, 6], [7, 7], [8, 8], [9, 9], [0, 0], [10, 10], [11, 11], [3, 3]]);

// Sorted collection nodes are objects with named positions, read through
// literal names and written through computed ones: both must name the same
// properties after renaming, and after a JSON round trip.
const collection = new SortedCollectionAdapter<{id: number, order: number}>({
  orderComparer: (a, b) => a.order - b.order,
  equalityComparer: (a, b) => a.id === b.id,
  maxItemsPerLevel: 4,
});
let items = produce(collection.create(), draft => {
  for (let i = 0; i < 60; i++) collection.insert(draft, {id: i, order: (i * 7) % 60});
});
const stored = Array.from(collection.getIterable(items));
equal(stored.map(item => item.order), Array.from({length: 60}, (_, i) => i));
items = produce(JSON.parse(JSON.stringify(items)) as typeof items, draft => {
  collection.remove(draft, Array.from(collection.getIterable(draft))[3]);
  collection.update(draft, {id: stored[10].id, order: 10}, item => { item.order = 1000; });
  collection.remove(draft, collection.getFirst(draft)!);
});
equal(Array.from(collection.getIterable(items)).map(item => item.order),
  [...Array.from({length: 60}, (_, i) => i).filter(i => i !== 0 && i !== 3 && i !== 10), 1000]);
(globalThis as any)['compatibilityPassed'] = true;
