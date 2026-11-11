# Changelog

## Unreleased

These changes break stored state and some behaviour, so the next release is a
major version (4.0.0).

- **Storage-format change:** maps, sorted maps, sorted collections and LRU
  caches use new internal layouts. State saved by an earlier version is not
  converted and must be rebuilt from application data. Given state saved by
  version 3, every operation that reads or changes entries throws an error
  ("stored by immerutable 3 or earlier") instead of misreading it. `getSize`,
  iterating only the keys of a sorted map or LRU cache, and iterating or
  taking the first or last entry of an empty one do not check.
  - Map trie nodes and sorted-collection B-tree nodes are objects with named
    slots (`#0`, `#1`, ...) instead of arrays. Immer freezes what it produces,
    and V8 copies and iterates a frozen array several times more slowly than an
    object of the same size.
  - An LRU cache stores its values directly in its map and keeps recency in two
    indexes that are never read or changed through Immer drafts (`tree`, by
    order of last use, and `uses`, by key). `get` no longer rewrites the entry it reads. `ILruCache` no longer
    extends `ISortedMap`.
  - Serialized size changes with the keys. With sequential integer keys, maps
    and sorted maps are 10-25% larger; with random integer or string keys they
    are 9-18% smaller. LRU caches are 5-18% smaller. Sorted collections are
    about 13% larger for object items and 50% larger for number items.
  - `root` is now quoted in the source, like `tree`, so minifiers keep its name.
- Operations inside producers are about twice as fast. With 100,000 entries,
  one operation per producer, on Node 24: map `get` 8.9 to 3.0 µs and overwrite
  16.2 to 8.2 µs; sorted map reorder 26.6 to 14.8 µs; sorted collection insert
  41.9 to 18.1 µs, remove 36.6 to 13.1 µs and move 74.6 to 35.0 µs; LRU `get`
  22.1 to 10.0 µs and evicting `set` 26.3 to 17.4 µs. State restored from JSON
  gains as much. With several operations per producer, and on Node 20 and 22
  with other state exercising Immer in the same process, the gains are 25-55%.
- `has` on a map, sorted map or LRU cache, and the first search of a sorted
  collection in a producer, read the state the draft was created from until
  something reaches the structure through the draft. Outside nested producers
  that creates no drafts (`has` 8.3 to 1.9 µs). Changes made without an
  adapter, such as patches applied to the draft, are seen.
- **Slower:** key lookups on plain (non-draft) state take about 20 ns longer
  while the collection fits in the CPU cache (with 4,000 entries, map `get`
  32 to 49 ns), and iterating a sorted map, sorted collection or LRU cache is
  about 10% slower there. With 100,000 entries both are as fast as before or
  faster.
- **Behaviour change:** a sorted collection's default equality comparer treats
  an item and an Immer draft of it as the same item. In a producer, `update`,
  `remove` and `lookupValuePath` therefore find an item given the object stored
  in the state; previously that call did nothing, because stored items were
  compared as drafts. The value passed must still have the item's current
  order: once a producer has changed an item's order, find it by its draft. A
  custom `equalityComparer` may receive the stored item either as it is in the
  state the producer started with or as a draft.
- **Not supported:** `setUseStrictShallowCopy(true)` together with a nested
  producer whose result is assigned back into the outer draft. Immer's strict
  copy of an object keeps the children that were not drafted as they are in
  the base state, so a later change through the outer draft throws (or, with
  auto-freeze off, changes the earlier state). Version 3 was not affected,
  because its nodes were arrays.
- `MapAdapter.set` (and so the sorted map and LRU cache) throws a `TypeError`
  for an `undefined` key, which the types never allowed.
- A sorted collection keeps `undefined` items as `undefined` through a JSON
  round trip (they became `null`).
- JSON cannot represent a NaN or infinite key, so, as before, an LRU cache
  does not reliably find such an entry again after a round trip, and setting
  the key again after further round trips can throw. Where version 3 threw
  from `get`, `update` or `remove` in that state, they now act on what the
  map finds, if anything. The other keys are unaffected.
