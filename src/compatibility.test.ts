import produce, {proxyModes, setUseProxies} from './test-support/immer';
import {IMap, MapAdapter} from './map';
import {SortedMapAdapter} from './sortedmap';
import {SortedCollectionAdapter} from './sortedcollection';
import {LruCacheAdapter} from './lrucache';
import * as hashing from './hash';

const modes = ['direct', ...proxyModes.map(proxies => proxies ? 'proxy' : 'es5')];

function restoredMap(): IMap<number | string, {count: number}> {
  const adapter = new MapAdapter<number | string, {count: number}>();
  const map = adapter.create();
  adapter.set(map, 260690920, {count: 1});
  adapter.set(map, '__proto__', {count: 2});
  return JSON.parse(JSON.stringify(map));
}

describe.each(modes)('Persistent-state compatibility (%s)', mode => {
  beforeEach(() => setUseProxies(mode !== 'es5'));
  afterEach(() => { setUseProxies(true); jest.restoreAllMocks(); });
  function change<S>(state: S, recipe: (draft: S) => void): S {
    if (mode !== 'direct') return produce(state, recipe);
    recipe(state);
    return state;
  }

  it.each(['insert', 'update', 'remove'])('can %s in a JSON-restored bucket holding __proto__', operation => {
    const adapter = new MapAdapter<number | string, {count: number}>();
    const original = restoredMap();
    const before = JSON.stringify(original);
    const prefix = 260690920;
    expect(adapter.get(original, '__proto__')).toEqual({count: 2});
    const result = change(original, draft => {
      if (operation === 'insert') adapter.set(draft, prefix + 2 ** 28, {count: 3});
      else if (operation === 'update') adapter.update(draft, '__proto__', item => { item.count++; });
      else adapter.remove(draft, prefix);
    });
    const expected: Array<[number | string, {count: number}]> = [['__proto__', {count: operation === 'update' ? 3 : 2}]];
    if (operation !== 'remove') expected.push([prefix, {count: 1}]);
    if (operation === 'insert') expected.push([prefix + 2 ** 28, {count: 3}]);
    const sort = (entries: typeof expected) => entries.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    expect(sort(Array.from(adapter.getIterable(result)))).toEqual(sort(expected));
    expect(adapter.getSize(result)).toBe(expected.length);
    const restored = JSON.parse(JSON.stringify(result)) as typeof result;
    adapter.set(restored, '__proto__', {count: 4});
    expect(adapter.get(restored, '__proto__')).toEqual({count: 4});
    adapter.remove(restored, '__proto__');
    expect(adapter.has(restored, '__proto__')).toBe(false);
    expect(adapter.getSize(restored)).toBe(expected.length - 1);
    if (mode !== 'direct') expect(JSON.stringify(original)).toBe(before);
  });

  it('keeps escaped-prefix keys distinct through collisions, updates and serialization', () => {
    // Force every string into one bucket to exercise escape-prefix collisions.
    jest.spyOn(hashing, 'hash').mockReturnValue(0);
    const adapter = new MapAdapter<string, number>();
    const keys = ['__proto__', '\0__proto__', '\0\0__proto__', 'constructor', 'toString', 'hasOwnProperty'];
    let map = adapter.create();
    keys.forEach((key, i) => { map = change(map, draft => adapter.set(draft, key, i)); });
    keys.forEach((key, i) => expect(adapter.get(map, key)).toBe(i));
    map = JSON.parse(JSON.stringify(map));
    keys.forEach((key, i) => {
      const previous = map;
      map = change(map, draft => { adapter.update(draft, key, () => -i - 1); });
      expect(adapter.get(map, key)).toBe(-i - 1);
      if (mode !== 'direct') expect(adapter.get(previous, key)).toBe(i);
    });
    expect(Array.from(adapter.getIterable(map))).toHaveLength(keys.length);
    for (const key of keys) map = change(map, draft => adapter.remove(draft, key));
    expect(adapter.getSize(map)).toBe(0);
    expect(Array.from(adapter.getIterable(map))).toEqual([]);
  });

  it('reads restored prototype-name entries without changing the state', () => {
    const adapter = new MapAdapter<number | string, {count: number}>();
    const original = restoredMap();
    const before = JSON.stringify(original);
    const result = change(original, draft => {
      expect(adapter.get(draft, '__proto__')).toEqual({count: 2});
      expect(Array.from(adapter.getIterable(draft))).toHaveLength(2);
    });
    expect(result).toBe(original);
    expect(Array.from(adapter.getIterable(result))).toHaveLength(2);
    expect(adapter.get(result, '__proto__')).toEqual({count: 2});
    expect(JSON.stringify(original)).toBe(before);
  });

  it('lets Immer draft restored nested values without mutating the original', () => {
    type Value = {count: number, nested?: {items: number[]}};
    const adapter = new MapAdapter<number | string, Value>();
    const original: IMap<number | string, Value> = restoredMap();
    adapter.get(original, '__proto__')!.nested = {items: [1, 2]};
    const before = JSON.stringify(original);
    const result = change(original, draft => {
      adapter.update(draft, '__proto__', item => { item.nested!.items.push(3); });
    });
    expect(adapter.get(result, '__proto__')!.nested!.items).toEqual([1, 2, 3]);
    if (mode !== 'direct') expect(JSON.stringify(original)).toBe(before);
  });

  it('retains missing-key no-ops and shares untouched branches', () => {
    const adapter = new MapAdapter<number, {count: number}>();
    const original = adapter.create();
    adapter.set(original, 1, {count: 1});
    adapter.set(original, 2, {count: 2});
    const updater = jest.fn(() => ({count: 99}));
    const unchanged = change(original, draft => {
      adapter.remove(draft, 17);
      adapter.update(draft, 17, updater);
    });
    expect(updater).not.toHaveBeenCalled();
    expect(unchanged).toBe(original);
    const result = change(original, draft => { adapter.update(draft, 1, item => { item.count++; }); });
    expect(adapter.get(result, 1)).toEqual({count: 2});
    expect(result.root[2]).toBe(original.root[2]);
    if (mode !== 'direct') {
      expect(result.root).not.toBe(original.root);
      expect(adapter.get(original, 1)).toEqual({count: 1});
    }
  });

  it('keeps NaN and signed-zero keys consistent across sorted-map and LRU mutations', () => {
    const adapters = [new SortedMapAdapter<number, number>({getOrderingKey: value => value}), new LruCacheAdapter<number, number>(4)];
    for (const adapter of adapters) {
      // The adapter/state pair stays together; both expose the same operations.
      const a: any = adapter;
      let state = a.create();
      state = change(state, draft => { a.set(draft, NaN, 1); a.set(draft, -0, 2); });
      state = change(state, draft => { a.set(draft, NaN, 3); a.update(draft, 0, () => 0); });
      expect(a.getSize(state)).toBe(2);
      expect(a.has(state, NaN)).toBe(true);
      expect(Array.from(a.getValuesIterable(state)).sort()).toEqual([0, 3]);
      state = change(state, draft => { a.remove(draft, NaN); a.remove(draft, +0); });
      expect(a.getSize(state)).toBe(0);
      expect(Array.from(a.getIterable(state))).toEqual([]);
    }
  });

  it('keeps mutable ordering keys sorted while preserving old immutable states', () => {
    const adapter = new SortedMapAdapter<string, {order: {rank: number}}, {rank: number}>({
      getOrderingKey: item => item.order, orderComparer: (a, b) => a.rank - b.rank,
    });
    const original = adapter.create();
    adapter.set(original, 'a', {order: {rank: 1}});
    adapter.set(original, 'b', {order: {rank: 2}});
    const result = change(original, draft => { adapter.update(draft, 'a', item => { item.order.rank = 3; }); });
    expect(Array.from(adapter.getKeysIterable(result))).toEqual(['b', 'a']);
    const removed = change(result, draft => adapter.remove(draft, 'a'));
    expect(Array.from(adapter.getKeysIterable(removed))).toEqual(['b']);
    expect(adapter.getSize(removed)).toBe(1);
    if (mode !== 'direct') {
      expect(adapter.get(original, 'a')).toEqual({order: {rank: 1}});
      expect(Array.from(adapter.getKeysIterable(original))).toEqual(['a', 'b']);
    }
  });

  it('updates a restored sorted-map value without mutating its original state', () => {
    const adapter = new SortedMapAdapter<number | string, {count: number}>({getOrderingKey: item => item.count});
    const initial = adapter.create();
    adapter.set(initial, 260690920, {count: 1});
    adapter.set(initial, '__proto__', {count: 2});
    const original: typeof initial = JSON.parse(JSON.stringify(initial));
    const before = JSON.stringify(original);
    const result = change(original, draft => { adapter.update(draft, '__proto__', item => { item.count = 0; }); });
    expect(Array.from(adapter.getKeysIterable(result))).toEqual(['__proto__', 260690920]);
    expect(adapter.get(result, '__proto__')).toEqual({count: 0});
    if (mode !== 'direct') expect(JSON.stringify(original)).toBe(before);
  });

  it('traverses undefined elements across tree boundaries without ending early', () => {
    const adapter = new SortedCollectionAdapter<number | undefined>({
      orderComparer: (a, b) => (a === undefined ? 0 : a) - (b === undefined ? 0 : b), maxItemsPerLevel: 4,
    });
    let collection = adapter.create();
    const values = [-4, -3, -2, -1, undefined, 1, 2, 3, 4];
    collection = change(collection, draft => values.forEach(value => adapter.insert(draft, value)));
    collection = change(collection, draft => { adapter.update(draft, 1, () => -.5); });
    const expected = [-4, -3, -2, -1, -.5, undefined, 2, 3, 4];
    expect(Array.from(adapter.getIterable(collection))).toEqual(expected);
    for (const direction of ['forward', 'backward'] as const) {
      const iterator = adapter.getIterable(collection, direction)[Symbol.iterator]();
      for (const value of direction === 'forward' ? expected : [...expected].reverse()) {
        expect(iterator.next()).toEqual({value, done: false});
      }
      expect(iterator.next().done).toBe(true);
      expect(iterator.next().done).toBe(true);
    }
  });

  it.each([0, 10, 64])('matches a seeded LRU reference model at capacity %s', capacity => {
    const adapter = new LruCacheAdapter<number | string, number | null>(capacity);
    let state = adapter.create();
    const reference = new Map<number | string, number | null>();
    let seed = 0x51ab;
    const random = (n: number) => {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      return (seed >>> 0) % n;
    };
    const refresh = (key: number | string, value: number | null) => {
      reference.delete(key); reference.set(key, value);
    };
    for (let step = 0; step < 1000; step++) {
      const selected = random(capacity * 2 + 20);
      const key = selected === 0 ? NaN : selected === 1 ? '__proto__' : selected;
      const operation = random(6);
      state = change(state, draft => {
        if (operation < 2) {
          const value = step % 3 ? 0 : null;
          adapter.set(draft, key, value); refresh(key, value);
          if (reference.size > Math.floor(capacity * 1.1)) {
            while (reference.size > capacity) reference.delete(reference.keys().next().value!);
          }
        } else if (operation === 2) {
          expect(adapter.get(draft, key)).toBe(reference.get(key));
          if (reference.has(key)) refresh(key, reference.get(key)!);
        } else if (operation === 3) {
          expect(adapter.peek(draft, key)).toBe(reference.get(key));
        } else if (operation === 4) {
          const updater = jest.fn(() => 0);
          adapter.update(draft, key, updater);
          expect(updater).toHaveBeenCalledTimes(reference.has(key) ? 1 : 0);
          if (reference.has(key)) refresh(key, 0);
        } else {
          adapter.remove(draft, key); reference.delete(key);
        }
      });
      expect({step, entries: Array.from(adapter.getIterable(state))})
        .toEqual({step, entries: Array.from(reference)});
      expect(adapter.getSize(state)).toBe(reference.size);
    }
  });
});

