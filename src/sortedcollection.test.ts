import {SortedCollection} from './sortedcollection';

describe('B-tree', () => {
  const comparer = (a: number, b: number) => a - b;
  const range = (start: number, end: number) => new Array(end - start + 1).join().split(',').map((empty, i) => i + start);

  test('creates a sorted list', () => {
    const sortedSet = new SortedCollection({ comparer, maxItemsPerLevel: 5 });
    const btree = sortedSet.create();

    expect(btree.items.length).toBe(0);
  });

  test('gets iterators (in-order insertion)', () => {
    for (let maxItemsPerLevel = 5; maxItemsPerLevel <= 13; maxItemsPerLevel += 2) {
      const sortedSet = new SortedCollection({ comparer, maxItemsPerLevel });

      for (let i = 1; i <= 100; i++) {
        const btree = sortedSet.create();

        for (let j = 1; j <= i; j++) {
          sortedSet.set(btree, j);
        }

        expect({ maxItemsPerLevel, array: Array.from(sortedSet.getIterable(btree)) })
          .toEqual({ maxItemsPerLevel, array: range(1, i) });
      }
    }
  });
});