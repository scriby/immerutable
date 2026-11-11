import {isDraft} from 'immer';
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

  describe('recency kept outside the entries', () => {
    it('does not rewrite the stored entries when an entry is only read', () => {
      const adapter = new LruCacheAdapter<number, string>(100);
      const lru = produce(adapter.create(), draft => { for (let i = 0; i < 50; i++) adapter.set(draft, i, `value ${i}`); });

      const next = produce(lru, draft => { expect(adapter.get(draft, 10)).toBe('value 10'); });

      // Using an entry changes the two indexes, not the map holding the entries.
      expect(next.root).toBe(lru.root);
      expect(next).not.toBe(lru);
      expect(Array.from(adapter.getKeysIterable(next))).toEqual([...Array.from({length: 50}, (_, i) => i).filter(key => key !== 10), 10]);
      expect(Array.from(adapter.getKeysIterable(lru))).toEqual(Array.from({length: 50}, (_, i) => i));
    });

    it('returns the same state when a producer only peeks, checks or misses', () => {
      const adapter = new LruCacheAdapter<number, string>(100);
      const lru = produce(adapter.create(), draft => { for (let i = 0; i < 50; i++) adapter.set(draft, i, `value ${i}`); });

      const next = produce(lru, draft => {
        adapter.peek(draft, 10);
        adapter.has(draft, 11);
        adapter.get(draft, 1000);
        adapter.update(draft, 1000, () => 'never');
        adapter.remove(draft, 1000);
      });

      expect(next).toBe(lru);
    });

    it.each([false, true])('moves an existing key to most recent when it is set again (Immer: %s)', useImmer => {
      const adapter = new LruCacheAdapter<number | string, number>(100);
      let lru = adapter.create();
      // 1.5 and '1.5' are distinct keys, as are the other number/string pairs.
      const keys = [3, '3', 1.5, '1.5', 0, 'a'];
      lru = mutate(lru, useImmer, draft => { keys.forEach((key, i) => adapter.set(draft, key, i)); });
      lru = mutate(lru, useImmer, draft => {
        adapter.set(draft, '3', 10);
        adapter.set(draft, 1.5, 11);
        adapter.remove(draft, 0);
      });

      expect(Array.from(adapter.getIterable(lru))).toEqual([[3, 0], ['1.5', 3], ['a', 5], ['3', 10], [1.5, 11]]);
      expect(adapter.getSize(lru)).toBe(5);
      const restored: typeof lru = JSON.parse(JSON.stringify(lru));
      expect(Array.from(adapter.getIterable(restored))).toEqual(Array.from(adapter.getIterable(lru)));
    });
  });

  describe('an updater that sets its own key', () => {
    // 1 and 1 + 2 ** 28 share a collision bucket, where set replaces the
    // stored entry; elsewhere it replaces the entry's value.
    describe.each([[5, 'a trie slot'], [1 + 2 ** 28, 'a collision bucket']])('key %s, in %s', key => {
      it.each([false, true])('keeps the value the updater set, and does not use the key again (Immer: %s)', useImmer => {
        const adapter = new LruCacheAdapter<number, string>(10);
        let lru = adapter.create();
        lru = mutate(lru, useImmer, draft => { for (const k of [1, 2, key]) adapter.set(draft, k, `first ${k}`); });

        let returned: string|undefined;
        lru = mutate(lru, useImmer, draft => {
          returned = adapter.update(draft, key, () => {
            adapter.set(draft, key, 'set by updater');
            adapter.get(draft, 2);
            return 'returned by updater';
          });
        });

        expect(returned).toBe('returned by updater');
        expect(Array.from(adapter.getIterable(lru))).toEqual([[1, 'first 1'], [key, 'set by updater'], [2, 'first 2']]);
      });

      it.each([false, true])('returns the value it gave an updater that returns nothing (Immer: %s)', useImmer => {
        const adapter = new LruCacheAdapter<number, string>(10);
        let lru = adapter.create();
        lru = mutate(lru, useImmer, draft => { for (const k of [1, 2, key]) adapter.set(draft, k, `first ${k}`); });

        let returned: string|undefined;
        lru = mutate(lru, useImmer, draft => {
          returned = adapter.update(draft, key, () => { adapter.set(draft, key, 'set by updater'); });
        });

        expect(returned).toBe(`first ${key}`);
        expect(adapter.peek(lru, key)).toBe('set by updater');
      });
    });
  });

  describe('an updater that changes its own entry', () => {
    // Whether the updater replaced the entry cannot be told from its value.
    describe.each([[5, 'a trie slot'], [1 + 2 ** 28, 'a collision bucket']])('key %s, in %s', key => {
      const filled = (adapter: LruCacheAdapter<number, string>, useImmer: boolean) =>
        mutate(adapter.create(), useImmer, draft => { for (const k of [1, 2, key]) adapter.set(draft, k, `first ${k}`); });

      it.each([false, true])('keeps the entry an updater stored with the same value (Immer: %s)', useImmer => {
        const adapter = new LruCacheAdapter<number, string>(10);
        let returned: string|undefined;
        const lru = mutate(filled(adapter, useImmer), useImmer, draft => {
          returned = adapter.update(draft, key, () => {
            adapter.set(draft, key, `first ${key}`);
            adapter.get(draft, 2);
            return 'returned by updater';
          });
        });
        expect(returned).toBe('returned by updater');
        expect(Array.from(adapter.getIterable(lru))).toEqual([[1, 'first 1'], [key, `first ${key}`], [2, 'first 2']]);
      });

      it.each([false, true])('keeps the entry an updater removed and stored again with the same value (Immer: %s)', useImmer => {
        const adapter = new LruCacheAdapter<number, string>(10);
        const lru = mutate(filled(adapter, useImmer), useImmer, draft => {
          adapter.update(draft, key, () => {
            adapter.remove(draft, key);
            adapter.set(draft, key, `first ${key}`);
            adapter.get(draft, 2);
            return 'returned by updater';
          });
        });
        expect(Array.from(adapter.getIterable(lru))).toEqual([[1, 'first 1'], [key, `first ${key}`], [2, 'first 2']]);
      });

      it.each([false, true])('stores what the outer updater returns when the updater updates the same key (Immer: %s)', useImmer => {
        const adapter = new LruCacheAdapter<number, string>(10);
        const lru = mutate(filled(adapter, useImmer), useImmer, draft => {
          adapter.update(draft, key, () => {
            adapter.update(draft, key, () => 'inner');
            expect(adapter.get(draft, key)).toBe('inner');
            adapter.get(draft, 1);
            return 'outer';
          });
        });
        // Getting or updating the key does not replace its entry, so the outer update completes.
        expect(Array.from(adapter.getIterable(lru))).toEqual([[2, 'first 2'], [1, 'first 1'], [key, 'outer']]);
      });
    });

    describe.each([false, true])('updates inside updaters (Immer: %s)', useImmer => {
      const run = (recipe: (adapter: LruCacheAdapter<string, number | string>, draft: any) => unknown) => {
        const adapter = new LruCacheAdapter<string, number | string>(10);
        let lru = adapter.create();
        adapter.set(lru, 'a', 1);
        adapter.set(lru, 'b', 2);
        let returned: unknown;
        lru = mutate(lru, useImmer, draft => { returned = recipe(adapter, draft); });
        return {returned, entries: Array.from(adapter.getIterable(lru))};
      };

      it('returns the value an inner update stored before the updater set the key again', () => {
        expect(run((adapter, draft) => adapter.update(draft, 'a', () => { adapter.update(draft, 'a', () => 8); adapter.set(draft, 'a', 9); })))
          .toEqual({returned: 8, entries: [['b', 2], ['a', 9]]});
      });

      it('returns the value an inner update stored before the updater removed the key', () => {
        expect(run((adapter, draft) => adapter.update(draft, 'a', () => { adapter.update(draft, 'a', () => 8); adapter.remove(draft, 'a'); })))
          .toEqual({returned: 8, entries: [['b', 2]]});
      });

      it('returns what an inner updater returned after setting the key again', () => {
        expect(run((adapter, draft) => adapter.update(draft, 'a', () => {
          adapter.update(draft, 'a', () => { adapter.set(draft, 'a', 9); return 'inner'; });
        }))).toEqual({returned: 'inner', entries: [['b', 2], ['a', 9]]});
      });

      it('lets an update that starts after the key was set again work on the new entry', () => {
        expect(run((adapter, draft) => adapter.update(draft, 'a', () => {
          adapter.set(draft, 'a', 9);
          adapter.update(draft, 'a', () => 8);
          return 'outer';
        }))).toEqual({returned: 'outer', entries: [['b', 2], ['a', 8]]});
      });
    });

    it('is not affected by the same key being set in another cache', () => {
      const adapter = new LruCacheAdapter<string, number>(10);
      const one = adapter.create(), two = adapter.create();
      adapter.set(one, 'a', 1);
      adapter.set(one, 'b', 2);
      adapter.set(two, 'a', 1);
      expect(adapter.update(one, 'a', () => { adapter.set(two, 'a', 5); adapter.get(one, 'b'); return 7; })).toBe(7);
      expect(Array.from(adapter.getIterable(one))).toEqual([['b', 2], ['a', 7]]);
      expect(Array.from(adapter.getIterable(two))).toEqual([['a', 5]]);
    });

    it('notices a NaN key being set again, by another adapter too', () => {
      const adapter = new LruCacheAdapter<number | string, number>(10);
      const other = new LruCacheAdapter<number | string, number>(10);
      const lru = adapter.create();
      adapter.set(lru, NaN, 1);
      adapter.set(lru, 'b', 2);
      expect(adapter.update(lru, NaN, () => { other.set(lru, NaN, 5); adapter.get(lru, 'b'); return 9; })).toBe(9);
      expect(Array.from(adapter.getIterable(lru))).toEqual([[NaN, 5], ['b', 2]]);
    });

    it('stores the result for an entry whose value is NaN', () => {
      const adapter = new LruCacheAdapter<string, number>(10);
      const lru = adapter.create();
      adapter.set(lru, 'a', NaN);
      adapter.set(lru, 'b', 2);
      expect(adapter.update(lru, 'a', () => { adapter.get(lru, 'b'); return 5; })).toBe(5);
      expect(Array.from(adapter.getIterable(lru))).toEqual([['b', 2], ['a', 5]]);
    });
  });

  describe('keys that JSON cannot represent', () => {
    // JSON stores NaN and the infinities as null. Such an entry cannot be
    // looked up again (here not even to evict it: it shares a collision
    // bucket with key 0), but it must not disturb the other keys, and the
    // indexes must keep describing the map.
    it.each([NaN, Infinity, -Infinity])('keeps the other keys usable after a round trip of a cache holding %s', special => {
      const adapter = new LruCacheAdapter<number | string, string>(10);
      let lru = adapter.create();
      [special, 0, 7, 'x', 3].forEach(key => adapter.set(lru, key, `value ${key}`));
      lru = JSON.parse(JSON.stringify(lru));

      // Every other key is still found, by the map and by both indexes: 0 in
      // particular, which sorts next to the restored key.
      lru = produce(lru, draft => {
        for (const key of [3, 0, 7, 'x']) expect(adapter.get(draft, key)).toBe(`value ${key}`);
      });
      expect(Array.from<unknown>(adapter.getKeysIterable(lru))).toEqual([null, 3, 0, 7, 'x']);

      lru = produce(lru, draft => {
        adapter.remove(draft, 0);
        adapter.set(draft, 7, 'again');
        expect(adapter.get(draft, 'x')).toBe('value x');
        adapter.set(draft, 0.5, 'new');
      });
      expect(adapter.has(lru, 0)).toBe(false);
      expect(Array.from<unknown>(adapter.getKeysIterable(lru))).toEqual([null, 3, 7, 'x', 0.5]);
      expect(adapter.getSize(lru)).toBe(5);

      lru = produce(lru, draft => { for (let i = 100; i < 107; i++) adapter.set(draft, i, 'filler'); });
      expect(Array.from<unknown>(adapter.getKeysIterable(lru))).toEqual([null, 7, 'x', 0.5, 100, 101, 102, 103, 104, 105, 106]);
      expect(adapter.getSize(lru)).toBe(11);
      expect(Array.from(adapter.getValuesIterable(lru))).toHaveLength(11);
    });
  });

  describe('a restored cache holding a key that JSON cannot represent', () => {
    const indexed = (lru: any) => [lru.size, Array.from(new LruCacheAdapter<number, string>(4).getKeysIterable(lru)).length];

    it('fails, as version 3 did, when the key is set a second time, and keeps its indexes describing its map', () => {
      const adapter = new LruCacheAdapter<number, string>(4);
      let lru = adapter.create();
      adapter.set(lru, 0, 'zero');
      adapter.set(lru, NaN, 'special');

      // The first set after a restore adds an entry beside the restored one.
      lru = produce(JSON.parse(JSON.stringify(lru)) as typeof lru, draft => { adapter.set(draft, NaN, 'again'); });
      expect(indexed(lru)).toEqual([3, 3]);

      // After another restore, neither entry can be told from the other.
      const restored: typeof lru = JSON.parse(JSON.stringify(lru));
      expect(() => produce(restored, draft => { adapter.set(draft, NaN, 'third'); })).toThrow(/Key NaN not found in the LRU cache's index/);
      expect(indexed(restored)).toEqual([3, 3]);

      // On plain state too, the failed call changes nothing.
      const plain: typeof lru = JSON.parse(JSON.stringify(lru));
      const before = JSON.stringify(plain);
      expect(() => adapter.set(plain, NaN, 'third')).toThrow(/Key NaN not found in the LRU cache's index/);
      expect(JSON.stringify(plain)).toBe(before);
      // And so does one caught inside a producer.
      const caught = produce(restored, draft => {
        try { adapter.set(draft, NaN, 'third'); } catch (error) { /* The recipe carries on. */ }
      });
      expect(caught).toBe(restored);

      // The other keys keep working, and eviction keeps the cache within bounds.
      let next = restored;
      for (let key = 1; key <= 20; key++) next = produce(next, draft => { adapter.set(draft, key, 'filler'); });
      const [size, listed] = indexed(next);
      expect(listed).toBe(size);
      expect(size).toBeLessThanOrEqual(6);
      expect(adapter.peek(next, 20)).toBe('filler');
    });

    it('keeps both indexes describing the map with several such keys among many', () => {
      // (order, key) pairs of an index, which is two levels deep here.
      const pairs = (node: any): string[] => node.c === undefined
        ? node.k.map((key: unknown, i: number) => `${node.o[i]}:${typeof key}:${key}`)
        : node.c.reduce((all: string[], child: any) => all.concat(pairs(child)), []);
      const check = (lru: any, adapter: LruCacheAdapter<number | string, number>) => {
        const tree = pairs(lru.tree), uses = pairs(lru.uses);
        expect([...uses].sort()).toEqual([...tree].sort());
        expect(tree).toHaveLength(adapter.getSize(lru));
        // Orders are distinct and ascending in the recency index.
        const orders = tree.map(pair => Number(pair.split(':')[0]));
        expect(orders).toEqual([...new Set(orders)].sort((a, b) => a - b));
      };
      const adapter = new LruCacheAdapter<number | string, number>(200);
      let lru = adapter.create();
      const keys: Array<number | string> = [NaN, Infinity, -Infinity, -0, 0.5, '', 'x', '1'];
      for (let i = 1; i <= 90; i++) keys.push(i, `key ${i}`);
      keys.forEach((key, i) => adapter.set(lru, key, i));
      check(lru, adapter);
      expect(lru.uses.c).toBeDefined();

      lru = JSON.parse(JSON.stringify(lru));
      check(lru, adapter);
      lru = produce(lru, draft => {
        for (let i = 1; i <= 90; i += 3) expect(adapter.get(draft, i)).toBe(keys.indexOf(i));
        for (let i = 2; i <= 90; i += 3) adapter.remove(draft, `key ${i}`);
        for (let i = 3; i <= 90; i += 3) adapter.set(draft, i, -i);
        adapter.set(draft, 0.25, 1);
        adapter.remove(draft, '');
        expect(adapter.update(draft, '1', value => value + 1)).toBe(keys.indexOf('1') + 1);
      });
      check(lru, adapter);
      expect(adapter.peek(lru, 'x')).toBe(keys.indexOf('x'));
      expect(adapter.has(lru, '')).toBe(false);
    });

    it('leaves the entry in place when it is removed by its restored key', () => {
      const adapter = new LruCacheAdapter<number, string>(10);
      const lru = adapter.create();
      [NaN, 0, 5].forEach(key => adapter.set(lru, key, `value ${key}`));
      const restored: typeof lru = JSON.parse(JSON.stringify(lru));

      // NaN shares a collision bucket with 0, where the map looks entries up by name.
      const next = produce(restored, draft => { adapter.remove(draft, null as any); });

      expect(Array.from<unknown>(adapter.getKeysIterable(next))).toEqual([null, 0, 5]);
      expect(adapter.getSize(next)).toBe(3);
    });
  });

  it('never reads its indexes through the draft', () => {
    const adapter = new LruCacheAdapter<number, string>(100);
    const lru = produce(adapter.create(), draft => { for (let i = 0; i < 50; i++) adapter.set(draft, i, `value ${i}`); });
    const held = (draft: typeof lru, name: 'tree' | 'uses') => Object.getOwnPropertyDescriptor(draft, name)!.value;

    produce(lru, draft => {
      adapter.peek(draft, 1);
      adapter.has(draft, 2);
      expect(Array.from(adapter.getKeysIterable(draft))).toHaveLength(50);
      adapter.get(draft, 1000);
      // A read through the draft would have left a draft of the index in it.
      // (Compared here, not by expect: it could not print a draft once the producer is over.)
      expect(held(draft, 'tree') === lru.tree).toBe(true);
      expect(held(draft, 'uses') === lru.uses).toBe(true);

      adapter.get(draft, 3);
      adapter.set(draft, 60, 'new');
      adapter.remove(draft, 4);
      expect(isDraft(held(draft, 'tree')) || isDraft(held(draft, 'uses'))).toBe(false);
      expect(held(draft, 'tree') === lru.tree).toBe(false);
    });
  });

  it('reads its indexes correctly after a nested producer has drafted them', () => {
    const adapter = new LruCacheAdapter<number | string, number>(10);
    const state = produce({lru: adapter.create()}, draft => { for (let i = 0; i < 5; i++) adapter.set(draft.lru, i, i); });

    const next = produce(state, draft => {
      // Its result is discarded, but the outer draft's indexes are now drafts.
      produce(draft.lru, inner => { adapter.set(inner, 'x', 1); });
      adapter.get(draft.lru, 3);
    });

    // A draft left in the finished state would be a revoked proxy.
    expect(() => JSON.stringify(next)).not.toThrow();
    expect(Array.from(adapter.getKeysIterable(next.lru))).toEqual([0, 1, 2, 4, 3]);
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
