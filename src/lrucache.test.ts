import produce, {mutate} from './test-support/immer';
import {LruCacheAdapter} from './lrucache';
import {hash} from './hash';

const range = (start: number, end: number) => new Array(end - start + 1).join().split(',').map((empty, i) => i + start);

describe('LRU Cache', () => {
  describe('restored special keys', () => {
    it('preserves recency and evicts the oldest entry after JSON restoration', () => {
      const adapter = new LruCacheAdapter<number | string, string>(2);
      const prefix = hash('__proto__') & 0x0fffffff;
      const initial = adapter.create();
      adapter.set(initial, prefix, 'first');
      adapter.set(initial, '__proto__', 'second');
      const original: typeof initial = JSON.parse(JSON.stringify(initial));
      const before = JSON.stringify(original);

      expect(Array.from(adapter.getIterable(original))).toEqual([[prefix, 'first'], ['__proto__', 'second']]);
      const updated = produce(original, draft => {
        expect(adapter.get(draft, prefix)).toBe('first');
        adapter.set(draft, prefix + 2 ** 28, 'third');
      });
      expect(Array.from(adapter.getIterable(updated))).toEqual([[prefix, 'first'], [prefix + 2 ** 28, 'third']]);
      expect(JSON.stringify(original)).toBe(before);
      expect(Array.from(adapter.getIterable(original))).toEqual([[prefix, 'first'], ['__proto__', 'second']]);
    });
  });

  it('expires old items', () => {
    const adapter = new LruCacheAdapter<string, string>(4);
    const lru = adapter.create();

    adapter.set(lru, 'a', 'a');
    adapter.set(lru, 'b', 'b');
    adapter.set(lru, 'c', 'c');
    adapter.set(lru, 'd', 'd');
    adapter.set(lru, 'e', 'e');

    expect(adapter.getSize(lru)).toBe(4);
    expect(Array.from(adapter.getIterable(lru))).toEqual([
      ['b', 'b'],
      ['c', 'c'],
      ['d', 'd'],
      ['e', 'e'],
    ]);
  });

  it('treats gotten items as more recent', () => {
    const adapter = new LruCacheAdapter<string, string>(4);
    const lru = adapter.create();

    adapter.set(lru, 'a', 'a');
    adapter.set(lru, 'b', 'b');
    adapter.set(lru, 'c', 'c');
    adapter.set(lru, 'd', 'd');
    adapter.get(lru, 'a');
    adapter.set(lru, 'e', 'e');

    expect(adapter.getSize(lru)).toBe(4);
    expect(Array.from(adapter.getValuesIterable(lru))).toEqual(['c', 'd', 'a', 'e']);
  });

  it('treats updated items as more recent', () => {
    const adapter = new LruCacheAdapter<string, string>(4);
    const lru = adapter.create();

    adapter.set(lru, 'a', 'a');
    adapter.set(lru, 'b', 'b');
    adapter.set(lru, 'c', 'c');
    adapter.update(lru, 'a', () => 'f');
    adapter.set(lru, 'd', 'd');
    adapter.set(lru, 'e', 'e');

    expect(adapter.getSize(lru)).toBe(4);
    expect(Array.from(adapter.getValuesIterable(lru))).toEqual(['c', 'f', 'd', 'e']);
  });

  it('removes items', () => {
    const adapter = new LruCacheAdapter<string, string>(4);
    const lru = adapter.create();

    adapter.set(lru, 'a', 'a');
    adapter.set(lru, 'b', 'b');
    adapter.set(lru, 'c', 'c');
    expect(adapter.getSize(lru)).toBe(3);

    adapter.remove(lru, 'c');
    expect(adapter.getSize(lru)).toBe(2);
    expect(Array.from(adapter.getValuesIterable(lru))).toEqual(['a', 'b']);
  });

  it('gets keys', () => {
    const adapter = new LruCacheAdapter<string, string>(4);
    const lru = adapter.create();

    adapter.set(lru, 'a', 'a');
    adapter.set(lru, 'b', 'b');
    adapter.set(lru, 'c', 'c');

    expect(Array.from(adapter.getKeysIterable(lru))).toEqual(['a', 'b', 'c']);
  });

  it('iterables can be iterated multiple times', () => {
    const adapter = new LruCacheAdapter<string, string>(4);
    const lru = adapter.create();

    adapter.set(lru, 'a', 'a');
    adapter.set(lru, 'b', 'b');
    adapter.set(lru, 'c', 'c');

    const iterable = adapter.getIterable(lru);
    const keysIterable = adapter.getKeysIterable(lru);
    const valuesIterable = adapter.getValuesIterable(lru);

    expect(Array.from(iterable)).toEqual(Array.from(iterable));
    expect(Array.from(keysIterable)).toEqual(Array.from(keysIterable));
    expect(Array.from(valuesIterable)).toEqual(Array.from(valuesIterable));

    expect(Array.from(iterable).length).toBeGreaterThan(0);
  });

  describe('asReadonlyMap', () => {
    const adapter = new LruCacheAdapter<string, number>(10);
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
    const adapter = new LruCacheAdapter<number, string>(10);
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

  describe('updates that remove their own entry', () => {
    it.each([false, true])('leaves the recency order without the entry (Immer: %s)', useImmer => {
      const adapter = new LruCacheAdapter<number, number>(3);
      let lru = adapter.create();
      const step = (recipe: (draft: typeof lru) => void) => { if (useImmer) lru = produce(lru, recipe); else recipe(lru); };
      step(draft => { for (let i = 0; i < 3; i++) adapter.set(draft, i, i); });
      // Adding a fourth entry evicts entry 0, which is being updated.
      step(draft => { adapter.update(draft, 0, () => { adapter.set(draft, 10, 10); return 5; }); });
      expect(Array.from(adapter.getKeysIterable(lru))).toEqual([1, 2, 10]);
      step(draft => { adapter.update(draft, 1, () => { adapter.remove(draft, 1); }); });
      expect(Array.from(adapter.getIterable(lru))).toEqual([[2, 2], [10, 10]]);
      expect(adapter.getSize(lru)).toBe(2);
    });
  });

  describe('updates and batch eviction', () => {
    it.each([0, false, '', null])('accepts a falsy replacement returned by update: %s', value => {
      const adapter = new LruCacheAdapter<string, number | boolean | string | null>(4);
      const cache = adapter.create();
      adapter.set(cache, 'key', 'original');

      const result = adapter.update(cache, 'key', () => value);

      expect(adapter.peek(cache, 'key')).toBe(value);
      expect(result).toBe(value);
    });

    describe.each([false, true])('batch eviction (Immer: %s)', useImmer => {
      it.each([10, 64])('evicts the oldest consecutive entries at capacity %s', capacity => {
        const adapter = new LruCacheAdapter<number, number>(capacity);
        const original = adapter.create();
        const threshold = Math.floor(capacity * 1.1);
        for (let key = 0; key < threshold; key++) adapter.set(original, key, key);

        const result = mutate(original, useImmer, draft => adapter.set(draft, threshold, threshold));

        const expected = Array.from({length: capacity}, (_, i) => threshold + 1 - capacity + i);
        expect(Array.from(adapter.getKeysIterable(result))).toEqual(expected);
        expect(adapter.getSize(result)).toBe(capacity);
        if (useImmer) expect(adapter.getSize(original)).toBe(threshold);
      });
    });
  });

  describe('readonly views after mutation or partial iteration', () => {
    function setup() {
      const adapter = new LruCacheAdapter<number, number>(10);
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
