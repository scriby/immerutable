// Compare batched LRU eviction with a correct, allocation-light reference that
// reacquires the oldest key for every deletion. The old implementation evicts
// incorrect keys, so its timings are not a valid correctness-equivalent baseline.
import {strict as assert} from 'assert';
import {writeFileSync} from 'fs';
import {produce} from 'immer';
import {LruCacheAdapter, SortedMapAdapter} from '../src';

const sizes = (process.env.BENCH_SIZES || '10,1000,10000,100000').split(',').map(Number);
const samples = Number(process.env.BENCH_SAMPLES || 10);
const results: any[] = [];
for (const capacity of sizes) for (const mode of ['direct', 'immer']) {
  const threshold = Math.floor(capacity * 1.1);
  const timings: {[name: string]: number[]} = {snapshot: [], reacquire: []};
  const heapDeltas: {[name: string]: number[]} = {snapshot: [], reacquire: []};
  for (let sample = -3; sample < samples; sample++) {
    // Alternate order to avoid consistently giving one implementation the
    // hotter runtime. Setup, GC and validation are outside the timed region.
    for (const name of sample % 2 ? ['snapshot', 'reacquire'] : ['reacquire', 'snapshot']) {
      const cacheAdapter = new LruCacheAdapter<number, number>(capacity);
      const sortedAdapter = new SortedMapAdapter<number, {order: number}>({getOrderingKey: item => item.order});
      let state: any = name === 'snapshot' ? cacheAdapter.create() : sortedAdapter.create();
      for (let key = 0; key < threshold; key++) {
        if (name === 'snapshot') cacheAdapter.set(state, key, key);
        else sortedAdapter.set(state, key, {order: key});
      }
      const evict = (draft: any) => {
        if (name === 'snapshot') cacheAdapter.set(draft, threshold, threshold);
        else {
          sortedAdapter.set(draft, threshold, {order: threshold});
          while (sortedAdapter.getSize(draft) > capacity) {
            const key = sortedAdapter.getKeysIterable(draft)[Symbol.iterator]().next().value;
            sortedAdapter.remove(draft, key);
          }
        }
      };
      if (global.gc) global.gc();
      const heapBefore = process.memoryUsage().heapUsed;
      const start = process.hrtime.bigint();
      if (mode === 'immer') state = produce(state, evict);
      else evict(state);
      const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
      const heapDelta = process.memoryUsage().heapUsed - heapBefore;
      const actual = Array.from(name === 'snapshot' ? cacheAdapter.getKeysIterable(state) : sortedAdapter.getKeysIterable(state));
      assert.deepEqual(actual, Array.from({length: capacity}, (_, i) => threshold + 1 - capacity + i));
      if (sample >= 0) { timings[name].push(elapsedMs); heapDeltas[name].push(heapDelta); }
    }
  }
  for (const name of ['snapshot', 'reacquire']) {
    const sorted = [...timings[name]].sort((a, b) => a - b);
    const row = {capacity, mode, algorithm: name, victims: threshold + 1 - capacity,
      medianMs: sorted[Math.floor(samples / 2)], p90Ms: sorted[Math.min(samples - 1, Math.floor(samples * .9))],
      samplesMs: timings[name], heapDeltas: heapDeltas[name]};
    results.push(row);
    console.log(`${capacity} ${mode} ${name}: ${row.medianMs.toFixed(3)} ms`);
  }
  writeFileSync(process.argv[2] || 'dist/eviction-performance.json', JSON.stringify({node: process.version, samples, results}, null, 2));
}
