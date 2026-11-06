// Repeatable steady-state benchmarks. Compile first, then run:
// node --expose-gc dist/benchmark/review.js dist/src dist/performance.json
// BENCH_SIZES, BENCH_SAMPLES, BENCH_FILTER and BENCH_MODES narrow the matrix.
// BENCH_COMPARE adds a second build, measured back-to-back with the first.
import {strict as assert} from 'assert';
import {writeFileSync} from 'fs';
import {resolve} from 'path';
import {execFileSync} from 'child_process';
import produce, {setAutoFreeze} from 'immer';

const moduleRoot = resolve(process.argv[2] || 'dist/src');
const moduleRoots = process.env.BENCH_COMPARE ? [moduleRoot, resolve(process.env.BENCH_COMPARE)] : [moduleRoot];
const libraries: Array<typeof import('../src')> = moduleRoots.map(root => require(root));
const sizes = (process.env.BENCH_SIZES || '10,1000,10000,100000').split(',').map(Number);
const samples = Number(process.env.BENCH_SAMPLES || 10);
const modes = (process.env.BENCH_MODES || 'direct,immer,batch').split(',');
const filter = new RegExp(process.env.BENCH_FILTER || '');
setAutoFreeze(process.env.BENCH_FREEZE === 'true');

interface Fixture {
  run(count: number): number;
  verify(): void;
}
interface Result {
  name: string;
  size: number;
  mode: string;
  operations: number;
  medianNs: number;
  p90Ns: number;
  samplesNs: number[];
  verified: boolean;
  validationError?: string;
}
const results: Result[] = [];
let checksum = 0;
const revision = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
function save() {
  writeFileSync(process.argv[3] || 'dist/performance.json', JSON.stringify({
    revision, moduleRoot, moduleRoots, node: process.version, platform: process.platform, arch: process.arch,
    autoFreeze: process.env.BENCH_FREEZE === 'true', samples, checksum, results,
  }, null, 2));
}

function measure(name: string, size: number, mode: string, create: () => Fixture) {
  let operations = /iterate|backward|build/.test(name) ? 1 : mode === 'direct' ? 1000 : 100;
  // Calibrate to at least 25ms per sample, including JIT warmup. Fixtures and
  // correctness checks stay outside the measured region.
  for (let warmup = 0; warmup < 6; warmup++) {
    const fixture = create();
    const start = process.hrtime.bigint();
    checksum += fixture.run(operations);
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
    operations = Math.max(1, Math.min(2000000, Math.ceil(operations * 35 / Math.max(elapsedMs, .01))));
  }
  const samplesNs: number[] = [];
  let validationError: string | undefined;
  for (let sample = 0; sample < samples; sample++) {
    const fixture = create();
    if (global.gc) global.gc();
    const start = process.hrtime.bigint();
    checksum += fixture.run(operations);
    samplesNs.push(Number(process.hrtime.bigint() - start) / operations);
    try { fixture.verify(); } catch (error) { validationError = String(error); }
  }
  const sorted = [...samplesNs].sort((a, b) => a - b);
  const result = {name, size, mode, operations, medianNs: sorted[Math.floor(samples / 2)],
    p90Ns: sorted[Math.min(samples - 1, Math.floor(samples * .9))], samplesNs,
    verified: validationError === undefined, validationError};
  results.push(result);
  save();
  console.log(`${name} ${size} ${mode}: ${result.medianNs.toFixed(0)} ns/op${validationError ? ' (incorrect result)' : ''}`);
}

