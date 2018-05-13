import {createBTree, getBTreeIterable, insertInBTree} from './btree';

describe('B-tree', () => {
  const COMPARER = (a: number, b: number) => a - b;

  const wrapValueNode = (n: number) => ({ value: n });

  const range = (start: number, end: number) => new Array(end - start + 1).join().split(',').map((empty, i) => i + start);
  const valueRange = (start: number, end: number) => range(start, end).map(wrapValueNode);

  test('creates a b-tree', () => {
    const btree = createBTree(5);

    expect(btree.items.length).toBe(0);
  });

  test('gets iterators (in-order insertion)', () => {
    for (let maxItemsPerLevel = 5; maxItemsPerLevel <= 13; maxItemsPerLevel += 2) {
      for (let i = 1; i <= 100; i++) {
        const btree = createBTree(maxItemsPerLevel);

        for (let j = 1; j <= i; j++) {
          insertInBTree(btree, j, COMPARER);
        }

        expect({ maxItemsPerLevel, array: Array.from(getBTreeIterable(btree)) })
          .toEqual({ maxItemsPerLevel, array: range(1, i) });
      }
    }
  });
});