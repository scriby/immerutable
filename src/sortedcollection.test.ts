import {SortedCollectionAdapter} from './sortedcollection';

interface TestObject {
  key: string;
  order: number;
}

describe('B-tree', () => {
  const comparer = (a: number, b: number) => a - b;
  const objComparer = (a: TestObject, b: TestObject) => a.order - b.order;
  const range = (start: number, end: number) => new Array(end - start + 1).join().split(',').map((empty, i) => i + start);

  test('creates a sorted list', () => {
    const adapter = new SortedCollectionAdapter({ comparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    expect(btree.root.items.length).toBe(0);
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
    adapter.insert(btree, 13);
    adapter.insert(btree, 0);

    expect(Array.from(adapter.getIterable(btree))).toEqual(range(0, 13));
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

  test('removes items (right rotation)', () => {
    const adapter = new SortedCollectionAdapter({ comparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    for (let i = 1; i <= 10; i++) {
      adapter.insert(btree, i);
    }

    adapter.remove(btree, 3);
    adapter.remove(btree, 2);

    expect(Array.from(adapter.getIterable(btree))).toEqual([1].concat(range(4, 10)));
  });

  test('removes items (left rotation)', () => {
    const adapter = new SortedCollectionAdapter({ comparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    for (let i = 1; i <= 10; i++) {
      adapter.insert(btree, i);
    }

    adapter.remove(btree, 9);

    expect(Array.from(adapter.getIterable(btree))).toEqual(range(1, 8).concat(10));
  });

  test('removes items (combine leaves, middle -> left, parent is root)', () => {
    const adapter = new SortedCollectionAdapter({ comparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    for (let i = 1; i <= 10; i++) {
      adapter.insert(btree, i);
    }

    adapter.remove(btree, 7);
    adapter.remove(btree, 6);
    adapter.remove(btree, 5);

    expect(Array.from(adapter.getIterable(btree))).toEqual(range(1, 4).concat(range(8, 10)));
  });

  test('removes items (combine leaves, left -> middle, parent is root)', () => {
    const adapter = new SortedCollectionAdapter({ comparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    for (let i = 1; i <= 10; i++) {
      adapter.insert(btree, i);
    }

    adapter.remove(btree, 1);
    adapter.remove(btree, 2);
    adapter.remove(btree, 3);

    expect(Array.from(adapter.getIterable(btree))).toEqual(range(4, 10));
  });

  test('removes items (replace root)', () => {
    const adapter = new SortedCollectionAdapter({ comparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    for (let i = 1; i <= 6; i++) {
      adapter.insert(btree, i);
    }

    adapter.remove(btree, 1);
    adapter.remove(btree, 2);

    expect(Array.from(adapter.getIterable(btree))).toEqual(range(3, 6));
  });

  test('removes items (internal node - take from left subtree)', () => {
    const adapter = new SortedCollectionAdapter({ comparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.insert(btree, i);
    }

    adapter.remove(btree, 8);

    expect(Array.from(adapter.getIterable(btree))).toEqual(range(1, 7).concat(range(9, 20)));
  });

  test('removes items (internal node - take from left subtree with rebalance)', () => {
    const adapter = new SortedCollectionAdapter({ comparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.insert(btree, i);
    }

    adapter.remove(btree, 8);
    adapter.remove(btree, 7);

    expect(Array.from(adapter.getIterable(btree))).toEqual(range(1, 6).concat(range(9, 20)));
  });

  test('removes items descending from 20', () => {
    const adapter = new SortedCollectionAdapter({ comparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.insert(btree, i);
    }

    for (let i = 20; i >= 1; i--) {
      adapter.remove(btree, i);

      expect(Array.from(adapter.getIterable(btree))).toEqual(i === 1 ? [] : range(1, i - 1));
    }
  });

  test('removes items ascending to 20', () => {
    const adapter = new SortedCollectionAdapter({ comparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.insert(btree, i);
    }

    for (let i = 1; i <= 20; i++) {
      adapter.remove(btree, i);

      expect(Array.from(adapter.getIterable(btree))).toEqual(i === 20 ? [] : range(i + 1, 20));
    }
  });

  test('removes items from middle', () => {
    const adapter = new SortedCollectionAdapter({ comparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();
    const removalOrder = [10, 11, 9, 12, 8, 13, 7, 14, 6, 15, 5, 16, 4, 17, 3, 18, 2, 19, 1, 20];

    for (let i = 1; i <= 20; i++) {
      adapter.insert(btree, i);
    }

    for (let i = 0; i < 20; i++) {
      adapter.remove(btree, removalOrder[i]);

      expect(Array.from(adapter.getIterable(btree))).toEqual(removalOrder.slice(i + 1).sort((a, b) => a - b));
    }
  });

  test('removes one instance of duplicates', () => {
    const adapter = new SortedCollectionAdapter({ comparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.insert(btree, i);
      adapter.insert(btree, i);
    }

    expect(Array.from(adapter.getIterable(btree))).toEqual(range(1, 20).concat(range(1, 20)).sort(comparer));

    for (let i = 1; i <= 20; i++) {
      adapter.remove(btree, i);

      expect(Array.from(adapter.getIterable(btree))).toEqual((i === 20 ? [] : range(i + 1, 20)).concat(range(1, 20)).sort(comparer));
    }
  });

  test('reorders an item', () => {
    const adapter = new SortedCollectionAdapter({ comparer: objComparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();
    const items = [];

    for (let i = 1; i <= 20; i++) {
      items[i] = { key: i.toString(), order: i };
      adapter.insert(btree, items[items.length - 1]);
    }

    const nodeInfo = adapter.lookupValuePath(btree, items[10])!;
    items[10].order = 30;
    adapter.ensureSortedOrderOfNode(btree, nodeInfo);

    expect(Array.from(adapter.getIterable(btree))).toEqual(
      range(1, 9).concat(range(11, 20)).map(i => ({ key: i.toString(), order: i })).concat({ key: '10', order: 30 })
    )
  });

  test('reorders the first item', () => {
    const adapter = new SortedCollectionAdapter({ comparer: objComparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();
    const items = [];

    for (let i = 1; i <= 20; i++) {
      items[i] = { key: i.toString(), order: i };
      adapter.insert(btree, items[items.length - 1]);
    }

    const nodeInfo = adapter.lookupValuePath(btree, items[1])!;
    items[1].order = 30;
    adapter.ensureSortedOrderOfNode(btree, nodeInfo);

    expect(Array.from(adapter.getIterable(btree))).toEqual(
      range(2, 20).map(i => ({ key: i.toString(), order: i })).concat({ key: '1', order: 30 })
    )
  });

  test('reorders the last item', () => {
    const adapter = new SortedCollectionAdapter({ comparer: objComparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();
    const items = [];

    for (let i = 1; i <= 20; i++) {
      items[i] = { key: i.toString(), order: i };
      adapter.insert(btree, items[items.length - 1]);
    }

    const nodeInfo = adapter.lookupValuePath(btree, items[20])!;
    items[20].order = 0;
    adapter.ensureSortedOrderOfNode(btree, nodeInfo);

    expect(Array.from(adapter.getIterable(btree))).toEqual(
      [{ key: '20', order: 0 }].concat(range(1, 19).map(i => ({ key: i.toString(), order: i })))
    )
  });
});