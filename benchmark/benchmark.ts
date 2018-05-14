import {SortedCollection} from '../src/sortedcollection';

require('source-map-support').install();
import produce, {setAutoFreeze, setUseProxies} from 'immer';
import {createMap, getInMap, setInMap} from '../src/map';

setUseProxies(true);
setAutoFreeze(false);
declare const global: any;

const WARMUP_ITERATIONS = 1000;
const ITERATIONS = 4000;
type Obj = { order?: number, id?: number|string, data?: string };

function benchmark(label: string, cb: (iterations: number) => void) {
  cb(WARMUP_ITERATIONS); // Warm up V8 to let it optimize the code
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
  const sortedCollection = new SortedCollection<string, Obj>({
    comparer: (a: Obj, b: Obj) => a.order! - b.order!,
  });

  benchmark('immerutable btree: insert in increasing order', (iterations) => {
    let state = { btree: sortedCollection.create() };

    for (let i = 0; i < iterations; i++) {
      state = produce(state, (draft: typeof state) => {
        sortedCollection.set(draft.btree, { data: i.toString(), order: i });
      });
    }
  });

  benchmark('immerutable btree: insert in random order', (iterations) => {
    let state = { btree: sortedCollection.create() };

    for (let i = 0; i < iterations; i++) {
      state = produce(state, (draft: typeof state) => {
        sortedCollection.set(draft.btree, { data: i.toString(), order: Math.random() });
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

function divider() {
  console.log('-------------------------------------------');
}

//immerMap();
immerutableMap();

divider();

//immerArray();
immerutableBtree();
