import {SortedCollectionAdapter} from '../src/sortedcollection';

require('source-map-support').install();
import produce, {setAutoFreeze, setUseProxies} from 'immer';
import {MapAdapter} from '../src/map';
import {SortedMapAdapter} from '../src/sortedmap';
import {LruCacheAdapter} from '../src/lrucache';

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
  benchmark('immerutable map (set)', (iterations) => {
    const adapter = new MapAdapter<number, Obj>();
    let state = { map: adapter.create() };

    for (let i = 0; i < iterations; i++) {
      state = produce(state, (draft: typeof state) => {
        adapter.set(draft.map, i, { id: i, data: i.toString() });
      });
    }
  });
}

function immerutableBtree() {
  const sortedCollectionAdapter = new SortedCollectionAdapter<Obj>({
    orderComparer: (a: Obj, b: Obj) => a.order! - b.order!,
  });

  benchmark('immerutable sorted collection (insert in increasing order)', (iterations) => {
    let state = { btree: sortedCollectionAdapter.create() };

    for (let i = 0; i < iterations; i++) {
      state = produce(state, (draft: typeof state) => {
        sortedCollectionAdapter.insert(draft.btree, { data: i.toString(), order: i });
      });
    }
  });

  benchmark('immerutable sorted collection (insert in random order)', (iterations) => {
    let state = { btree: sortedCollectionAdapter.create() };

    for (let i = 0; i < iterations; i++) {
      state = produce(state, (draft: typeof state) => {
        sortedCollectionAdapter.insert(draft.btree, { data: i.toString(), order: Math.random() });
      });
    }
  });

  benchmark('immerutable sorted collection (insert in decreasing order)', (iterations) => {
    let state = { btree: sortedCollectionAdapter.create() };

    for (let i = iterations - 1; i >= 0; i--) {
      state = produce(state, (draft: typeof state) => {
        sortedCollectionAdapter.insert(draft.btree, { data: i.toString(), order: i });
      });
    }
  });

  benchmark(`immerutable sorted collection iteration (inside immer) (size: ${ITERATIONS})`, (() => {
    let state = { btree: sortedCollectionAdapter.create() };
    for (let i = 0; i < ITERATIONS; i++) {
      sortedCollectionAdapter.insert(state.btree, {data: i.toString(), order: i });
    }

    return () => {
      state = produce(state, (draft: typeof state) => {
        for (const item of sortedCollectionAdapter.getIterable(draft.btree)) {

        }
      });
    };
  })());

  benchmark(`immerutable sorted collection iteration (outside immer) (size: ${ITERATIONS})`, (() => {
    let state = { btree: sortedCollectionAdapter.create() };
    for (let i = 0; i < ITERATIONS; i++) {
      sortedCollectionAdapter.insert(state.btree, {data: i.toString(), order: i });
    }

    return () => {
      for (const item of sortedCollectionAdapter.getIterable(state.btree)) {

      }
    };
  })());
}

