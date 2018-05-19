import {SortedCollectionAdapter} from './sortedcollection';

describe('B-tree', () => {
  const comparer = (a: number, b: number) => a - b;
  const range = (start: number, end: number) => new Array(end - start + 1).join().split(',').map((empty, i) => i + start);

  test('creates a sorted list', () => {
    const adapter = new SortedCollectionAdapter({ comparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    expect(btree.items.length).toBe(0);
  });

  test('inserts 1 through 10 in order', () => {
    const adapter = new SortedCollectionAdapter({ comparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    for (let i = 1; i <= 10; i++) {
      adapter.insert(btree, i);
    }

    expect(Array.from(adapter.getIterable(btree))).toEqual(range(1, 10));
  });

  test('re-orders input', () => {
    const adapter = new SortedCollectionAdapter({ comparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    adapter.insert(btree, 7);
    adapter.insert(btree, 3);
    adapter.insert(btree, 1);
    adapter.insert(btree, 2);
    adapter.insert(btree, 4);
    adapter.insert(btree, 11);
    adapter.insert(btree, 8);
    adapter.insert(btree, 5);
    adapter.insert(btree, 6);
    adapter.insert(btree, 9);
    adapter.insert(btree, 10);
    adapter.insert(btree, 12);

    expect(Array.from(adapter.getIterable(btree))).toEqual(range(1, 12));
  });

  test('gets iterators (in-order insertion)', () => {
    for (let maxItemsPerLevel = 4; maxItemsPerLevel <= 16; maxItemsPerLevel += 2) {
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