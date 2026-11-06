# Bug review — November 5, 2026

**Implementation status:** The 18 findings below have been fixed. The 53 original
reproductions now assert the corrected behavior. This report preserves the
pre-fix observations; see [fix-validation.md](fix-validation.md) for current
validation and performance results.

The initial review found 16 correctness defects, reproduced by 50 failing cases.
The reproductions now live in the standard [map](../src/map.test.ts),
[sorted collection](../src/sortedcollection.test.ts),
[sorted map](../src/sortedmap.test.ts), and [LRU cache](../src/lrucache.test.ts)
test files. These are ordinary
expected-behavior tests, not `test.failing` tests or assertions that enshrine the
incorrect behavior. These tests failed against the original production code.

A second verification pass on the same day confirmed all 16 findings and added
findings 17 and 18, reproduced by 3 more failing cases. The
pre-fix suite therefore had 53 failing cases.

P1 findings cause lost writes, unintended deletion, corrupted indexes, or failure
to use restored state. P2 findings affect narrower inputs or API consistency.
The examples below use public adapter operations and real hashes; no hash
functions or collection internals are mocked.

## Findings

### 1. P1: Removing an absent map key can delete another entry

**Location:** [map.ts](../src/map.ts), lines 136–145.

Set numeric key `1`, then remove absent key `17`. Both hashes share the same low
four bits (the trie consumes the lowest bits first), so lookup reaches the leaf
holding `1`. `remove` deletes that leaf
without checking its key. The map becomes empty and its size drops to zero,
despite the documented promise that removing a missing key is a no-op.

**Proof:** `does not delete an existing entry ...` runs both directly and inside
Immer. Expected `[[1, 'one']]`; actual `[]`.

**Fix direction:** Verify the leaf key before deleting it.

### 2. P1: Updating an absent map key modifies another entry or inserts an uncounted entry

**Location:** [map.ts](../src/map.ts), lines 165–185.

The single-value branch calls the updater without comparing the stored key with
the requested key. With key `1` present, updating absent key `17` changes key `1`.
The collision-bucket branch also calls the updater without checking membership.
Insert keys `1` and `268435457`, then update absent key `536870913` with a callback
returning `'ghost'`: a third entry appears while `size` remains `2`.

**Proof:** `does not call the updater ...` and `does not create an uncounted entry
...`, each with and without Immer. The former returns `'changed'` for a missing
key; the latter reports that the missing key is now present.

**Fix direction:** Check membership before invoking user code in both branches.

### 3. P1: Batched LRU eviction removes newer entries while retaining older ones

**Location:** [lrucache.ts](../src/lrucache.ts), lines 37–44.

Eviction keeps an iterator open while deleting from the same B-tree. Removing an
item shifts the backing array, but the iterator retains its advanced index and
skips the next oldest item. With capacity `10`, inserting keys `0` through `11`
should leave `2` through `11`; it instead leaves `[1, 3, 4, ..., 11]`.

**Proof:** `evicts the oldest consecutive entries ...` fails at capacities `10`
and `64`, both directly and inside Immer. Capacity `64` also crosses a tree split.

**Fix direction:** Reacquire the oldest item for each removal, or collect the
keys to evict before mutating the tree.

### 4. P1: Sorted maps silently ignore writes to entries holding falsy values

**Location:** [sortedmap.ts](../src/sortedmap.ts), lines 80 and 92–94.

`update` uses `if (!existing) return` to test membership. Existing values `0`,
`false`, `''`, `null`, and `undefined` therefore prevent the updater from running.
`set` delegates replacement of existing keys to `update`, so even an unconditional
`set(key, 'replacement')` cannot overwrite these entries.

**Proof:** `updates an existing falsy value ...` and `overwrites an existing falsy
value with set ...` cover all five values (10 failing cases).

**Fix direction:** Determine membership with `has`, independently of the value.

### 5. P1: A falsy replacement desynchronizes a sorted map's value and index

**Location:** [sortedmap.ts](../src/sortedmap.ts), lines 107–119.

The new value is stored correctly, but `updated || existing` selects the old
value when the replacement is falsy. The ordering key and return value are then
computed from the old value. With `getOrderingKey: value => value`, insert
`a -> 1`, `b -> 2`, then update `b` to `0`: iteration returns `a -> 1, b -> 0`
instead of `b -> 0, a -> 1`. Subsequent removals can miss the stale index entry,
leaving incorrect sizes and entries whose values are missing.

**Proof:** `updates the sorted index when a replacement value is zero` fails
on the ordering assertion and includes follow-up return-value/removal assertions.

**Fix direction:** Distinguish `undefined` from other replacement values rather
than testing truthiness.

### 6. P1: JSON round-tripping makes sparse map branches unusable

**Location:** [map.ts](../src/map.ts), lines 245–257 and 368–378.

