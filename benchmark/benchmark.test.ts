import produce, {setAutoFreeze, setUseProxies} from 'immer';
import {createMap, getInMap, setInMap} from '../src/map';
import {createBTree, insertInBTree} from '../src/btree';

setUseProxies(true);
setAutoFreeze(false);
declare const global: any;

const ITERATIONS = 4000;
type Obj = { order?: number, id?: number|string, data?: string };

describe('benchmarks', () => {
  beforeEach(() => {
    global.gc();
  });

  describe('map', () => {
    test('set', () => {
      let state = { map: createMap<number, Obj>() };

      for (let i = 0; i < ITERATIONS; i++) {
        state = produce(state, (draft: typeof state) => {
          setInMap(draft.map, i, { id: i, data: i.toString() });
        });
      }
    });
  });

  describe('array', () => {
    test('insert in order', () => {
      let state = { array: [] as Obj[] };

      for (let i = 0; i < ITERATIONS; i++) {
        state = produce(state, (draft: typeof state) => {
          draft.array.push({ id: i, data: i.toString() });
        });
      }
    });
  });

  describe('btree', () => {
    const comparer = (a: Obj, b: Obj) => a.order! - b.order!;

    test('insert in order', () => {
      let state = { btree: createBTree<Obj>(127) };

      for (let i = 0; i < ITERATIONS; i++) {
        state = produce(state, (draft: typeof state) => {
          insertInBTree(draft.btree, { data: i.toString(), order: i }, comparer);
        });
      }
    });
  });
});