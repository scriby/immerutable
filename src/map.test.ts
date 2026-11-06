import produce, {mutate, proxyModes, setUseProxies} from './test-support/immer';
import * as hash from './hash';
import {Key, MapAdapter} from './map';

describe('map', () => {
  const range = (start: number, end: number) => new Array(end - start + 1).join().split(',').map((empty, i) => i + start);

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a map', () => {
    const adapter = new MapAdapter();
    const map = adapter.create();

    expect(map.root || undefined).not.toBeUndefined();
    expect(map.size).toBe(0);
  });

  it('gets undefined for a non-existent map key', () => {
    const adapter = new MapAdapter();
    const map = adapter.create();

    const value = adapter.get(map, 'test');

    expect(value).toBeUndefined();
  });

  it('sets a map value', () => {
    const adapter = new MapAdapter();
    const map = adapter.create();
    const testValue = { testKey: 'test value' };

    adapter.set(map, 'test', testValue);

    const fromMap = adapter.get(map, 'test');
    expect(fromMap).toBe(testValue);
    expect(map.size).toBe(1);
  });

  it('correctly handles different keys with the same hash code', () => {
    const adapter = new MapAdapter();
    const map = adapter.create();
    jest.spyOn(hash, 'hash').mockImplementation(() => {
      return 987654321;
    });

    const testValue1 = { testKey: 'test value' };
    const testValue2 = { testKey: 'test value 2' };

    adapter.set(map, 0, testValue1);
    adapter.set(map, 1, testValue2);

    const fromMap1 = adapter.get(map, 0);
    expect(fromMap1).toBe(testValue1);

    const fromMap2 = adapter.get(map, 1);
    expect(fromMap2).toBe(testValue2);

    expect(map.size).toBe(2);
  });

  it('sets values at the max depth of the tree', () => {
    class TestAdapter<K extends Key, V> extends MapAdapter<K, V> {
      protected maxDepth = 3;
    }

    const adapter = new TestAdapter<string, number>();
    const map = adapter.create();

    for (let i = 0; i < 20; i++) {
      adapter.set(map, i.toString(), i);
      expect(adapter.get(map, i.toString())).toEqual(i);
    }
  });

  it('replaces a value in all node types', () => {
    class TestAdapter<K extends Key, V> extends MapAdapter<K, V> {
      protected maxDepth = 3;
    }

    const adapter = new TestAdapter<string, string>();
    const map = adapter.create();

    for (let i = 0; i < 20; i++) {
      adapter.set(map, i.toString(), i.toString());
      expect(adapter.get(map, i.toString())).toEqual(i.toString());
    }

    for (let i = 0; i < 20; i++) {
      adapter.set(map, i.toString(), i + '_updated');
      expect(adapter.get(map, i.toString())).toEqual(i + '_updated');
    }
  });

  it('removes by key', () => {
    const adapter = new MapAdapter();
    const map = adapter.create();
    const testValue = { testKey: 'test value' };

    adapter.set(map, 1, testValue);
    expect(adapter.get(map, 1)).toBe(testValue);
    expect(map.size).toBe(1);

    adapter.remove(map, 1);
    expect(adapter.get(map, 1)).toBeUndefined();
    expect(map.size).toBe(0);
  });

  it('removes by key with multiple items sharing the same hash code', () => {
    const adapter = new MapAdapter();
    const map = adapter.create();
    jest.spyOn(hash, 'hash').mockImplementation(() => {
      return 987654321;
    });

    const testValue1 = { testKey: 'test value' };
    const testValue2 = { testKey: 'test value 2' };

    adapter.set(map, 0, testValue1);
    adapter.set(map, 1, testValue2);

    const fromMap1 = adapter.get(map, 0);
    expect(fromMap1).toBe(testValue1);

    const fromMap2 = adapter.get(map, 1);
    expect(fromMap2).toBe(testValue2);
    expect(map.size).toBe(2);

    adapter.remove(map, 0);
    expect(adapter.get(map, 0)).toBeUndefined();
    expect(map.size).toBe(1);

    adapter.remove(map, 1);
    expect(adapter.get(map, 1)).toBeUndefined();
    expect(map.size).toBe(0);
  });

  it('removes a non-existent item', () => {
    const adapter = new MapAdapter();
    const map = adapter.create();

    adapter.remove(map, 1);

    expect(adapter.has(map, 1)).toBe(false);
  });

  it('updates an item', () => {
    const adapter = new MapAdapter<number, typeof testValue>();
    const map = adapter.create();
    const testValue = { testKey: 'test value' };

    adapter.set(map, 1, testValue);
    adapter.update(map, 1, item => { item.testKey = 'asdf'; });

    expect(adapter.get(map, 1)).toEqual({ testKey: 'asdf' });
  });

  it('updates by key with multiple items sharing the same hash code', () => {
    const adapter = new MapAdapter<number, typeof testValue1>();
    const map = adapter.create();
    jest.spyOn(hash, 'hash').mockImplementation(() => {
      return 987654321;
    });

    const testValue1 = { testKey: 'test value' };
    const testValue2 = { testKey: 'test value 2' };

    adapter.set(map, 0, testValue1);
    adapter.set(map, 1, testValue2);

    adapter.update(map, 0, item => { item.testKey += ' a'; });
    adapter.update(map, 1, item => { item.testKey += ' b'; });

    expect(adapter.get(map, 0)).toEqual({ testKey: 'test value a' });
    expect(adapter.get(map, 1)).toEqual({ testKey: 'test value 2 b' });
  });

  it('updates an item by returning a different value', () => {
    const adapter = new MapAdapter<number, typeof testValue>();
    const map = adapter.create();
    const testValue = { testKey: 'test value' };

    adapter.set(map, 1, testValue);
    adapter.update(map, 1, () => ({ testKey: 'asdf' }));

    expect(adapter.get(map, 1)).toEqual({ testKey: 'asdf' });
  });

  it('does not update a non-existent item', () => {
    const adapter = new MapAdapter<number, typeof testValue>();
    const map = adapter.create();
    const testValue = { testKey: 'test value' };

    adapter.update(map, 1, () => ({ testKey: 'asdf' }));

    expect(adapter.get(map, 1)).toBeUndefined();
  });

  it('updates an item at maxDepth', () => {
    class TestAdapter<K extends Key, V> extends MapAdapter<K, V> {
      protected maxDepth = 3;
    }

    const adapter = new TestAdapter<string, string>();
    const map = adapter.create();

    for (let i = 0; i < 20; i++) {
      adapter.set(map, i.toString(), i.toString());
      expect(adapter.get(map, i.toString())).toEqual(i.toString());
    }

    adapter.update(map, '0', (item) => item + '_updated');

    expect(adapter.get(map, '0')).toEqual('0_updated');
  });

  it('iterates through map entries', () => {
    const adapter = new MapAdapter<number, typeof testValue>();
    const map = adapter.create();
    const testValue = { x: 0, value: 'test value' };

    for (let i = 1; i <= 20; i++) {
      adapter.set(map, i, { ...testValue, x: i });
    }

    // Get coverage on "if (child === undefined) {" in map.ts.
    adapter.remove(map, 1);

    expect(Array.from(adapter.getIterable(map)).sort((a, b) => a[1].x - b[1].x)).toEqual(range(2, 20).map(i => ([ i, { x: i, value: 'test value' }])));
  });

  it('iterates through maxDepth map entries', () => {
    class TestAdapter<K extends Key, V> extends MapAdapter<K, V> {
      protected maxDepth = 3;
    }

    const adapter = new TestAdapter<number, typeof testValue>();
    const map = adapter.create();
    const testValue = { x: 0, value: 'test value' };

    for (let i = 1; i <= 20; i++) {
      adapter.set(map, i, { ...testValue, x: i });
    }

    expect(Array.from(adapter.getIterable(map)).sort((a, b) => a[1].x - b[1].x)).toEqual(range(1, 20).map(i => ([ i, { x: i, value: 'test value' }])));
  });

  it('iterates through map values', () => {
    const adapter = new MapAdapter<number, typeof testValue>();
    const map = adapter.create();
    const testValue = { x: 0, value: 'test value' };

    for (let i = 1; i <= 20; i++) {
      adapter.set(map, i, { ...testValue, x: i });
    }

    expect(Array.from(adapter.getValuesIterable(map)).sort((a, b) => a.x - b.x)).toEqual(range(1, 20).map(i => ({ x: i, value: 'test value' })));
  });

  it('iterates through map keys', () => {
    const adapter = new MapAdapter<number, typeof testValue>();
    const map = adapter.create();
    const testValue = { x: 0, value: 'test value' };

    for (let i = 1; i <= 20; i++) {
      adapter.set(map, i, { ...testValue, x: i });
    }

    expect(Array.from(adapter.getKeysIterable(map)).sort((a, b) => a - b)).toEqual(range(1, 20));
  });

  it('determines a key exists using has', () => {
    const adapter = new MapAdapter<string, number>();
    const map = adapter.create();

    adapter.set(map, 'test', 10);

    expect(adapter.has(map, 'test')).toBe(true);
  });

  it('determines a key does not exist using has', () => {
    const adapter = new MapAdapter<string, number>();
    const map = adapter.create();

    expect(adapter.has(map, 'test')).toBe(false);
  });

  it('determines an existing key with hash conflict exists', () => {
    const adapter = new MapAdapter<string, number>();
    const map = adapter.create();
    jest.spyOn(hash, 'hash').mockImplementation(() => {
      return 987654321;
    });

    adapter.set(map, 'test', 10);
    adapter.set(map, 'test1', 11);

    expect(adapter.has(map, 'test')).toBe(true);
  });

  it('determines a non-existent key with hash conflict does not exist', () => {
    const adapter = new MapAdapter<string, number>();
    const map = adapter.create();
    jest.spyOn(hash, 'hash').mockImplementation(() => {
      return 987654321;
    });

    adapter.set(map, 'test', 10);

    expect(adapter.has(map, 'does not exist')).toBe(false);
  });

  it('iterables can be iterated multiple times', () => {
    const adapter = new MapAdapter<number, typeof testValue>();
    const map = adapter.create();
    const testValue = { x: 0, value: 'test value' };

    for (let i = 1; i <= 20; i++) {
      adapter.set(map, i, { ...testValue, x: i });
    }

    const iterable = adapter.getIterable(map);
    const keysIterable = adapter.getKeysIterable(map);
    const valuesIterable = adapter.getValuesIterable(map);

    expect(Array.from(iterable)).toEqual(Array.from(iterable));
    expect(Array.from(keysIterable)).toEqual(Array.from(keysIterable));
    expect(Array.from(valuesIterable)).toEqual(Array.from(valuesIterable));

    expect(Array.from(iterable).length).toBeGreaterThan(0);
  });

  describe('asReadonlyMap', () => {
    const adapter = new MapAdapter<string, number>();
    const map = adapter.create();

    for (let i = 1; i <= 9; i++) {
      adapter.set(map, `data ${i}`, i);
    }

    const readonlyMap = adapter.asReadonlyMap(map);

    it('iterates', () => {
      expect(Array.from(readonlyMap).sort((a, b) => a[1] - b[1])).toEqual(range(1, 9).map((n) => [`data ${n}`, n]));
    });

    it('gets entries', () => {
      expect(Array.from(readonlyMap.entries()).sort((a, b) => a[1] - b[1])).toEqual(range(1, 9).map((n) => [`data ${n}`, n]));
    });

    it('gets keys', () => {
      expect(Array.from(readonlyMap.keys()).sort()).toEqual(range(1, 9).map((n) => `data ${n}`));
    });

    it('gets values', () => {
      expect(Array.from(readonlyMap.values()).sort()).toEqual(range(1, 9));
    });

    it('can be iterated multiple times', () => {
      expect(Array.from(readonlyMap)).toEqual(Array.from(readonlyMap));
      expect(Array.from(readonlyMap.entries())).toEqual(Array.from(readonlyMap.entries()));
      expect(Array.from(readonlyMap.keys())).toEqual(Array.from(readonlyMap.keys()));
      expect(Array.from(readonlyMap.values())).toEqual(Array.from(readonlyMap.values()));
    });

    it('foreaches', () => {
      const foreached: Array<{key: string, value: number}> = [];

      readonlyMap.forEach((value, key) => {
        foreached.push({key, value});
      });

      expect(foreached.sort((a, b) => a.value - b.value)).toEqual(range(1, 9).map((n) => {
        return { key: `data ${n}`, value: n };
      }));
    });

    it('gets a value', () => {
      expect(readonlyMap.get('data 5')).toEqual(5);
    });

    it('indicates when it has an item', () => {
      expect(readonlyMap.has('data 5')).toBe(true);
    });

    it('indicates when it does not have an item', () => {
      expect(readonlyMap.has('data 99')).toBe(false);
    });

    it('has the right size', () => {
      expect(readonlyMap.size).toBe(9);
    });
  });

  describe('keysAsReadonlySet', () => {
    const adapter = new MapAdapter<number, string>();
    const sortedMap = adapter.create();

    for (let i = 1; i <= 9; i++) {
      adapter.set(sortedMap, i, `data ${i}`);
    }

    const readonlySet = adapter.keysAsReadonlySet(sortedMap);

    it('iterates', () => {
      expect(Array.from(readonlySet).sort()).toEqual(range(1, 9));
    });

    it('gets entries', () => {
      expect(Array.from(readonlySet.entries()).sort((a, b) => a[0] - b[0])).toEqual(range(1, 9).map((n) => [n, n]));
    });

    it('gets keys', () => {
      expect(Array.from(readonlySet.keys()).sort()).toEqual(range(1, 9));
    });

    it('gets values', () => {
      expect(Array.from(readonlySet.values()).sort()).toEqual(range(1, 9));
    });

    it('can be iterated multiple times', () => {
      expect(Array.from(readonlySet)).toEqual(Array.from(readonlySet));
      expect(Array.from(readonlySet.entries())).toEqual(Array.from(readonlySet.entries()));
      expect(Array.from(readonlySet.keys())).toEqual(Array.from(readonlySet.keys()));
      expect(Array.from(readonlySet.values())).toEqual(Array.from(readonlySet.values()));
    });

    it('foreaches', () => {
      const foreached: number[] = [];

      readonlySet.forEach((key) => {
        foreached.push(key);
      });

      expect(foreached.sort()).toEqual(range(1, 9));
    });

    it('indicates when it has an item', () => {
      expect(readonlySet.has(5)).toBe(true);
    });

    it('indicates when it does not have an item', () => {
      expect(readonlySet.has(99)).toBe(false);
    });

    it('has the right size', () => {
      expect(readonlySet.size).toBe(9);
    });
  });

  describe.each([false, true])('missing keys (Immer: %s)', useImmer => {
    it('does not delete an existing entry when removing an absent key with the same hash prefix', () => {
      const adapter = new MapAdapter<number, string>();
      const original = adapter.create();
      adapter.set(original, 1, 'one');

      // 1 and 17 share the first four hash bits, but are different keys.
      const result = mutate(original, useImmer, draft => adapter.remove(draft, 17));

      expect(Array.from(adapter.getIterable(result))).toEqual([[1, 'one']]);
      expect(adapter.getSize(result)).toBe(1);
      if (useImmer) expect(result).toBe(original);
    });

    it('does not call the updater for an absent key sharing a single-value leaf', () => {
      const adapter = new MapAdapter<number, string>();
      const original = adapter.create();
      adapter.set(original, 1, 'one');
      const updater = jest.fn(() => 'changed');

      const result = mutate(original, useImmer, draft => {
        expect(adapter.update(draft, 17, updater)).toBeUndefined();
      });

      expect(updater).not.toHaveBeenCalled();
      expect(Array.from(adapter.getIterable(result))).toEqual([[1, 'one']]);
      if (useImmer) expect(result).toBe(original);
    });

    it('does not create an uncounted entry when updating an absent key in a collision bucket', () => {
      const adapter = new MapAdapter<number, string>();
      const original = adapter.create();
      // The trie uses the low 28 bits before falling back to a collision bucket.
      adapter.set(original, 1, 'one');
      adapter.set(original, 1 + 2 ** 28, 'two');
      const missing = 1 + 2 * 2 ** 28;
      const updater = jest.fn(() => 'ghost');

      const result = mutate(original, useImmer, draft => {
        adapter.update(draft, missing, updater);
      });

      expect(adapter.has(result, missing)).toBe(false);
      expect(updater).not.toHaveBeenCalled();
      expect(Array.from(adapter.getIterable(result))).toHaveLength(2);
      expect(adapter.getSize(result)).toBe(2);
    });
  });

  describe('Map serialization and numeric keys', () => {
    it('can iterate a JSON round-tripped map containing only JSON-safe keys and values', () => {
      const adapter = new MapAdapter<number, string>();
      const map = adapter.create();
      adapter.set(map, 1, 'one');
      const restored = JSON.parse(JSON.stringify(map)) as typeof map;

      expect(Array.from(adapter.getIterable(restored))).toEqual([[1, 'one']]);
    });

    it('can query and insert into an empty hash slot after a JSON round trip', () => {
      const adapter = new MapAdapter<number, string>();
      const map = adapter.create();
      adapter.set(map, 1, 'one');
      const restored = JSON.parse(JSON.stringify(map)) as typeof map;

      expect(adapter.has(restored, 0)).toBe(false);
      expect(adapter.get(restored, 0)).toBeUndefined();
      adapter.set(restored, 0, 'zero');
      expect(adapter.get(restored, 0)).toBe('zero');
      expect(adapter.getSize(restored)).toBe(2);
    });

    it('can retrieve a NaN numeric key immediately after inserting it', () => {
      const adapter = new MapAdapter<number, string>();
      const map = adapter.create();
      adapter.set(map, NaN, 'not a number');

      expect(adapter.has(map, NaN)).toBe(true);
      expect(adapter.get(map, NaN)).toBe('not a number');
      adapter.set(map, NaN, 'replacement');
      expect(adapter.getSize(map)).toBe(1);
      expect(Array.from(adapter.getIterable(map))).toEqual([[NaN, 'replacement']]);
    });

    it.each(['constructor', 'toString', '__proto__'])('does not invent the key %s in a JSON-restored collision bucket', key => {
      const adapter = new MapAdapter<number | string, string>();
      const map = adapter.create();
      const prefix = hash.hash(key) & 0x0fffffff;
      adapter.set(map, prefix, 'first');
      adapter.set(map, prefix + 2 ** 28, 'second');
      expect(adapter.has(map, key)).toBe(false);
      const restored = JSON.parse(JSON.stringify(map)) as typeof map;

      expect(adapter.has(restored, key)).toBe(false);
      adapter.remove(restored, key);
      expect(adapter.getSize(restored)).toBe(2);
    });
  });

  // Finding 18: Immer 1.2.1 copies a bucket holding an own `__proto__` property
  // into an ordinary object, turning that entry into the copy's prototype.
  describe.each(proxyModes)('Map __proto__ key in a collision bucket (Immer proxies: %s)', useProxies => {
    beforeEach(() => setUseProxies(useProxies));
    afterEach(() => setUseProxies(true));

    it('drafts every prototype-name value safely after JSON restoration', () => {
      jest.spyOn(hash, 'hash').mockReturnValue(0);
      const adapter = new MapAdapter<string, {items: number[]}>();
      const keys = [...Object.getOwnPropertyNames(Object.prototype), '\0__proto__', '\0\0__proto__', '\0', 'ordinary'];
      const map = adapter.create();
      keys.forEach((key, index) => adapter.set(map, key, {items: [index]}));
      const original = JSON.parse(JSON.stringify(map));
      const before = JSON.stringify(original);

      const updated = produce(original, (draft: typeof map) => {
        keys.forEach(key => adapter.update(draft, key, value => { value.items.push(42); }));
      });

      keys.forEach((key, index) => {
        expect(adapter.get(updated, key)).toEqual({items: [index, 42]});
        expect(adapter.get(original, key)).toEqual({items: [index]});
      });
      expect(JSON.stringify(original)).toBe(before);
      expect(Array.from(adapter.getIterable(updated))).toHaveLength(keys.length);
      const empty = produce(updated, (draft: typeof map) => keys.forEach(key => adapter.remove(draft, key)));
      expect(adapter.getSize(empty)).toBe(0);
      expect(Array.from(adapter.getIterable(empty))).toEqual([]);
      expect(adapter.getSize(updated)).toBe(keys.length);
    });

    it('keeps a __proto__ key when Immer copies its collision bucket', () => {
      const adapter = new MapAdapter<number | string, string>();
      const original = adapter.create();
      const key = '__proto__';
      const prefix = hash.hash(key) & 0x0fffffff;
      adapter.set(original, prefix, 'first');
      adapter.set(original, key, 'proto value');

      const result = produce(original, draft => adapter.set(draft, prefix + 2 ** 28, 'third'));

      expect(adapter.has(result, key)).toBe(true);
      expect(adapter.get(result, key)).toBe('proto value');
      expect(adapter.getSize(result)).toBe(3);
      expect(Array.from(adapter.getIterable(result)).sort()).toEqual([
        [key, 'proto value'],
        [prefix, 'first'],
        [prefix + 2 ** 28, 'third'],
      ].sort());
      expect(adapter.get(original, key)).toBe('proto value');
    });
  });

  describe('readonly views after mutation or partial iteration', () => {
    function setup() {
      const adapter = new MapAdapter<number, number>();
      const map = adapter.create();
      return {add: (key: number) => adapter.set(map, key, key),
        map: adapter.asReadonlyMap(map), set: adapter.keysAsReadonlySet(map)};
    }

    it.each(['map', 'set'] as const)('reports the current size of the %s view after mutation', view => {
      const fixture = setup();
      fixture.add(1);

      expect(fixture[view].has(1)).toBe(true);
      expect(Array.from(fixture[view].values())).toEqual([1]);
      expect(fixture[view].size).toBe(1);
    });

    it.each(['map', 'set'] as const)('resumes a partially consumed %s iterator instead of restarting it', view => {
      const fixture = setup();
      fixture.add(1);
      fixture.add(2);
      const expected = Array.from(fixture[view].values());
      const iterator = fixture[view].values();
      expect(iterator.next().value).toBe(expected[0]);

      expect(Array.from(iterator)).toEqual(expected.slice(1));
      expect(iterator[Symbol.iterator]()).toBe(iterator);
      expect(iterator.next().done).toBe(true);
    });
  });
});
