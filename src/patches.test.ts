import {applyPatches, enablePatches, produce, produceWithPatches} from 'immer';
import {LruCacheAdapter} from './lrucache';
import {MapAdapter} from './map';
import {SortedCollectionAdapter} from './sortedcollection';
import {SortedMapAdapter} from './sortedmap';

enablePatches();

type Item = {order: number, data: string};

describe('Immer patches', () => {
  describe('sorted map', () => {
    const adapter = new SortedMapAdapter<number, Item>({getOrderingKey: item => item.order});
    const contents = (state: any) => Array.from(adapter.getIterable(state));

    function build(size: number) {
      let state = adapter.create();
      state = produce(state, draft => { for (let i = 0; i < size; i++) adapter.set(draft, i, {order: i, data: `item ${i}`}); });
      return state;
    }

    it.each([
      ['insert', (draft: any) => { adapter.set(draft, -1, {order: 5000.5, data: 'new'}); }],
      ['move', (draft: any) => { adapter.update(draft, 3, item => { item.order = 9000.5; }); }],
      ['remove', (draft: any) => { adapter.remove(draft, 7000); }],
    ])('applies and reverts the patches for a single %s', (operation, recipe) => {
      const state = build(10000);
      const [next, patches, inverse] = produceWithPatches(state, recipe);

      expect(contents(applyPatches(state, patches))).toEqual(contents(next));
      expect(contents(applyPatches(next, inverse))).toEqual(contents(state));
    });

    it('round-trips patches for producers making many changes, including splits and merges', () => {
      const small = new SortedMapAdapter<number, Item>({getOrderingKey: item => item.order, maxItemsPerLevel: 4});
      let state = small.create();
      let seed = 3;
      const random = (n: number) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
      // An independent model, not just Immer's own result.
      const model = new Map<number, number>();

      for (let round = 0; round < 300; round++) {
        const [next, patches, inverse] = produceWithPatches(state, draft => {
          for (let i = 0; i < 1 + random(12); i++) {
            const key = random(120), operation = random(3), order = random(60);
            if (operation === 0) { small.set(draft, key, {order, data: `${round}`}); model.set(key, order); }
            else if (operation === 1) { small.update(draft, key, item => { item.order = order; }); if (model.has(key)) model.set(key, order); }
            else { small.remove(draft, key); model.delete(key); }
          }
        });
        const expected = Array.from(model).sort((x, y) => x[1] - y[1] || x[0] - y[0]);
        expect(Array.from(small.getIterable(next)).map(([key, item]) => [key, item.order])).toEqual(expected);
        const entries = Array.from(small.getIterable(next));
        expect(Array.from(small.getIterable(applyPatches(state, patches)))).toEqual(entries);
        expect(Array.from(small.getIterable(applyPatches(next, inverse)))).toEqual(Array.from(small.getIterable(state)));
        const orders = entries.map(([, item]) => item.order);
        expect(orders).toEqual([...orders].sort((a, b) => a - b));
        state = next;
      }
    });
  });

  it('reads the current index when something drafted it first', () => {
    const adapter = new SortedMapAdapter<number, Item>({getOrderingKey: item => item.order});
    let state = produce(adapter.create(), draft => { for (let i = 0; i < 100; i++) adapter.set(draft, i, {order: i, data: ''}); });
    state = produce(state, draft => {
      expect(JSON.stringify(draft).length).toBeGreaterThan(0);   // drafts the whole state, index included
      adapter.update(draft, 5, item => { item.order = 1000; });
      adapter.set(draft, 500, {order: -1, data: ''});
    });
    const keys = Array.from(adapter.getKeysIterable(state));
    expect(keys[0]).toBe(500);
    expect(keys[keys.length - 1]).toBe(5);
    expect(keys).toHaveLength(101);
  });

  describe('patches applied to a draft, then adapter calls in the same producer', () => {
    // Inside a producer the adapters read the state under a draft for as long
    // as the draft is unmodified. Patches modify it without going through an
    // adapter, and the adapters must see the result.
    it('map', () => {
      const adapter = new MapAdapter<string, number>();
      const base = produce({map: adapter.create()}, draft => { adapter.set(draft.map, 'a', 1); });
      const [, patches] = produceWithPatches(base, draft => { adapter.set(draft.map, 'b', 2); adapter.remove(draft.map, 'a'); });

      const next = produce(base, draft => {
        applyPatches(draft, patches);
        expect([adapter.has(draft.map, 'b'), adapter.get(draft.map, 'b'), adapter.has(draft.map, 'a'), adapter.get(draft.map, 'a')])
          .toEqual([true, 2, false, undefined]);
        adapter.set(draft.map, 'c', 3);
      });

      expect(Array.from(adapter.getIterable(next.map)).sort()).toEqual([['b', 2], ['c', 3]]);
    });

    it('sorted map', () => {
      const adapter = new SortedMapAdapter<string, Item>({getOrderingKey: item => item.order});
      const base = produce({map: adapter.create()}, draft => {
        adapter.set(draft.map, 'a', {order: 1, data: ''});
        adapter.set(draft.map, 'c', {order: 3, data: ''});
      });
      const [, patches] = produceWithPatches(base, draft => { adapter.set(draft.map, 'b', {order: 2, data: ''}); });

      const next = produce(base, draft => {
        applyPatches(draft, patches);
        expect(Array.from(adapter.getKeysIterable(draft.map))).toEqual(['a', 'b', 'c']);
        adapter.set(draft.map, 'z', {order: 0, data: ''});
        adapter.update(draft.map, 'b', item => { item.order = 9; });
      });

      expect(Array.from(adapter.getKeysIterable(next.map))).toEqual(['z', 'a', 'c', 'b']);
      expect(adapter.getSize(next.map)).toBe(4);
    });

    it('LRU cache', () => {
      const adapter = new LruCacheAdapter<string, number>(10);
      const base = produce({lru: adapter.create()}, draft => { adapter.set(draft.lru, 'a', 1); adapter.set(draft.lru, 'c', 3); });
      const [, patches] = produceWithPatches(base, draft => { adapter.set(draft.lru, 'b', 2); adapter.get(draft.lru, 'a'); });

      const next = produce(base, draft => {
        applyPatches(draft, patches);
        expect(Array.from(adapter.getKeysIterable(draft.lru))).toEqual(['c', 'b', 'a']);
        expect(adapter.get(draft.lru, 'c')).toBe(3);
      });

      expect(Array.from(adapter.getIterable(next.lru))).toEqual([['b', 2], ['a', 1], ['c', 3]]);
      expect(adapter.getSize(next.lru)).toBe(3);
    });

    it('sorted collection', () => {
      const adapter = new SortedCollectionAdapter<{id: number, order: number}>({
        orderComparer: (a, b) => a.order - b.order, equalityComparer: (a, b) => a.id === b.id, maxItemsPerLevel: 4,
      });
      const base = produce({items: adapter.create()}, draft => { for (let i = 0; i < 25; i++) adapter.insert(draft.items, {id: i, order: i * 2}); });
      const [, patches] = produceWithPatches(base, draft => {
        adapter.insert(draft.items, {id: 100, order: 15});
        adapter.insert(draft.items, {id: 101, order: 31});
      });

      const next = produce(base, draft => {
        applyPatches(draft, patches);
        adapter.remove(draft.items, {id: 100, order: 15});
        adapter.insert(draft.items, {id: 102, order: 17});
      });

      const ids = Array.from(adapter.getIterable(next.items)).map(item => item.id);
      expect(ids).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 102, 9, 10, 11, 12, 13, 14, 15, 101, 16, 17, 18, 19, 20, 21, 22, 23, 24]);
      expect(adapter.getSize(next.items)).toBe(27);
    });
  });

  describe('LRU cache', () => {
    it('keeps its recency index consistent when an eviction removes many oldest entries in one producer', () => {
      const adapter = new LruCacheAdapter<number, number>(1000);
      let state = produce(adapter.create(), draft => { for (let i = 0; i < 1000; i++) adapter.set(draft, i, i); });
      for (let i = 0; i < 2500; i++) {
        const [next, patches] = produceWithPatches(state, draft => { adapter.set(draft, 1000 + i, i); });
        if (i % 250 === 0) expect(Array.from(adapter.getKeysIterable(applyPatches(state, patches)))).toEqual(Array.from(adapter.getKeysIterable(next)));
        state = next;
      }
      const keys = Array.from(adapter.getKeysIterable(state));
      expect(keys).toEqual(Array.from({length: keys.length}, (_, i) => 3500 - keys.length + i));
      expect(adapter.getSize(state)).toBe(keys.length);
    });

    it('keeps recency through patch round trips', () => {
      const adapter = new LruCacheAdapter<number, string>(10000);
      let state = produce(adapter.create(), draft => { for (let i = 0; i < 10000; i++) adapter.set(draft, i, `value ${i}`); });

      const [next, patches, inverse] = produceWithPatches(state, draft => { adapter.get(draft, 42); });
      const keys = (lru: any) => Array.from(adapter.getKeysIterable(lru));
      expect(keys(applyPatches(state, patches))).toEqual(keys(next));
      expect(keys(next)[9999]).toBe(42);
      expect(keys(applyPatches(next, inverse))).toEqual(keys(state));

      // Several uses and an eviction in one producer.
      const [evicted, morePatches] = produceWithPatches(next, draft => {
        adapter.get(draft, 1);
        adapter.set(draft, 20000, 'new');
        adapter.get(draft, 2);
      });
      expect(keys(applyPatches(next, morePatches))).toEqual(keys(evicted));
      expect(keys(evicted).slice(-3)).toEqual([1, 20000, 2]);
    });
  });
});
