# Correctness fixes and performance validation

All 18 reviewed findings are implemented. Existing adapter methods retain their
signatures. Legacy unescaped storage is no longer supported; saved maps, sorted
maps, and LRU caches using it must be rebuilt from application data. The original
review remains in [bug-review.md](bug-review.md); the original implementation
plan is in [bug-fix-plan.md](bug-fix-plan.md).

## Implementation decisions

- Map mutations verify membership on the existing lookup path. A protected
  entry lookup lets the sorted-map storage adapter distinguish missing keys
  from undefined values in one pass, without adding a public entry-handle API.
  Public `get`/`has` retain direct lookup paths and inline the NaN-aware equality
  check. No adapter-level path or draft caches were introduced.
- Empty trie slots accept both undefined and JSON-restored null. Removal writes
  an undefined slot: Immer 1.2.1 ES5 can overlook deletion of a sparse-array index.
- Prototype names and strings beginning with NUL are prefixed with NUL in bucket
  storage; logical keys remain unchanged. Escaping the prefix keeps the encoding
  injective. Reads use own properties. There is no legacy detection, conversion,
  or storage-format marker.
- Compatibility testing exposed another Immer 1.2.1 ES5 issue: its descriptor
  cache inherits Object.prototype names such as `constructor`. Updates through
  those properties can mutate an older state. Escaping all prototype names,
  rather than only `__proto__`, avoids that defect too.
- ES5 Immer can damage an own `__proto__` property while creating a draft, before
  the adapter runs. Escaping prevents that property from appearing in bucket
  storage. No runtime prototype recovery or recursive value copying is needed.
  Downgraded adapters cannot interpret escaped entries.
- Sorted-map assignment and callback updating share index maintenance while
  keeping different undefined semantics. Mutable ordering keys are validated
  even when their references are unchanged; unchanged primitive keys keep the
  fast path. Existing B-tree splitting/rebalancing remains intact, with the
  deletion splice corrected to remove exactly one item.
- LRU eviction snapshots only the victim keys before removal, preserving the
  existing overflow allowance and transaction batching. Readonly sizes are live
  getters; each iterator now has one cursor and returns itself when iterated.

## Correctness

- Immer **1.2.1**: **245 source tests passed**, including both proxy and ES5
  drafts, all 53 original regression cases, and 45 compatibility/model cases.
- Immer **11.2.9**: **228 source tests passed**. This release has no ES5 draft
  mode, so the 17 ES5-specific cases are excluded; they are exercised above.
- The six B-tree array-model cases cover 12,000 mixed operations plus complete
  deletion/reuse. The LRU model covers 1,000 operations per case at capacities
  0, 10 and 64, with direct mutation and every available Immer mode.
- Compatibility tests verify current JSON round trips, nested values, escaped
  key collisions, old-state immutability, untouched branch sharing, NaN keys,
  mutable ordering keys, undefined elements and iterator exhaustion.
- Additional escaping tests verify every Object.prototype property name,
  NUL-prefixed keys, nested
  updates after JSON restoration, and preservation of LRU eviction order.
- Before legacy support was simplified, all eight existing fuzz tests passed
  with each fixed seed (`24301` and
  `20261105`) and in a randomized run: **24 fuzz checks passed**. The random
  sorted-map seed was `4887404984167419`; the random map seed was
  `4036449368851833`. These were full-sized runs, not reduced workloads.
- Final `tsc --noEmit` and `git diff --check` passed.

The pinned development dependency remains Immer 1.2.1. Version 11.2.9 was
installed separately under ignored `dist/immer-current`; tests can select it
through `IMMER_MODULE` without changing the dependency lockfile.

## Performance

The removal of automatic legacy repair was compared with the previous
implementation using ten samples per case, 1,000/10,000-entry maps, and direct
and Immer modes. All 32 measurements passed fixture verification. Raw results:
[performance-escaping.json](performance-escaping.json). Ordinary reads, restored
reads, and overwrites were broadly similar (about -14% to +7% in this run).
Collision reads through Immer improved from 6,035 to 5,689 ns/op and from 5,814
to 5,622 ns/op (about 3–6%); direct collision reads were within roughly 2%.
The collision fixture contains eight keys regardless of the map-size label.
These are local measurements, not a general speedup guarantee. They predate the
subsequent removal of the unused conversion API and bucket marker; no new timing
claim is made for that removal.

The broader original-fix measurements below predate this refactor.

Measurements used Windows, Node 24.19.0, an Intel i9-11900K, the repository's ES5
compiler settings, and pinned Immer 1.2.1. Each scenario has six calibration/
warmup rounds and ten measured samples. Fixtures, explicit GC and correctness
checks are outside the timed region. Timed loops return a consumed checksum.
Benchmark commands now fail if the measured final state is incorrect.