The README promises serializable data structures, but trie nodes are sparse
arrays. JSON turns holes into `null`; traversal and lookup only treat `undefined`
as an empty slot. Set `1 -> 'one'`, serialize and parse the map, then iterate:
iteration throws `TypeError: Cannot use 'in' operator to search for 'value' in
null`. Calling `has`, `get` or `set` with absent key `0` also throws
(`TypeError: Cannot read properties of null (reading 'key')`), so nothing can be
inserted into that slot. The backing maps of sorted maps and LRU caches are
affected too.

**Proof:** `can iterate a JSON round-tripped map ...` and `can query and insert
into an empty hash slot ...` fail using only JSON-safe keys and values.

**Fix direction:** Handle deserialized empty slots, or provide an explicit
rehydration step that restores the required representation.

### 7. P2: Restored collision buckets treat inherited properties as stored keys

**Location:** [map.ts](../src/map.ts), lines 77, 90, 125, 143 and 179.

Collision buckets start as null-prototype objects, but JSON parsing recreates
them with `Object.prototype`. Membership checks use `in`, and retrieval uses
unguarded property access. When a bucket shares the hash prefix of `constructor`,
`toString`, or `__proto__`, `has` returns true for these absent keys. Removing one
also decrements size even though there was no own entry to delete. This is
independent of sparse-array holes: lookup follows an entirely populated path.

**Proof:** `does not invent the key ... in a JSON-restored collision bucket`
reproduces all three names using naturally colliding numeric keys. A direct
follow-up reproduction also confirmed size drops from `2` to `1` on removal.

**Fix direction:** Use own-property membership checks and preserve or restore
safe collision storage after deserialization.

### 8. P2: Sorted-map `set` cannot replace an existing value with `undefined`

**Location:** [sortedmap.ts](../src/sortedmap.ts), lines 80 and 107–109.

Replacement through `set` is routed through an update callback. In that callback
protocol, returning `undefined` means no replacement, so `set(key, undefined)`
leaves the old value in place. The generic value type permits `undefined`, and
initial insertion of that same value works.

**Proof:** `allows set to replace an existing value with undefined`: after
setting `key -> 1` and then `key -> undefined`, `get` still returns `1`.

**Fix direction:** Keep unconditional assignment semantics separate from the
updater's no-return convention.

### 9. P2: Sorted-map entries containing `undefined` cannot be removed

**Location:** [sortedmap.ts](../src/sortedmap.ts), lines 84–86.

`remove` treats `get(...) === undefined` as proof that the key is absent. A key
explicitly inserted with an undefined value therefore survives every removal
attempt, retaining its sorted-index entry and size.

**Proof:** `removes an entry whose stored value is undefined` uses a valid constant
ordering function. `has` remains true after removal.

**Fix direction:** Test membership independently of the stored value.

### 10. P2: Sorted collections do not reorder across falsy neighbors

**Location:** [sortedcollection.ts](../src/sortedcollection.ts), lines 119–125.

`ensureSortedOrderOfNode` only compares against truthy neighboring values. In
`[0, 1]`, updating `1` to `-1` leaves `[0, -1]`. In `[-1, 0]`, updating `-1` to `1`
leaves `[1, 0]`. First/last results and subsequent ordered searches are then wrong.

This only affects a `SortedCollectionAdapter` used directly with falsy elements.
Sorted maps and LRU caches store `{key, order}` objects, which are always truthy.

**Proof:** `reorders across a zero-valued neighbor ...` exercises both sides.

**Fix direction:** Track neighbor existence separately from its value.

### 11. P2: An undefined collection element prematurely ends iteration

**Location:** [sortedcollection.ts](../src/sortedcollection.ts), lines 207–220
and 277–290.

Both iterators use the yielded value itself as the end-of-iteration sentinel.
`undefined` is allowed by the generic element type and can be ordered by a custom
comparator. A collection containing `[-1, undefined, 1]` produces only `[-1]`
for forward iteration and only `[1]` for reverse iteration. A manual `next()`
after the premature `done: true` can even yield another item.

As with finding 10, only direct use of `SortedCollectionAdapter` is affected;
sorted-map and LRU index elements are never `undefined`.

**Proof:** `does not terminate ... iteration at an undefined element` covers both
directions; the collection size is `3`.

**Fix direction:** Return a value node or explicit traversal-result state so
exhaustion cannot be confused with a stored value.

### 12. P2: LRU updates discard falsy replacement values

**Location:** [lrucache.ts](../src/lrucache.ts), lines 94–104.

`if (updated)` prevents assigning a callback result of `0`, `false`, `''`, or
`null`. The old value remains even though recency is updated.

**Proof:** `accepts a falsy replacement returned by update ...` covers all four
values. Each case still returns/stores `'original'`.

