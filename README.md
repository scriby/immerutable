# immerutable

The aim of this library is to provide scalable and performant data structures for use with Immer. Immer makes
modifying immutable data simple & straightforward, but has lackluster performance when making many small modifications
to arrays and large objects (maps). In order for Immer to retain immutability of the data, it must create copies of
the arrays & objects that are modified (or contain something which is modified). Creating these copies becomes
expensive as they grow in size.

This library is inspired by ImmutableJS and provides data structures which use structural sharing that allow Immer
to make copies of subsets of large objects when data changes. For large arrays & objects using Immerutable will provide
a 30-40x+ speedup over basic arrays and objects with Immer (the larger the object, the greater the speedup).

## Benchmarks

All [benchmarks](benchmark/benchmark.ts) are the time to perform 4,000 operations. For instance, 4,000 individual insertions into a map or array.

|benchmark|time|
|---------|----|
|immer map (set)|1900ms|
|immerutable map (set)|48ms|
|||
|immer array (insert in increasing order)|168ms|
|immer array (insert in random order)|4018ms|
|immer array (insert in decreasing order)|7791ms|
|immerutable sorted collection (insert in increasing order)|108ms|
|immerutable sorted collection (insert in random order)|268ms|
|immerutable sorted collection (insert in decreasing order)|236ms|
|||
|immerutable sorted map (insert in increasing order)|166ms|
|immerutable sorted map (insert in random order)|345ms|
|immerutable sorted map (insert in decreasing order)|305ms|

### When should I use this?

* Dealing with large data structures, especially ones containing more than 10,000 items
* If you have a use case dealing with performing many small modifications on a list or map with thousands of items
* The data structures such as SortedMap are a good fit for a use case you have

## Data structures

All data structures are implemented as plain javascript objects such that they are fully serializable if stored in
a redux or ngrx store. Because the data structures are plain objects, the methods for dealing with the data structure
are not on the objects themselves. Rather, an "adapter" class is used which accepts the data structure as an argument
to each method.

### Usage with Immer

Example reducer using an Immerutable Sorted Map:

```typescript
import {produce} from 'immer';
import {ISortedMap, SortedMapAdapter} from 'immerutable';
import {createFeatureSelector, createSelector} from 'ngrx';

export interface Book {
  id: string;
  title: string;
  author: string;
}

enum BookActionTypes {
  ADD_BOOK = 'ADD_BOOK',
  UPDATE_BOOK = 'UPDATE_BOOK',
  REMOVE_BOOK = 'REMOVE_BOOK'
}

export class AddBook {
  readonly type = BookActionTypes.ADD_BOOK;
  constructor(readonly payload: { book: Book }) {}
}

export class UpdateBook {
  readonly type = BookActionTypes.UPDATE_BOOK;
  constructor(readonly payload: { book: Book }) {}
}

export class RemoveBook {
  readonly type = BookActionTypes.REMOVE_BOOK;
  constructor(readonly payload: { bookId: string }) {}
}

const BookActions = AddBook | UpdateBook | RemoveBook;

const bookAdapter = new SortedMapAdapter<string, Book>({
  getOrderingKey: (book) => book.title
});

export interface BooksState {
  books: ISortedMap<string, Book>;
}

const initialState: BooksState = {
  books: bookAdapter.create()
};

export function bookReducer = produce((draft: BooksState, action: BookActions) => {
  switch (action.type) {
    case BookActionTypes.ADD_BOOK:
      bookAdapter.set(draft.books, action.payload.book.id, action.payload.book);
    break;
    case BookActionTypes.UPDATE_BOOK:
      bookAdapter.update(draft.books, action.payload.book.id, (book: Book) => {
        return action.payload.book; // Or, mutate the book object directly.
      });
      break;
    case BookActionTypes.REMOVE_BOOK:
      bookAdapter.remove(draft.books, action.payload.bookId);
      break;
    default:
      return initialState;
  }
});


// Example selectors
export const booksFeature = createFeatureSelector('books');

export const getBooksIterable = createSelector(booksFeature, (booksState: BooksState) => {
  return booksAdapter.getValuesIterable(booksState.books);
});
```

### Map

Similar to using an object as a Map in javascript, this data structure allows an object to be indexed by a key.
As of now, the key must either be a number or string. Get/has/set/remove operations are all constant time, and iteration
is linear time. The underlying implementation for this data structure is a trie.