- `MapAdapter` no longer has the protected `shift`, `trieNodeSize` and `mask`
  fields: a trie node always has 16 slots. `maxDepth` remains.
- Iterating a map on plain state lists each trie node's entries when it reaches
  the node, so an entry removed during the iteration may still be visited.
  Removing while iterating was already unsupported.
- With Immer patches, using an LRU entry (including by `get`) replaces both of
  its indexes, so it records two patches the size of the cache's key set.
- The sorted index copies node arrays with spread syntax instead of loops.
- `benchmark/review.ts` freezes each fixture before timing it. Before, the
  first producer of every sample deep-froze the whole fixture inside the
  measured region, which dominated the Immer results at large sizes.
- Add tests for the new layouts, reads on drafts, patches applied to a draft,
  every adapter against a model under `createDraft`/`finishDraft` and with
  auto-freeze off, and a fuzz test making several sorted-collection calls per
  producer. The browser and Closure ADVANCED check now covers sorted
  collections.

## 3.1.0

- Fix sorted-map index access under Closure ADVANCED property renaming. Keep
  descriptor reads (and the existing storage layout) while consistently quoting
  `tree`; remove string-based property checks from map traversal and index splits.
- Use static imports of Immer's public `original` and `current` APIs so browser
  bundles do not depend on a runtime `require`. **Dependency change:** Immer >=10
  is now a required peer, including for applications using only plain state.
- Readonly map/set iterators now inherit native iterator helpers without using
  generators. They remain lazy and single-use; early termination and disposal
  close the underlying iterator through `return()`. Disposal previously called
  `Symbol.dispose` on the source iterable. Helpers require runtime support;
  basic iteration still targets ES2018. Declarations require TypeScript 5.6+.
- Clarify the v3 sorted-map tie-break: equal ordering keys sort by map key,
  numbers before strings, with strings compared by code unit (`"10"` before
  `"9"`). Earlier versions did not guarantee insertion order among ties.
  To preserve arrival order, include a sequence number in the ordering key and
  supply a comparer for `[timestampMs, sequence]`. This does not change sorted
  collection ordering or LRU recency ordering.

## 3.0.0

- Correct map removal/update of absent colliding keys, NaN key identity, and
  sparse-array slot removal.
- Preserve map operations after JSON round trips. Escape prototype-sensitive
  collision-bucket names for Immer compatibility. **Storage-format change:**
  maps, sorted maps, and LRU caches saved with unescaped buckets must be rebuilt
  from application data. Legacy storage conversion and repair are not supported.
- Accept falsy values and explicit undefined assignments in sorted maps; keep
  their values and sorted indexes synchronized, including mutable ordering keys
  and NaN map keys.
- Preserve sorted collection ordering around falsy/undefined elements and allow
  undefined elements during forward/backward iteration.
- Evict the actual oldest LRU entries in batches and accept falsy update results.
- Keep readonly view sizes current. Iterators now follow the standard single-use
  protocol: looping twice over the same `entries()`/`keys()`/`values()` result no
  longer restarts it. Request a new iterator or iterate the view again to restart.
- Keep a number key and its decimal-string twin (`1.5` and `'1.5'`) as separate
  entries when they share a collision bucket. Existing bucket storage is read
  unchanged; the twin that arrives second uses a secondary property name.
- Iterate maps without recursing per skipped slot. Iterating a large map after
  removing most of its keys could previously overflow the stack.
- Iterate JSON round-tripped maps containing undefined values.
- Sort undefined and NaN ordering keys last with the sorted map's default
  comparer instead of treating them as equal to every key. A null ordering key
  is now treated as undefined (so it also sorts last by default), and custom
  comparers receive undefined in its place; this keeps undefined ordering keys
  working after a JSON round trip. Sorted map `remove`
  now throws, like `set` and `update`, rather than deleting only the map entry
  when the sorted index cannot find it.
- Sorted collection `update` returns the current item when the updater mutates
  it in place, matching the map adapters.
- Stop sorted collection lookups of absent values from searching subtrees that
  cannot contain them (previously O(2^height) nodes per miss).
