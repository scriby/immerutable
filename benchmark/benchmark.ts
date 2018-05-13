require('source-map-support').install();
import produce, {setAutoFreeze, setUseProxies} from 'immer';
import {createMap, getInMap, setInMap} from '../src/map';
import {createBTree, insertInBTree} from '../src/btree';

setUseProxies(true);
setAutoFreeze(false);
declare const global: any;

const ITERATIONS = 4000;
type Obj = { order?: number, id?: number|string, data?: string };

function benchmark(label: string, cb: (iterations: number) => void) {
  cb(ITERATIONS / 5); // Run once to warm up V8
  global.gc();

  console.time(label);
  cb(ITERATIONS);
  console.timeEnd(label);
}

function immerutableMap() {
  benchmark('immerutable map: setInMap', (iterations) => {
    let state = { map: createMap<number, Obj>() };

    for (let i = 0; i < iterations; i++) {
      state = produce(state, (draft: typeof state) => {
        setInMap(draft.map, i, { id: i, data: i.toString() });
      });
    }
  });
}

function immerutableBtree() {
  const comparer = (a: Obj, b: Obj) => a.order! - b.order!;

  benchmark('immerutable btree: insert in increasing order', (iterations) => {
    let state = { btree: createBTree<Obj>() };

    for (let i = 0; i < iterations; i++) {
      state = produce(state, (draft: typeof state) => {
        insertInBTree(draft.btree, { data: i.toString(), order: i }, comparer);
      });
    }
  });

  benchmark('immerutable btree: insert in random order', (iterations) => {
    let state = { btree: createBTree<Obj>() };

    for (let i = 0; i < iterations; i++) {
      state = produce(state, (draft: typeof state) => {
        insertInBTree(draft.btree, { data: i.toString(), order: Math.random() }, comparer);
      });
    }
  });
}

function immerArray() {
  benchmark('immer array: insert in increasing order', (iterations) => {
    let state = { array: [] as Obj[] };

    for (let i = 0; i < iterations; i++) {
      state = produce(state, (draft: typeof state) => {
        draft.array.push({ id: i, data: i.toString() });
      });
    }
  });

  benchmark('immer array: insert in random order', (iterations) => {
    let state = { array: [] as Obj[] };

    for (let i = 0; i < iterations; i++) {
      state = produce(state, (draft: typeof state) => {
        draft.array.splice(Math.floor(Math.random() * i), 0, { id: i, data: i.toString() });
      });
    }
  });
}

function immerMap() {
  benchmark('immer map: set', (iterations) => {
    let state = { map: Object.create(null) };

    for (let i = 0; i < iterations; i++) {
      state = produce(state, (draft: typeof state) => {
        draft.map[i] = { id: i, data: i.toString() };
      });
    }
  });
}

immerMap();
immerutableMap();

immerArray();
immerutableBtree();