```typescript
import {MapAdapter} from 'immerutable';

interface TestObject {
  data: string;
}

// Create an adapter to work with the map.
const adapter = new MapAdapter<number, TestObject>();

// Create an empty map. Store this result of this in the redux or ngrx store.
const map = adapter.create();

// Set an item in the map.
adapter.set(map, 1, { data: 'test' });

// Get an item out of the map by key.
const item = adapter.get(map, 1);

// Check if the map has an item.
const hasItem = adapter.has(map, 1);

// Update an item in the map if it already exists.
adapter.update(map, 1, (item) => {
  item.data = 'updated'; // The item may be mutated directly, or a new item may be returned.
});

// Get the number of items in the map.
const size = adapter.getSize(map);

// Iterate through the map items (order is not guaranteed).
// With iterator downleveling (setting in tsconfig) or ES6:
for (const {key, value} of adapter.getIterable(map)) {
  console.log(key, value);
}

// Without iterator downleveling:
const iterable = adapter.getIterable(map);
const iterator = iterable[Symbol.iterator](); // May need Symbol.iterator polyfill
let next: TestObject;

while (!(next = iterator.next()).done) {
  const {key, value} = next.value;
  console.log(key, value);
}

// Convert to an array. May require polyfill.
Array.from(adapter.getIterable(map));

// Remove an item from the map by key.
adapter.remove(map, 1);
```

### Sorted Collection

This collection is similar to an array where all the items are kept in sorted order. However, it differs from an array
in that items cannot be looked up by index, but they can be iterated in order. Insertion and removal are log(n)
operations, and iteration is linear. The underlying implementation of this data structure is a B-tree.

```typescript
import {SortedCollectionAdapter} from 'immerutable';

interface TestObject {
  id: string;
  data: string;
  order: number;
}

// Create an adapter to work with the sorted collection.
const adapter = new SortedCollectionAdapter<TestObject>({
  orderComparer: (a, b) => a.order - b.order,
  equalityComparer: (a, b) => a.id === b.id,
});

// Create an empty sorted collection. Store the result of this in the redux or ngrx store.
const sortedCollection = adapter.create();

const item = { id: 'a', data: 'test', order: 1 };

// Add an item to the sorted collection. Duplicates are allowed.
adapter.insert(sortedCollection, item);

// Update an item in the sorted collection. Updates to ordering properties MUST take 
// place from within the update method for the collection to stay in sorted order.
const updated = adapter.update(sortedCollection, item, (existing) => {
  existing.order = 2; // The item may be mutated, or a new item may be returned.
});

// Get the number of items in the collection.
const size = adapter.getSize(sortedCollection);

// Get the first item in sorted order in the collection.
const first = adapter.getFirst(sortedCollection);

// Get the last item in sorted order in the collection.
const last = adapter.getLast(sortedCollection);

// Iterate through the items in the collection (with iterator downleveling or ES6). 
// See map example for ES5 iterator.
for (const item of adapter.getIterable(sortedCollection)) {
  console.log(item);
}

// Convert to an array (May require polyfill).
Array.from(updater.getIterable(sortedCollection));

// Remove an item from the sorted collection. Properties which are used as part 
// of the orderComparer and equalityComparer must be included (other properties are optional).
adapter.remove(sortedCollection, updated);
```

### Sorted Map

A sorted map combines the map and sorted collection data structures to provide a map which can be iterated in sorted
order. This data structure is useful for efficiently keeping a list of items in order as items are added and removed
for the purpose of rendering the list in a UI.

```typescript
import {SortedMapAdapter} from 'immerutable';

interface TestObject {
  id: string;
  data: string;
  order: number;
}

const adapter = new SortedMapAdapter<string, TestObject>({
  getOrderingKey: (item) => item.order
});

const sortedMap = adapter.create();

// Set an item in the sorted map.
adapter.set(sortedMap, 1, { data: 'test' });

// Get an item out of the sorted map by key.
const item = adapter.get(sortedMap, 1);

// Check if the sorted map has an item.
const hasItem = adapter.has(sortedMap, 1);

// Update an item in the sorted map if it already exists.
adapter.update(sortedMap, 1, (item) => {
  item.data = 'updated'; // The item may be mutated directly, or a new item may be returned.
});

// Get the number of items in the sorted map.
const size = adapter.getSize(sortedMap);

// Get the first item in sorted order in the sorted map.
const first = adapter.getFirst(sortedMap);

// Get the last item in sorted order in the sorted map.
const last = adapter.getLast(sortedMap);

// Iterate through the map items in sorted order.
// With iterator downleveling (setting in tsconfig) or ES6:
for (const {key, value} of adapter.getIterable(sortedMap)) {
  console.log(key, value);
}

// Iterate just through the values in sorted order.
for (const value of adapter.getValuesIterable(sortedMap)) {
  console.log(value);
}

// Convert values to an array. May require polyfill.
Array.from(adapter.getValuesIterable(sortedMap));

// Remove an item from the sorted map by key.
adapter.remove(sortedMap, 1);
```
