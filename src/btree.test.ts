import {createBTree, insertInBTree} from './btree';

describe('B-tree', () => {
  const COMPARER = (a: number, b: number) => a - b;

  const wrapValueNode = (n: number) => ({ value: n });

  const range = (start: number, end: number) => new Array(end - start + 1).join().split(',').map((empty, i) => i + start);
  const valueRange = (start: number, end: number) => range(start, end).map(wrapValueNode);

  test('creates a b-tree', () => {
    const btree = createBTree(5);

    expect(btree.items.length).toBe(0);
  });

  test('inserts an item', () => {
    const btree = createBTree(5);

    insertInBTree(btree, 1, COMPARER);

    expect(btree.items).toEqual([ { value: 1 } ]);
  });

  test('inserts multiple items', () => {
    const btree = createBTree(5);

    for (let i = 1; i <= 5; i++) {
      insertInBTree(btree, i, COMPARER);
    }

    expect(btree.items).toEqual(valueRange(1, 5));
  });

  test('splits the root node', () => {
    const btree = createBTree(5);

    for (let i = 1; i <= 6; i++) {
      insertInBTree(btree, i, COMPARER);
    }

    expect(btree.items).toEqual([
      { items: valueRange(1, 2) },
      wrapValueNode(3),
      { items: valueRange(4, 6) },
    ]);
  });

  test('splits a leaf node', () => {
    const btree = createBTree(5);

    for (let i = 1; i <= 9; i++) {
      insertInBTree(btree, i, COMPARER);
    }

    expect(btree.items).toEqual([
      { items: valueRange(1, 2) },
      wrapValueNode(3),
      { items: valueRange(4, 5) },
      wrapValueNode(6),
      { items: valueRange(7, 9) },
    ]);
  });
});