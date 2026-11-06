# Changelog

## Unreleased

- Correct map removal/update of absent colliding keys, NaN key identity, and
  sparse-array removal in Immer's ES5 mode.
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
  comparer instead of treating them as equal to every key. Sorted map `remove`
  now throws, like `set` and `update`, rather than deleting only the map entry
  when the sorted index cannot find it.
- Sorted collection `update` returns the current item when the updater mutates
  it in place, matching the map adapters.
- Stop sorted collection lookups of absent values from searching subtrees that
  cannot contain them (previously O(2^height) nodes per miss).
- Fix README and doc-comment iteration examples: iterables yield `[key, value]`
  tuples.
- Add deterministic regression/model tests, selectable Immer compatibility
  testing, seeded fuzzing, and repeatable throughput/eviction benchmarks.