const names = [
  'map/build', 'map/get', 'map/miss', 'map/overwrite', 'map/churn', 'map/iterate',
  'map/strings', 'map/collisions', 'map/restored',
  'sorted/build', 'sorted/unchanged', 'sorted/reorder', 'sorted/iterate', 'sorted/backward',
  'collection/reorder', 'lru/hit', 'lru/evict',
];
for (const size of sizes) for (const mode of modes) for (const name of names) for (let variant = 0; variant < libraries.length; variant++) {
  if (!filter.test(name)) continue;
  const library = libraries[variant];
  measure(libraries.length === 1 ? name : `${variant === 0 ? 'baseline' : 'candidate'}:${name}`, size, mode, () => {
    const sorted = name.startsWith('sorted');
    const collection = name.startsWith('collection');
    const lru = name.startsWith('lru');
    // A small collision-heavy fixture is intentional: it measures bucket work,
    // independently of the large random/sequential map size sweep.
    const length = name === 'map/collisions' ? Math.min(size, 8) : size;
    const adapter: any = lru ? new library.LruCacheAdapter<number, any>(length)
      : collection ? new library.SortedCollectionAdapter<any>({
        orderComparer: (a, b) => a.order - b.order, equalityComparer: (a, b) => a.id === b.id,
      }) : sorted ? new library.SortedMapAdapter<number, any>({getOrderingKey: item => item.order})
      : new library.MapAdapter<number | string, any>();
    const keys = Array.from({length}, (_, i) => name === 'map/strings' ? `item:${i}`
      : name === 'map/collisions' ? 1 + i * 2 ** 28 : i);
    let state = adapter.create();
    for (let i = 0; !name.endsWith('/build') && i < length; i++) {
      const value = {id: i, order: i, count: 1};
      if (collection) adapter.insert(state, value);
      else adapter.set(state, keys[i], value);
    }
    if (name === 'map/restored') state = JSON.parse(JSON.stringify(state));
    let sequence = 0;
    const step = (draft: any, i: number): number => {
      const key = keys[(Math.imul(i, 2654435761) >>> 0) % length];
      switch (name) {
        case 'map/get': case 'map/strings': case 'map/collisions': case 'map/restored':
          return adapter.get(draft, key).count;
        case 'map/miss': return adapter.has(draft, length + i) ? 1 : 0;
        case 'map/overwrite': adapter.set(draft, key, {id: key, order: key, count: 1}); return 1;
        case 'map/churn':
          adapter.remove(draft, key); adapter.set(draft, key, {id: key, order: key, count: 1}); return 1;
        case 'sorted/unchanged':
          adapter.update(draft, key, (item: any) => { item.count++; }); return 1;
        case 'sorted/reorder':
          adapter.update(draft, key, (item: any) => { item.order = length + i; }); return 1;
        case 'collection/reorder': {
          const item = adapter.getFirst(draft);
          adapter.update(draft, item, (value: any) => { value.order = length + i; }); return 1;
        }
        case 'lru/hit': return adapter.get(draft, key).count;
        case 'lru/evict': adapter.set(draft, length + i, {id: length + i, order: i, count: 1}); return 1;
        default: {
          let sum = 0;
          const iterable = name === 'map/iterate' ? adapter.getValuesIterable(draft)
            : adapter.getValuesIterable(draft, name === 'sorted/backward' ? 'backward' : 'forward');
          for (const value of iterable) sum += value.count;
          return sum;
        }
      }
    };
    return {
      run(count) {
        let sum = 0;
        if (name.endsWith('/build')) {
          // Here one operation is a complete construction. "immer" measures
          // one transaction per insertion, "batch" one per whole construction.
          for (let build = 0; build < count; build++) {
            state = adapter.create();
            if (mode === 'batch') state = produce(state, (draft: any) => {
              for (let i = 0; i < length; i++) adapter.set(draft, keys[i], {id: i, order: i, count: 1});
            });
            else for (let i = 0; i < length; i++) {
              const value = {id: i, order: i, count: 1};
              if (mode === 'immer') state = produce(state, (draft: any) => { adapter.set(draft, keys[i], value); });
              else adapter.set(state, keys[i], value);
            }
          }
          return count * length;
        }
        if (mode === 'batch') {
          state = produce(state, (draft: any) => {
            for (let i = 0; i < count; i++) sum += step(draft, sequence++);
          });
        } else for (let i = 0; i < count; i++) {
          if (mode === 'immer') state = produce(state, (draft: any) => { sum += step(draft, sequence++); });
          else sum += step(state, sequence++);
        }
        return sum;
      },
      verify() {
        const values: any[] = Array.from(collection ? adapter.getIterable(state) : adapter.getValuesIterable(state));
        assert.equal(adapter.getSize(state), values.length);
        if (name === 'lru/evict') {
          const expected = Array.from({length: values.length}, (_, i) => length + sequence - values.length + i);
          assert.deepEqual(values.map(value => value.id), expected);
        } else {
          assert.equal(values.length, length);
          assert.deepEqual(values.map(value => value.id).sort((a, b) => a - b), Array.from({length}, (_, i) => i));
          if (sorted || collection) for (let i = 1; i < values.length; i++) assert.ok(values[i - 1].order <= values[i].order);
        }
      },
    };
  });
}
save();
if (results.some(result => !result.verified) && process.env.BENCH_ALLOW_INVALID !== 'true') process.exitCode = 1;
