# Performance-conscious bug-fix plan

Implement the 18 findings in [bug-review.md](bug-review.md) in dependency order,
keeping public adapter signatures and existing serialized state compatible.
Preserve structural sharing and the existing trie/B-tree design. Refactor the
lookup and mutation paths where that eliminates repeated work or makes the
correctness rules explicit.

This document records the implementation plan. The fixes and expanded checks
are now implemented; see [fix-validation.md](fix-validation.md) for results and
the additional Immer compatibility cases encountered during implementation.

**Compatibility policy update:** legacy storage is no longer supported. This
supersedes the automatic legacy fallback proposed below. Maps, sorted maps, and
LRU caches saved with unescaped buckets must be rebuilt from application data.
The implementation only handles escaped buckets, without storage conversion,
prototype recovery, or recursive value copying. Current storage supports JSON
round trips directly.

## 1. Establish a useful performance baseline

Extend the benchmark harness before modifying production code. The current
harness mainly measures insertion at 4,000 operations, uses unseeded random
inputs, and reports one timing. Its plain Immer array-iteration case returns a
function without executing it; correct that case before using its results. The
other iteration cases ignore the iteration count and time a single pass, so
their warm-up is also a single pass.

Use identical seeded operation traces, compiler settings, runtime versions and
machine for baseline and candidate builds. Save raw results and revision IDs.
Prepare fixtures outside timed regions for steady-state operations; measure
construction separately. Use an observable checksum and verify the resulting
state outside the timed region so timings cannot reward omitted work.

Measure these workload families:

| Workload | Relevant measurements |
| --- | --- |
| Map | `get`/`has` hits and misses; insert versus overwrite; successful and absent-key remove/update; hash-prefix and full-hash collisions |
| Sorted collection/map | Ordered/random insertion; removal; updates with unchanged order, local movement and movement across the tree; duplicate ordering keys |
| Iteration | Forward/backward traversal; entries/keys/values; readonly facades; partial iterator consumption |
| LRU | Hits, misses, updates, steady-state insertion, and individual batch-eviction latency |
| Restored state | Read/mutation after JSON round trip; first write into a restored collision bucket versus subsequent writes |

Use 10, 1,000, 10,000 and 100,000 entries for the main size sweep. Add targeted
cases around trie boundaries 16/256/4,096 and the B-tree split boundary of 64.
Use a million-entry run for selected map and iteration scaling checks if memory
allows; do not multiply every scenario into an unnecessarily large matrix.
Include sequential integer keys and representative strings as well as random
keys. Include deletion/reinsertion churn, because trie shape depends on history.

Measure direct mutation and Immer transactions. The primary Immer performance
configuration matches the existing benchmark: proxies on, auto-freeze off.
Include representative auto-freeze-on workloads and validate correctness with
Immer's ES5 fallback. Measure both one operation per transaction and batches in
one transaction. Keep the installed Immer version fixed for performance
comparisons. Correctness is a separate matter: see the Immer compatibility
requirement in section 7.

Warm up, collect at least ten sufficiently long samples, and report median and
dispersion. Measure latency spikes for eviction and observe allocation/GC costs
on representative large runs. Run isolated timing and memory experiments when
instrumentation would distort throughput. Avoid competing heavy processes and
do not force GC inside each measured operation.

Use a repeatable slowdown greater than roughly 5% on common workloads as an
investigation trigger, not a claim of statistical significance or an automatic
failure. Aim to keep common-path changes within baseline noise; optimize or
explain consistent regressions above 10%. Correctness remains mandatory: compare
previously broken operations against a correct reference implementation, and
report their cost separately from behavior-preserving benchmarks. Do not retain
a bug to meet a timing target.

## 2. Fix map identity, membership, and restored-state handling

**Covers findings 1, 2, 6, 7, 16 and 18.**

Make key identity and entry presence explicit throughout `get`, `has`, `set`,
`remove` and `update`. Keep the first comparison as strict equality, with a NaN
fallback; preserve the existing equivalence of positive and negative zero.
`remove` and `update` must verify the leaf key or bucket membership before
changing state or invoking user code.