**Fix direction:** Test `updated !== undefined`.

### 13. P2: Mutating an object-valued ordering key can leave a sorted map unsorted

**Location:** [sortedmap.ts](../src/sortedmap.ts), lines 111–116.

With `getOrderingKey: value => value.order` and a comparator reading `order.rank`,
the index stores the same ordering object as the value. Mutating `rank` inside
`update` changes the indexed object too. The reference-equality guard then skips
reordering. Updating the first rank from `1` to `3` in a two-entry map leaves ranks
`[3, 2]`. This reproduction uses direct adapter mutation; the corresponding
experiment inside Immer did reorder successfully.

**Proof:** `reorders when an object-valued ordering key is mutated inside update`.

**Fix direction:** Check whether the updated node is still ordered even when the
ordering-key reference is unchanged.

### 14. P2: Readonly map/set iterators restart when consumed as iterables

**Location:** [util.ts](../src/util.ts), lines 15–18; used by all three adapters'
readonly facades.

An iterator's `[Symbol.iterator]()` creates a new iterator over the original
collection instead of returning itself. Consume one item with `next()`, then use
`Array.from(iterator)` or a `for...of` loop: the already-consumed item is yielded
again. Even exhausted iterators can restart.

**Proof:** `resumes a partially consumed ... iterator instead of restarting it`
covers Map, SortedMap and LRU facades, both map and key-set views (six cases).
Expected remaining values `[2]`; actual `[1, 2]`.

**Fix direction:** Make the iterator iterable by returning itself from
`[Symbol.iterator]()`; retain reusable iteration at the collection/view level.

**Compatibility note:** Callers that loop over the same `entries()`, `keys()` or
`values()` result twice currently get two full passes. After the fix the second
loop yields nothing, as with a native `Map`. Mention this in the changelog.

### 15. P2: Readonly views retain stale sizes while exposing live entries

**Location:** [map.ts](../src/map.ts), lines 317 and 338;
[sortedmap.ts](../src/sortedmap.ts), lines 158 and 179;
[lrucache.ts](../src/lrucache.ts), lines 132 and 153.

Every readonly map/set facade captures `size` once, while `has`, `get` and
iteration read the current backing structure. Create a view over an empty map,
then add an item using the adapter: the view contains and yields the item but
still reports size zero. This applies when mutating the same backing object;
an old immutable Immer state should, correctly, retain its original size.

**Proof:** `reports the current size of the ... view after mutation` covers all
six facades.

**Fix direction:** Expose size as a getter over the backing collection.

### 16. P2: A newly inserted NaN numeric key cannot be retrieved

**Location:** [map.ts](../src/map.ts), lines 75, 88 and 118.

Numeric keys are accepted and `hash(NaN)` is explicitly supported, but single
leaves compare keys with `===`. Immediately after `set(NaN, value)`, `has(NaN)`
is false and `get(NaN)` is undefined, even though iteration yields the entry.
Later promotion to a collision bucket can change the behavior because bucket
keys are converted to strings.

**Proof:** `can retrieve a NaN numeric key immediately after inserting it`.

**Fix direction:** Use consistent numeric-key equality, including NaN, across
single leaves and collision storage.

Finding 17 describes the more serious effect of this defect on sorted maps and
LRU caches.

### 17. P2: A NaN key duplicates and strands sorted-map index entries

**Location:** [sortedmap.ts](../src/sortedmap.ts), lines 35 and 74; depends on
finding 16 in [map.ts](../src/map.ts), lines 75 and 88.

`SortedMapAdapter.set` uses `has` to decide whether a key is new. Because the
backing map's `has(NaN)` is false after the first insertion (finding 16), a
second `set(NaN, ...)` inserts another sorted-index entry. The sorted index also
compares keys with `===`, so `remove(NaN)` cannot find either entry. With
`getOrderingKey: value => value`:

- `set(NaN, 1)` then `set(NaN, 2)`: size is `2` and iteration yields two `NaN`
  entries.
- `remove(NaN)` then removes the map entry but neither index entry: size stays
  `2`, and iteration yields two `NaN` keys whose values are `undefined`.

LRU caches are built on sorted maps and are affected in the same way.

**Proof:** `keeps one index entry for a NaN key and can remove it`: size is `2`
after the second `set` instead of `1`.

**Fix direction:** Fix finding 16, and use the same NaN-aware key equality in the
sorted index's `equalityComparer`.

### 18. P2: Immer 1.2.1 corrupts a `__proto__` key stored in a collision bucket

**Location:** [map.ts](../src/map.ts), lines 110 and 129 (bucket entries are
stored under the raw key as a property name); Immer 1.2.1 `shallowCopy` in
`node_modules/immer/dist/immer.js`, lines 61–65.

