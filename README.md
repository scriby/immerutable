# immerutable

The aim of this library is to provide scalable and performant data structures for use with Immer. Immer makes
modifying immutable data simple & straightforward, but has lackluster performance when making many small modifications
to arrays and large objects (maps). In order for Immer to retain immutability of the data, it must create copies of
the arrays & objects that are modified (or contain something which is modified). Creating these copies becomes
expensive as they grow in size.

This library is inspired by ImmutableJS and provides data structures which use structural sharing which allow Immer
to make copies of subsets of large objects when data changes. For large arrays & objects using Immerutable will provide
a 30-40x+ speedup over basic arrays and objects with Immer (the larger the object, the greater the speedup).

## Data structures

### Map

Similar to using an object as a Map in javascript, this data structure allows an object to be indexed by a key.
As of now, the key must either be a number or string. Get/has/set/remove operations are all constant time, and iteration
is linear time. The underlying implementation for this data structure is a trie.

### Sorted Collection

This collection is similar to an array where all the items are kept in sorted order. However, it differs from an array
in that items cannot be looked up by index, but they can be iterated in order. Insertion and removal are log(n)
operations, and iteration is linear. The underlying implementation of this data structure is a B-tree.

## Benchmarks

All benchmarks are the time to perform 4,000 operations. For instance, 4,000 individual insertions into a map or array.

immer map (set): 1900.405ms
immerutable map (set): 48.084ms
-------------------------------------------
immer array (insert in increasing order): 168.088ms
immer array (insert in random order): 4017.524ms
immer array (insert in decreasing order): 7790.873ms
immerutable sorted collection (insert in increasing order): 107.597ms
immerutable sorted collection (insert in random order): 267.842ms
immerutable sorted collection (insert in decreasing order): 235.885ms
-------------------------------------------
immerutable sorted map (insert in increasing order): 166.177ms
immerutable sorted map (insert in random order): 345.034ms
immerutable sorted map (insert in decreasing order): 305.022ms