- Fix README and doc-comment iteration examples: iterables yield `[key, value]`
  tuples.
- Add deterministic regression/model tests, seeded fuzzing, and repeatable
  throughput/eviction benchmarks. Benchmarks now leave Immer's auto-freeze on
  (its default); without it, every producer walks the whole state.
- **Storage-format change:** sorted collections, sorted maps, and LRU caches
  use new internal layouts, and a sorted map keeps its map and sorted index in
  one object (`{root, size, tree}`). Collections saved with the previous layout
  must be rebuilt from application data. Maps are unchanged. As with any JSON
  array, a JSON round trip turns `undefined` sort keys and `undefined`
  sorted-collection elements into `null`.
- **Modern Immer only:** the library targets Immer 10 and later, and is tested
  against Immer 11. Immer's ES5 mode (`setUseProxies(false)`, Immer 9 and
  earlier) is no longer supported; the sorted map's index (below) relies on
  Proxy-based drafts. Adapters still work on plain state outside a producer,
  but that path is no longer tuned for speed.
- **ES2018 build:** the published JavaScript now targets ES2018 (it targeted
  ES5), so it requires an ES2018 runtime.
- Sorted map entries with equal ordering keys are now ordered by map key
  (numbers before strings) rather than in an unspecified order. An object used
  as an ordering key may be kept by reference: Immer drafts are stored as their
  current state, frozen objects (such as Immer state) as is, and other arrays,
  plain objects and Dates are copied (with their enumerable string and symbol
  properties). It may be mutated in place only inside an `update` callback for
  its own entry, if no other entry's ordering key refers to it, or once its
  entry has been removed or replaced.
- Performance: the sorted map's index is a persistent B+ tree of (order, key)
  entries that Immer never drafts. The adapter reads its root through a
  property descriptor (which does not create a draft), copies only the changed
  path, freezes the new nodes (which Immer then skips), and assigns the new
  root, so maintaining the index costs Immer one read and one write. Sorted map
  mutations are ~3-7x faster under Immer 10 and 11; `getFirst`/`getLast` and
  iteration inside a producer are ~1.3-2x faster.
- Immer patches: a sorted map or LRU change records its index as one
  `replace` patch of the whole structure. Recording is cheap (the value shares
  structure), but the patch's size and the time `applyPatches` takes to copy
  it grow with the collection (about 100 KB serialized at 10,000 entries, and
  about 25 ms to apply at 100,000 entries).
- Performance: LRU caches are sorted maps of recency, so they share the sorted
  map's speedups. LRU hits are ~5.5-6.5x faster and sets ~2-5x faster under
  Immer 11.
- Performance: the sorted collection's B-tree no longer shifts elements or wraps
  each element in an object. Each node is an array whose entries occupy fixed
  slots, ordered by a rank string, so an insertion or removal writes one slot
  and one string instead of moving every later element through Immer's
  proxies, and smaller nodes (10 children) keep Immer's per-node copying small.
  Sorted collection mutations are ~1.6-1.9x faster under Immer 10 and
  ~2.2-2.7x under Immer 11; iteration inside a producer is ~1.3-1.6x faster.
- Performance: sorted map `update` (and `set` with a new object) skips the index
  when a primitive ordering key is unchanged (~2.2x faster inside Immer, 5-15x
  outside). A stale index left by mutating a value outside the adapter is now
  detected when the entry next moves or is removed, rather than on every update.
- Performance: map iterators no longer allocate per-step frames or recurse;
  map value/key iteration skips the intermediate entry tuple. Outside Immer,
  map iteration is ~1.5-2x faster. Sorted map and LRU key iteration no longer
  look up each value.
- Trade-off: outside Immer, the persistent sorted map and LRU structures copy a
  path on every change, so building a sorted map is ~2.5-4x slower and LRU
  sets are ~1.7-2.7x slower; moves are at parity. Sorted collection iteration
  is up to ~1.3x slower. Inside Immer, all are faster.
- Simplify readonly map/set views (shared helpers) and map `has`/`get`/`update`;
  remove the unused `shallowCopy` helper.
