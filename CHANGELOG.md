# Changelog

## Unreleased

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