function immerutableSortedMap() {
  const sortedMapAdapter = new SortedMapAdapter<string, Obj, number>({
    getOrderingKey: (obj: Obj) => obj.order!,
  });

  benchmark('immerutable sorted map (insert in increasing order)', (iterations) => {
    let state = { sortedMap: sortedMapAdapter.create() };

    for (let i = 0; i < iterations; i++) {
      state = produce(state, (draft: typeof state) => {
        sortedMapAdapter.set(draft.sortedMap, i.toString(), { data: i.toString(), order: i });
      });
    }
  });

  benchmark('immerutable sorted map (insert in random order)', (iterations) => {
    let state = { sortedMap: sortedMapAdapter.create() };

    for (let i = 0; i < iterations; i++) {
      state = produce(state, (draft: typeof state) => {
        sortedMapAdapter.set(draft.sortedMap, i.toString(), { data: i.toString(), order: Math.random() });
      });
    }
  });

  benchmark('immerutable sorted map (insert in decreasing order)', (iterations) => {
    let state = { sortedMap: sortedMapAdapter.create() };

    for (let i = iterations - 1; i >= 0; i--) {
      state = produce(state, (draft: typeof state) => {
        sortedMapAdapter.set(draft.sortedMap, i.toString(), { data: i.toString(), order: i });
      });
    }
  });

  benchmark(`immerutable sorted map iteration (inside immer) (size: ${ITERATIONS})`, (() => {
    let state = { sortedMap: sortedMapAdapter.create() };
    for (let i = 0; i < ITERATIONS; i++) {
      sortedMapAdapter.set(state.sortedMap, i.toString(), {data: i.toString(), order: i });
    }

    return () => {
      state = produce(state, (draft: typeof state) => {
        for (const item of sortedMapAdapter.getIterable(draft.sortedMap)) {

        }
      });
    };
  })());

  benchmark(`immerutable sorted map iteration (outside immer) (size: ${ITERATIONS})`, (() => {
    let state = { sortedMap: sortedMapAdapter.create() };
    for (let i = 0; i < ITERATIONS; i++) {
      sortedMapAdapter.set(state.sortedMap, i.toString(), {data: i.toString(), order: i });
    }

    return () => {
      for (const item of sortedMapAdapter.getIterable(state.sortedMap)) {

      }
    };
  })());
}

function immerArray() {
  benchmark('immer array (insert in increasing order)', (iterations) => {
    let state = { array: [] as Obj[] };

    for (let i = 0; i < iterations; i++) {
      state = produce(state, (draft: typeof state) => {
        draft.array.push({ id: i, data: i.toString() });
      });
    }
  });

  benchmark('immer array (insert in random order)', (iterations) => {
    let state = { array: [] as Obj[] };

    for (let i = 0; i < iterations; i++) {
      state = produce(state, (draft: typeof state) => {
        draft.array.splice(Math.floor(Math.random() * i), 0, { id: i, data: i.toString() });
      });
    }
  });

  benchmark('immer array (insert in decreasing order)', (iterations) => {
    let state = { array: [] as Obj[] };

    for (let i = iterations - 1; i >= 0 ; i--) {
      state = produce(state, (draft: typeof state) => {
        draft.array.unshift({ id: i, data: i.toString() });
      });
    }
  });

  benchmark('immer array iteration (inside immer) (size = 4000)', () => {
    let state = { array: [] as Obj[] };
    for (let i = 0; i < ITERATIONS; i++) {
      state.array.push({ id: i, data: i.toString() });
    }

    return () => {
      state = produce(state, (draft: typeof state) => {
        for (const item of draft.array) {

        }
      });
    };
  });
}

function immerMap() {
  benchmark('immer map (set)', (iterations) => {
    let state = { map: Object.create(null) };

    for (let i = 0; i < iterations; i++) {
      state = produce(state, (draft: typeof state) => {
        draft.map[i] = { id: i, data: i.toString() };
      });
    }
  });
}

function lruCache() {
  benchmark(`lru cache (50% capacity)`, (iterations) => {
    const lruCache = new LruCacheAdapter(iterations / 2);

    let state = { lru: lruCache.create() };

    for (let i = 0; i < iterations; i++) {
      state = produce(state, (draft: typeof state) => {
        lruCache.set(draft.lru, i, { data: i });
      });
    }
  });

  benchmark(`lru cache (10% capacity)`, (iterations) => {
    const lruCache = new LruCacheAdapter(iterations / 10);

    let state = { lru: lruCache.create() };

    for (let i = 0; i < iterations; i++) {
      state = produce(state, (draft: typeof state) => {
        lruCache.set(draft.lru, i, { data: i });
      });
    }
  });
}

function divider() {
  console.log('-------------------------------------------');
}

immerMap();
immerutableMap();

divider();

immerArray();
immerutableBtree();

divider();

immerutableSortedMap();

divider();

lruCache();