import {SortedCollectionAdapter} from './sortedcollection';

describe('B-tree', () => {
  const comparer = (a: number, b: number) => a - b;
  const range = (start: number, end: number) => new Array(end - start + 1).join().split(',').map((empty, i) => i + start);

  test('creates a sorted list', () => {
    const adapter = new SortedCollectionAdapter({ comparer, maxItemsPerLevel: 7 });
    const btree = adapter.create();

    expect(btree.items.length).toBe(0);
  });

  test('gets iterators (in-order insertion)', () => {
    for (let maxItemsPerLevel = 7; maxItemsPerLevel <= 15; maxItemsPerLevel += 2) {
      const adapter = new SortedCollectionAdapter({ comparer, maxItemsPerLevel });

      for (let i = 1; i <= 100; i++) {
        const btree = adapter.create();

        for (let j = 1; j <= i; j++) {
          adapter.insert(btree, j);
        }

        expect({ maxItemsPerLevel, array: Array.from(adapter.getIterable(btree)) })
          .toEqual({ maxItemsPerLevel, array: range(1, i) });
      }
    }
  });
});