An initial sweep covered 10, 1,000, 10,000 and 100,000 entries, directly and in
Immer. Its run-to-run variation was substantial, so paired measurements run the
original and fixed implementations back-to-back in the same process. Additional
runs cover batching, auto-freeze and one million entries. The baseline is commit
`0859158`, compiled before any production edits. Raw samples and their
implementation stages are in [performance-results.json](performance-results.json).
These are local observations, not promised speedups or a statistical guarantee.

The paired comparison identified an extra lookup in the first sorted-map
insertion fix. The protected entry lookup removed it. After that refactor, at
10,000 entries with one operation per Immer transaction:

| Operation | Baseline median | Fixed median | Change |
| --- | ---: | ---: | ---: |
| Build a map (10,000 insertions) | 94.98 ms | 98.33 ms | +3.5% |
| Overwrite a map entry | 10.27 us | 9.60 us | -6.5% |
| Remove/reinsert a map entry | 11.13 us | 11.82 us | +6.2% |
| Build a sorted map (10,000 insertions) | 320.67 ms | 214.99 ms | -33.0% |
| Sorted update, unchanged order | 25.32 us | 26.15 us | +3.3% |
| Sorted update, moving to the end | 71.23 us | 61.42 us | -13.8% |
| LRU hit with recency refresh | 68.80 us | 75.48 us | +9.7% |

Some samples have wide tails: for example the sorted-build fixed p90 was
340.95 ms, versus a 214.99 ms median. Use the raw samples, not just percentage
changes, when assessing these results. The table above preceded the final
public get/has predicate inlining; the mutation paths it measures did not change.

The final direct map-read check measured:

| Entries | Baseline median | Fixed median |
| ---: | ---: | ---: |
| 1,000 | 24 ns | 29 ns |
| 10,000 | 42 ns | 44 ns |
| 1,000,000 | 419 ns | 406 ns |

The small-map read overhead is approximately 5 ns (about 20%). The collision
microbenchmark, deliberately using eight integer keys sharing their low 28 hash
bits, showed roughly 33–36% more direct read time and 11–25% more time inside
Immer before the final leaf-read inlining. Those buckets now perform ownership
checks and escaped storage; their extra cost is explicit rather than
treated as noise. Ordinary hash-prefix sharing does not necessarily use a
terminal collision bucket. No full-state copies were added to ordinary reads.

The original LRU eviction benchmark produced incorrect survivors and became
impractically slow at large capacities, so it is excluded from equivalent-work
comparisons. A separate benchmark checks exact survivors and compares snapshot
eviction against a correct reference that reacquires the oldest key each time.
Final median batch-eviction latencies inside Immer:

| Capacity | Victims | Snapshot | Reacquire oldest |
| ---: | ---: | ---: | ---: |
| 10 | 2 | 0.151 ms | 0.125 ms |
| 1,000 | 101 | 4.015 ms | 4.123 ms |
| 10,000 | 1,001 | 41.442 ms | 42.181 ms |
| 100,000 | 10,001 | 463.569 ms | 478.800 ms |

The buffer costs O(victims) keys. At capacity 100,000 the median measured heap
increase was about 52 MB for snapshot eviction versus 62 MB for reacquiring
keys. This is a before/after heap observation affected by GC, not an allocation
count or peak-memory bound. Large batches still produce substantial latency;
the existing batching policy was preserved rather than replaced in this fix.

## Reproduction

```sh
node node_modules/typescript/bin/tsc --noEmit
node node_modules/jest/bin/jest.js src --runInBand --watch=false
node node_modules/jest/bin/jest.js fuzz --runInBand --watch=false
npm run benchmark:review
npm run benchmark:eviction
```

For a repeatable fuzz run in PowerShell:

```powershell
$env:FUZZ_SEED = '24301'
node node_modules/jest/bin/jest.js fuzz --runInBand --watch=false
```

For the separately installed current Immer:

```powershell
npm install --prefix dist/immer-current --package-lock=false --ignore-scripts immer@11.2.9
$env:IMMER_MODULE = (Resolve-Path dist/immer-current/node_modules/immer).Path
node node_modules/jest/bin/jest.js src --runInBand --watch=false
```

For a paired benchmark, compile a clean baseline checkout with the same
dependencies into a separate directory first. The working session retained
that build at `dist/review-baseline/src`:

```powershell
node node_modules/typescript/bin/tsc
$env:BENCH_COMPARE = 'dist/src'
$env:BENCH_SIZES = '1000,10000'
$env:BENCH_MODES = 'direct,immer'
$env:BENCH_FILTER = '^(?!lru/evict)'
node --expose-gc dist/benchmark/review.js dist/review-baseline/src dist/paired.json
```

`BENCH_SAMPLES` changes sample count; `BENCH_FREEZE=true` enables auto-freeze.
`batch` measures a single transaction containing the measured operations.
Build timings are per complete construction; iteration timings are per complete
traversal; other timings are per operation (churn is one remove/reinsert pair).
The collision fixture is capped at eight keys regardless of the size label.
The corrected original benchmark also uses repeatable inputs and executes all
requested iteration passes, including the previously unexecuted array case.