Perform these checks on the node already found by lookup. Do not implement the
fix by calling `has` and then traversing the trie again. If consolidating lookup
results helps, reuse the existing result object rather than allocating another
entry wrapper. Do not keep lookup paths or draft nodes in adapter-level caches;
adapters serve multiple persistent states and user updaters can be reentrant.

Treat both holes/`undefined` and deserialized `null` slots as empty trie slots.
Keep sparse arrays and support restored data directly, without an O(n) repair
pass on every read or a required new public rehydration API.

Use own-property checks for collision-bucket membership and retrieval, including
after JSON parsing. Handle writes to `__proto__` as data as well as reads: merely
replacing `in` with an own-property check does not fix the inherited setter on a
restored ordinary object.

Do not rely on a null-prototype bucket to make `__proto__` safe. Finding 18 shows
that Immer 1.2.1 breaks an own `__proto__` property whenever it copies the
bucket, even a freshly created null-prototype one, and Immer copies on every
write. Never use `__proto__` as an own property name in bucket storage instead.
The least disruptive option is to escape that single key under a reserved
property name, falling back to the unescaped name when reading state written by
older versions; this keeps existing serialized state compatible. Storing buckets
as arrays of entries also works but changes the persisted format. Do not mutate
prototypes or define properties on an Immer draft. Confirm the chosen strategy
works with both Immer modes and does not copy normal buckets more often.

Add cases for absent-key callback suppression, NaN lifecycle operations,
restoration after deletion, inherited names, and insertion/replacement of
`__proto__` after restoration. The regression test for finding 18 already
covers a write to a bucket holding `__proto__` in both Immer modes. Assert unchanged
state identity for absent-key mutations inside Immer and preservation of
previous versions.

JSON compatibility applies to JSON-safe keys/values. Supporting undefined and
NaN in memory does not imply that ordinary JSON preserves those values.

## 3. Separate missing nodes from stored values in the B-tree

**Covers findings 10 and 11.**

Change private predecessor/successor and traversal helpers to return existing
value nodes, or `undefined` for absence. Check node presence, then pass
`node.value` to the comparator or iterator result. This handles `0`, `false`,
`null`, empty strings and undefined elements without treating data as a sentinel.

Reuse existing nodes instead of introducing per-comparison option objects or
new wrapper allocations for each yielded element. Keep the public iterator
result and first/last APIs unchanged. Preserve current split/merge algorithms,
but correct `splice(valueContainer.index)` in `removeByPath` to
`splice(valueContainer.index, 1)` (see "Other observations" in the review). The
path appears unreachable today, but the call is wrong if it is ever taken.

Run the array-model tests and add focused boundary cases across internal nodes,
both traversal directions, exhaustion, and undefined-valued neighbors. Benchmark
iteration and unchanged-order updates to check the added indirection.

## 4. Refactor sorted-map assignment and callback updates

**Covers findings 4, 5, 8, 9, 13 and 17.**

Separate unconditional `set` replacement from the callback convention where
returning undefined means "mutated in place/no replacement." A private helper
can share index maintenance, but it must receive an explicit replacement mode;
undefined cannot also serve as its control sentinel. This also eliminates the
closure currently created by `set` to call `update`.

Resolve the existing value and membership once, then locate the old sorted-index
node before invoking the updater. Update the value and index through that known
path. Preserve return values, size, and the existing behavior of shared backing
maps. Missing entries must not invoke callbacks.

For the first implementation, `get` followed by `has` only when the returned
value is undefined preserves one lookup for ordinary existing values. Removing
the initial unconditional `has` from the existing-key `set` path can also reduce
work. If undefined-heavy workloads justify further optimization, share a
non-public entry lookup with MapAdapter; do not expose mutable entry handles as
new public API.

Keep the fast path for unchanged primitive ordering keys. If the key changes,
update the index node and check its neighbors. If the ordering key is mutable
(object/function), check ordering even when the reference is unchanged. Do not
deep-clone ordering keys or remove/reinsert on every update. Avoid writing an
unchanged ordering-key field just to trigger validation, because that can cause
unnecessary Immer copying.

Apply the same key-equality rule used by MapAdapter to the sorted index, including
NaN (finding 17); otherwise a successful map-level fix would still leave
sorted-map and LRU removals and updates unable to locate NaN entries. The
finding 17 regression test covers setting a NaN key twice and then removing it.

