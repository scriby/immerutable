import {LruCacheAdapter} from './lrucache';

const range = (start: number, end: number) => new Array(end - start + 1).join().split(',').map((empty, i) => i + start);

describe('LRU Cache', () => {
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
});