describe.each(['map', 'sorted', 'lru'])('Readonly iterator lifecycle (%s)', kind => {
  it('uses independent views and single-use iterators for entries, keys, values and direct iteration', () => {
    const adapter: any = kind === 'map' ? new MapAdapter<number, number>()
      : kind === 'sorted' ? new SortedMapAdapter<number, number>({getOrderingKey: value => value})
      : new LruCacheAdapter<number, number>(10);
    const original = adapter.create();
    adapter.set(original, 1, 1); adapter.set(original, 2, 2);
    const map = adapter.asReadonlyMap(original);
    const set = adapter.keysAsReadonlySet(original);
    const updated = produce(original, (draft: any) => { adapter.set(draft, 3, 3); });
    expect(map.size).toBe(2); expect(set.size).toBe(2);
    expect(adapter.asReadonlyMap(updated).size).toBe(3);
    for (const view of [map, set]) for (const method of ['entries', 'keys', 'values', Symbol.iterator]) {
      const expected = Array.from(view[method]());
      const iterator = view[method]();
      expect(iterator[Symbol.iterator]()).toBe(iterator);
      expect(iterator.next().value).toEqual(expected[0]);
      expect(Array.from(iterator)).toEqual(expected.slice(1));
      expect(Array.from(iterator)).toEqual([]);
      expect(Array.from(view[method]())).toEqual(expected);
    }
  });
});