Test each mutation as an invariant across both structures: membership, value,
size, ordered traversal, and subsequent removal. Include every falsy replacement,
stored undefined, mutable ordering objects, and direct/Immer operation modes.
Benchmark primitive unchanged-order updates separately from object-key updates.

## 5. Repair LRU eviction while retaining batched mutation

**Covers findings 3 and 12.**

Preserve the current 10% overflow policy, but compute the threshold as an integer
once (for example `Math.floor(suggestedSize * 1.1)`) rather than comparing against
a floating-point product on every `set`. Decide and document what capacity `0`
means; today it evicts every item immediately. At eviction time, compute the number of
victims, collect only those oldest keys using the underlying sorted map's key
iterator, stop iterating, and then remove the collected keys. Do not materialize
the whole cache or use its entry iterator to fetch values that eviction does not
need. Keep all removals in the caller's transaction.

This uses O(k) temporary keys for k evictions and retains O(k log n) removal
work. It avoids invalidated iterators and repeated iterator construction. Also
replace the LRU updater's truthiness check with an undefined check.

Compare the snapshot approach with reacquiring the oldest key for each deletion
as a simple correct reference. If profiling shows key-buffer allocation or
repeated searches dominate large-cache eviction, evaluate an internal B-tree
`removeFirst` operation that removes through the already-found leftmost path.
Treat that as a measured follow-up optimization, with full deletion/rebalancing
tests, rather than expanding the first fix into a new bulk-delete algorithm.

Add a seeded LRU reference model covering reads that refresh recency, `peek`
that does not, updates, misses, explicit removals, and several eviction cycles.
Compare the exact surviving keys and order, not only cache size. Validate small
capacities including zero, and capacities above tree-split boundaries.

## 6. Correct iterator identity and readonly view sizes

**Covers findings 14 and 15.**

Make each iterable iterator's `[Symbol.iterator]()` return itself, with exactly
one underlying cursor. Keep collection/view iteration reusable by producing a
fresh iterator per call. Note in the changelog that looping twice over one
`entries()`/`keys()`/`values()` result no longer restarts it. Preserve existing disposal behavior during the refactor
and avoid introducing extra wrapper layers or per-element closure allocation.

Replace captured sizes with getters reading the associated backing collection.
Each view remains tied to the state it was created from; an old Immer state's
view must not begin following newly produced states.

Cover entries, keys, values and direct iteration for all map/set facades, partial
consumption, exhaustion, mutation of a backing object, and old immutable states.
Share facade construction code only if it improves maintainability without
measured dispatch/allocation regressions. The correctness fix does not require
a generic abstraction over every adapter.

## 7. Integration and completion criteria

Land the work in reviewable stages: benchmark baseline, map fixes, B-tree value
handling, sorted-map mutation refactor, LRU fixes, then readonly facades. Run
focused correctness and performance checks after each affected stage; run the
full matrix once the integrated implementation is ready.

Completion requires:

- All 53 existing regression cases pass with their expected behavior intact.
- Original unit tests, B-tree model tests, additional lifecycle/reference-model
  tests, and type checking pass.
- Fuzz tests support a supplied seed; record seeds and run a small fixed set for
  repeatability plus a randomized run. Persist a minimized regression for any
  additional failure.
- JSON-safe state survives restoration, subsequent mutations, and another round
  trip, including collision buckets and prototype-sensitive keys.
- Immer tests confirm old versions remain unchanged, absent-key no-ops retain
  identity, and representative untouched branches remain shared. Tests cover
  the installed version's proxy and ES5 modes.
- The correctness suites also pass against the current Immer release. Immer is
  only a dev dependency, so users supply their own version; newer releases copy
  objects differently (finding 18 is likely specific to 1.2.1) and freeze
  results by default.
- A before/after performance report shows operation costs, size scaling, eviction
  spikes and relevant memory tradeoffs, with any material regressions explained.
- Public signatures and persisted state remain compatible. Update documentation
  for value/iterator semantics and the resolved review findings.

Keep iterative trie insertion, cached hashes, fanout changes, and large-scale
B-tree deletion refactors out of the initial fix unless profiling identifies
them as necessary. Each can change memory layout or copying costs enough to
obscure the effect of the correctness repairs.