Immer 1.2.1 decides whether a copy should keep a null prototype by reading
`value.__proto__`. A collision bucket that stores the key `__proto__` as an own
property returns the stored entry from that read. Immer therefore copies the
bucket into an ordinary object with `Object.assign`, and the assignment to
`__proto__` sets the copy's prototype instead of creating a property. No JSON
round trip is involved; finding 7 is a separate issue.

Reproduction: store key `__proto__` and numeric key
`hash('__proto__') & 0x0fffffff` so they share a bucket, then set a third
colliding key inside `produce`.

- ES5 mode (`setUseProxies(false)`): `has('__proto__')` is false, `get` returns
  `undefined`, size reports `3`, and iteration yields only `2` entries.
- Proxy mode: the bucket gains stray own `key` and `value` properties. `has` and
  `get` still succeed through the prototype chain, but iteration throws
  `TypeError: Cannot use 'in' operator to search for 'value' in __proto__`.

Single-value leaves are not affected. The defect needs `__proto__` to share its
low 28 hash bits with another key, which user-controlled keys can arrange. It
was not tested against newer Immer releases, whose copy logic differs.

**Proof:** `keeps a __proto__ key when Immer copies its collision bucket`, run in
both Immer modes. ES5 mode fails on `has`; proxy mode fails with the iteration
`TypeError`.

**Fix direction:** Never store `__proto__` as an own property name in bucket
storage. Escape that key (with a fallback when reading existing state), or store
buckets as arrays of entries. Replacing the bucket with a fresh null-prototype
object is not enough, because Immer makes its own copy on every write.

## Other observations

These are not counted as findings.

- [sortedcollection.ts](../src/sortedcollection.ts), line 398:
  `valueContainer.node.items.splice(valueContainer.index)` has no delete count.
  On the fallback path that takes the leftmost item of the right subtree (index
  `0`), it would remove the whole leaf rather than one item. Rebalancing appears
  never to leave an empty non-root leaf, so the path seems unreachable today;
  `splice(valueContainer.index, 1)` is still the correct call.
- An LRU cache with capacity `0` evicts every item immediately after `set`, so
  `get` never returns anything. The intended capacity-0 behavior should be
  stated and tested.
- The eviction threshold `suggestedSize * 1.1` is a floating-point product
  (`11.000000000000002` for capacity `10`). The behavior is correct today, but
  an integer threshold would make tests and benchmarks independent of rounding.

## Validation and coverage

- Baseline: **137 existing unit tests passed** before adding tests.
- Final source suite: **143 passed, 50 failed** across six suites. All 50
  failures are the new regression cases; the 137 original tests still pass.
- New deterministic array-model tests: **6 passed**, spanning fanouts 4, 16 and
  64, direct mutation and Immer, 2,000 mixed operations per case, repeated ordering
  keys, replacement ordering, full deletion in shuffled order, and reuse after
  emptying. Membership, size, forward/reverse order, and extrema are checked
  against separately owned reference data after every operation. See
  [sortedcollection.model.test.ts](../src/sortedcollection.model.test.ts).
- Additional exploratory B-tree checks: 15,000 operations each at fanouts 4, 6,
  16 and 64 passed. These were diagnostic runs, not additional committed tests.
- Existing fuzz suite: **8 passed** (approximately 274 seconds). This is one
  randomized run, not an exhaustive guarantee.
- `tsc --noEmit`: **passed** with all new tests included.
- Second verification pass: source suite re-run with the same result (**143
  passed, 50 failed**, six suites); `tsc --noEmit` passed; fuzz suite re-run with
  **8 passed** (approximately 211 seconds). Every location reference above was
  checked against the source. Findings 3, 6, 7, 13, 15 and 16 were also
  reproduced with standalone scripts outside Jest.
- After adding the tests for findings 17 and 18: **143 passed, 53 failed**
  across six suites; `tsc --noEmit` passed.

The review covered all production source files, the existing unit and fuzz tests,
the advertised README behavior, and the package/compiler configuration. No
additional B-tree split/merge defect was reproduced by the model runs. The
existing fuzz cases mostly use truthy objects and remove keys they previously
inserted, which explains why they miss several of the failures above.

Run the adapter suites containing the reproductions:

```sh
node node_modules/jest/bin/jest.js src/map.test.ts src/sortedcollection.test.ts src/sortedmap.test.ts src/lrucache.test.ts --runInBand --watch=false
```

Run all source tests, the existing fuzz suite, and type checking:

```sh
node node_modules/jest/bin/jest.js src --runInBand --watch=false
node node_modules/jest/bin/jest.js fuzz --runInBand --watch=false
node node_modules/typescript/bin/tsc --noEmit
```

At review time the source-suite command exited with status 1 because the
regression tests asserted the corrected behavior. The implementation now fixes
those cases; the validation results above describe the original review runs.
