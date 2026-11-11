import {createDraft, finishDraft, produce, setAutoFreeze} from 'immer';
import {LruCacheAdapter} from './lrucache';
import {MapAdapter} from './map';
import {SortedCollectionAdapter} from './sortedcollection';
import {SortedMapAdapter} from './sortedmap';

// Every adapter against a simple model, under each way of running a recipe
// and with Immer's auto-freeze on and off. Several adapter calls share a
// recipe, and the state before each recipe must be left as it was.

type Apply = <S extends object>(state: S, recipe: (draft: S) => void) => S;

const drivers: Array<[string, Apply]> = [
  ['produce', (state, recipe) => produce(state, recipe)],
  ['createDraft and finishDraft', (state, recipe) => {
    const draft = createDraft(state);
    recipe(draft as typeof state);
    return finishDraft(draft) as typeof state;
  }],
];

function generator(seed: number) {
  return (limit: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed >>> 8) % limit;
  };
}

/** Runs steps recipes of one to four calls each, checking the state after each and the state before it. */
function run<S extends object>(apply: Apply, initial: S, call: (draft: S, random: (limit: number) => number) => void, check: (state: S) => void): void {
  const random = generator(12345);
  let state = initial;
  for (let step = 0; step < 250; step++) {
    const before = state;
    const snapshot = JSON.stringify(before);
    state = apply(state, draft => { for (let calls = 1 + random(4); calls > 0; calls--) call(draft, random); });
    check(state);
    expect(JSON.stringify(before)).toBe(snapshot);
    // A draft left in the finished state would be a revoked proxy.
    expect(() => JSON.stringify(state)).not.toThrow();
  }
}

describe.each([true, false])('adapters against a model (auto-freeze: %s)', autoFreeze => {
  beforeAll(() => { setAutoFreeze(autoFreeze); });
  afterAll(() => { setAutoFreeze(true); });

  describe.each(drivers)('%s', (_name, apply) => {
    it('map', () => {
      const adapter = new MapAdapter<number, {n: number}>();
      const model = new Map<number, number>();
      run(apply, adapter.create(), (draft, random) => {
        const key = random(60), operation = random(5);
        expect(adapter.has(draft, key)).toBe(model.has(key));
        if (operation < 2) { adapter.set(draft, key, {n: key}); model.set(key, key); }
        else if (operation === 2) { adapter.remove(draft, key); model.delete(key); }
        else if (operation === 3) { adapter.update(draft, key, value => { value.n++; }); if (model.has(key)) model.set(key, model.get(key)! + 1); }
        else { const value = adapter.get(draft, key); if (value !== undefined) { value.n += 10; model.set(key, model.get(key)! + 10); } }
      }, state => {
        const entries = Array.from(adapter.getIterable(state)).map(([key, value]) => [key, value.n]).sort((a, b) => a[0] - b[0]);
        expect(entries).toEqual(Array.from(model).sort((a, b) => a[0] - b[0]));
        expect(adapter.getSize(state)).toBe(model.size);
      });
    });

    it('sorted map', () => {
      const adapter = new SortedMapAdapter<number, {o: number}>({getOrderingKey: value => value.o, maxItemsPerLevel: 4});
      const model = new Map<number, number>();
      run(apply, adapter.create(), (draft, random) => {
        const key = random(60), operation = random(4), order = random(30);
        if (operation < 2) { adapter.set(draft, key, {o: order}); model.set(key, order); }
        else if (operation === 2) { adapter.remove(draft, key); model.delete(key); }
        else { adapter.update(draft, key, value => { value.o = order; }); if (model.has(key)) model.set(key, order); }
      }, state => {
        const entries = Array.from(adapter.getIterable(state)).map(([key, value]) => [key, value.o]);
        expect(entries).toEqual(Array.from(model).sort((a, b) => a[1] - b[1] || a[0] - b[0]));
        expect(adapter.getSize(state)).toBe(model.size);
      });
    });

    it('sorted collection', () => {
      type Item = {id: number, o: number};
      const adapter = new SortedCollectionAdapter<Item>({
        orderComparer: (a, b) => a.o - b.o, equalityComparer: (a, b) => a.id === b.id, maxItemsPerLevel: 4,
      });
      const model = new Map<number, number>();
      let nextId = 0;
      run(apply, adapter.create(), (draft, random) => {
        const operation = random(5), order = random(30);
        const ids = Array.from(model.keys());
        const id = ids.length === 0 ? -1 : ids[random(ids.length)];
        if (operation < 2 || id < 0) { adapter.insert(draft, {id: nextId, o: order}); model.set(nextId++, order); }
        else if (operation === 2) { adapter.remove(draft, {id, o: model.get(id)!}); model.delete(id); }
        else if (operation === 3) { adapter.update(draft, {id, o: model.get(id)!}, item => { item.o = order; }); model.set(id, order); }
        else { adapter.update(draft, {id, o: model.get(id)!}, () => ({id, o: order})); model.set(id, order); }
      }, state => {
        const items = Array.from(adapter.getIterable(state));
        expect(items.map(item => item.o)).toEqual(Array.from(model.values()).sort((a, b) => a - b));
        expect(items.map(item => [item.id, item.o]).sort((a, b) => a[0] - b[0])).toEqual(Array.from(model).sort((a, b) => a[0] - b[0]));
        expect(adapter.getSize(state)).toBe(model.size);
      });
    });

    it('LRU cache', () => {
      const capacity = 8;
      const adapter = new LruCacheAdapter<number, {n: number}>(capacity);
      // Keys from least to most recently used, and their values.
      let order: number[] = [];
      const values = new Map<number, number>();
      const use = (key: number) => { order = order.filter(other => other !== key); order.push(key); };
      run(apply, adapter.create(), (draft, random) => {
        const key = random(20), operation = random(5);
        if (operation < 2) {
          adapter.set(draft, key, {n: key});
          values.set(key, key);
          use(key);
          if (order.length > Math.floor(capacity * 1.1)) {
            for (const evicted of order.splice(0, order.length - capacity)) values.delete(evicted);
          }
        } else if (operation === 2) {
          adapter.remove(draft, key);
          values.delete(key);
          order = order.filter(other => other !== key);
        } else if (operation === 3) {
          const value = adapter.get(draft, key);
          expect(value === undefined).toBe(!values.has(key));
          if (value !== undefined) { value.n++; values.set(key, values.get(key)! + 1); use(key); }
        } else {
          adapter.update(draft, key, value => ({n: value.n + 100}));
          if (values.has(key)) { values.set(key, values.get(key)! + 100); use(key); }
        }
      }, state => {
        expect(Array.from(adapter.getIterable(state)).map(([key, value]) => [key, value.n])).toEqual(order.map(key => [key, values.get(key)]));
        expect(adapter.getSize(state)).toBe(order.length);
      });
    });
  });
});
