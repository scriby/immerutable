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
- Add deterministic regression/model tests, selectable Immer compatibility
  testing, seeded fuzzing, and repeatable throughput/eviction benchmarks.
