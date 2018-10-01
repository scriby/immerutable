import {SortedCollectionAdapter} from './sortedcollection';
import Test = jest.Test;

interface TestObject {
  key: string;
  order: number;
}

describe('B-tree', () => {
  const orderComparer = (a: number, b: number) => a - b;
  const objOrderComparer = (a: TestObject, b: TestObject) => a.order - b.order;
  const range = (start: number, end: number) => new Array(end - start + 1).join().split(',').map((empty, i) => i + start);

  test('creates a sorted list', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    expect(btree.root.items.length).toBe(0);
  });

  test('inserts 1 through 10 in order', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    for (let i = 1; i <= 10; i++) {
      adapter.insert(btree, i);
    }

    expect(Array.from(adapter.getIterable(btree))).toEqual(range(1, 10));
  });

  test('inserts 1 through 10 in reverse order', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    for (let i = 10; i > 0; i--) {
      adapter.insert(btree, i);
    }

    expect(Array.from(adapter.getIterable(btree))).toEqual(range(1, 10));
  });

  test('re-orders input', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer, maxItemsPerLevel: 4 });
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
      const adapter = new SortedCollectionAdapter({ orderComparer, maxItemsPerLevel });

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
    const adapter = new SortedCollectionAdapter({ orderComparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    for (let i = 1; i <= 10; i++) {
      adapter.insert(btree, i);
    }

    adapter.remove(btree, 3);
    adapter.remove(btree, 2);

    expect(Array.from(adapter.getIterable(btree))).toEqual([1].concat(range(4, 10)));
  });

  test('removes items (left rotation)', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    for (let i = 1; i <= 10; i++) {
      adapter.insert(btree, i);
    }

    adapter.remove(btree, 9);

    expect(Array.from(adapter.getIterable(btree))).toEqual(range(1, 8).concat(10));
  });

  test('removes items (combine leaves, middle -> left, parent is root)', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer, maxItemsPerLevel: 4 });
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
    const adapter = new SortedCollectionAdapter({ orderComparer, maxItemsPerLevel: 4 });
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
    const adapter = new SortedCollectionAdapter({ orderComparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    for (let i = 1; i <= 6; i++) {
      adapter.insert(btree, i);
    }

    adapter.remove(btree, 1);
    adapter.remove(btree, 2);

    expect(Array.from(adapter.getIterable(btree))).toEqual(range(3, 6));
  });

  test('removes items (internal node - take from left subtree)', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.insert(btree, i);
    }

    adapter.remove(btree, 8);

    expect(Array.from(adapter.getIterable(btree))).toEqual(range(1, 7).concat(range(9, 20)));
  });

  test('removes items (internal node - take from left subtree with rebalance)', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.insert(btree, i);
    }

    adapter.remove(btree, 8);
    adapter.remove(btree, 7);

    expect(Array.from(adapter.getIterable(btree))).toEqual(range(1, 6).concat(range(9, 20)));
  });

  test('removes items descending from 20', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.insert(btree, i);
    }

    for (let i = 20; i >= 1; i--) {
      adapter.remove(btree, i);

      expect(Array.from(adapter.getIterable(btree))).toEqual(i === 1 ? [] : range(1, i - 1));
    }
  });

  test('removes items descending from 20 (same ordering key)', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer: () => 0, maxItemsPerLevel: 4 });
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
    const adapter = new SortedCollectionAdapter({ orderComparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.insert(btree, i);
    }

    expect(adapter.getSize(btree)).toBe(20);

    for (let i = 1; i <= 20; i++) {
      adapter.remove(btree, i);

      expect(Array.from(adapter.getIterable(btree))).toEqual(i === 20 ? [] : range(i + 1, 20));
      expect(adapter.getSize(btree)).toBe(20 - i);
    }
  });

  test('removes items ascending to 20 (same ordering key)', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer: () => 0, maxItemsPerLevel: 4 });
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
    const adapter = new SortedCollectionAdapter({ orderComparer, maxItemsPerLevel: 4 });
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

  test('removes items in a specific order', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();
    // This order covers some cases not covered by other tests.
    const removalOrder = [
      9, 6, 10, 21, 32, 22, 11, 23, 18, 24,
      16, 25, 34, 26, 17, 27, 20, 28, 4, 15,
      36, 2, 38, 14, 40, 1, 13, 30, 5, 8,
      29, 7, 12, 35, 39, 19, 37, 3, 33, 31 ];

    for (let i = 1; i <= 40; i++) {
      adapter.insert(btree, i);
    }

    for (let i = 0; i < 40; i++) {
      adapter.remove(btree, removalOrder[i]);

      expect(Array.from(adapter.getIterable(btree))).toEqual(removalOrder.slice(i + 1).sort((a, b) => a - b));
    }
  });

  test('removes one instance of duplicates', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.insert(btree, i);
      adapter.insert(btree, i);
    }

    expect(Array.from(adapter.getIterable(btree))).toEqual(range(1, 20).concat(range(1, 20)).sort(orderComparer));

    for (let i = 1; i <= 20; i++) {
      adapter.remove(btree, i);

      expect(Array.from(adapter.getIterable(btree))).toEqual((i === 20 ? [] : range(i + 1, 20)).concat(range(1, 20)).sort(orderComparer));
    }
  });

  test('removes a non-existent item (middle)', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer });
    const btree = adapter.create();

    adapter.insert(btree, 1);
    adapter.insert(btree, 2);
    adapter.insert(btree, 4);
    adapter.insert(btree, 5);

    expect(Array.from(adapter.getIterable(btree))).toEqual([1, 2, 4, 5]);

    adapter.remove(btree, 3);

    expect(Array.from(adapter.getIterable(btree))).toEqual([1, 2, 4, 5]);
  });

  test('removes a non-existent item', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer });
    const btree = adapter.create();

    adapter.remove(btree, 1);

    expect(Array.from(adapter.getIterable(btree))).toEqual([]);
  });

  test('removes an item with many items sharing the same order key', () => {
    const adapter = new SortedCollectionAdapter({
      orderComparer: objOrderComparer,
      equalityComparer: (a, b) => a.key === b.key,
    });
    const btree = adapter.create();
    const items = [
      { key: '1', order: -1 },
      { key: '2', order: 0 },
      { key: '3', order: 0 },
      { key: '4', order: 0 },
      { key: '5', order: 1 },
    ];

    items.forEach(item => adapter.insert(btree, item));

    expect(Array.from(adapter.getIterable(btree))).toEqual(items);
    adapter.remove(btree, { key: '4', order: 0 });

    expect(Array.from(adapter.getIterable(btree))).toEqual(items.filter(item => item.key !== '4'));
  });

  test('reorders an item', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer: objOrderComparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();
    const items = [];

    for (let i = 1; i <= 20; i++) {
      items[i] = { key: i.toString(), order: i };
      adapter.insert(btree, items[items.length - 1]);
    }

    adapter.update(btree, items[10], (item) => { item.order = 30; });

    expect(Array.from(adapter.getIterable(btree))).toEqual(
      range(1, 9).concat(range(11, 20)).map(i => ({ key: i.toString(), order: i })).concat({ key: '10', order: 30 })
    )
  });

  test('reorders the first item', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer: objOrderComparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();
    const items = [];

    for (let i = 1; i <= 20; i++) {
      items[i] = { key: i.toString(), order: i };
      adapter.insert(btree, items[items.length - 1]);
    }

    adapter.update(btree, items[1], (item) => { item.order = 30; });

    expect(Array.from(adapter.getIterable(btree))).toEqual(
      range(2, 20).map(i => ({ key: i.toString(), order: i })).concat({ key: '1', order: 30 })
    )
  });

  test('reorders the last item', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer: objOrderComparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();
    const items = [];

    for (let i = 1; i <= 20; i++) {
      items[i] = { key: i.toString(), order: i };
      adapter.insert(btree, items[items.length - 1]);
    }

    adapter.update(btree, items[20], (item) => { item.order = 0; });

    expect(Array.from(adapter.getIterable(btree))).toEqual(
      [{ key: '20', order: 0 }].concat(range(1, 19).map(i => ({ key: i.toString(), order: i })))
    )
  });

  test('gets the first item', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    for (let i = 1; i <= 10; i++) {
      adapter.insert(btree, i);
    }

    expect(adapter.getFirst(btree)).toEqual(1);
  });

  test('gets the last item', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    for (let i = 1; i <= 10; i++) {
      adapter.insert(btree, i);
    }

    expect(adapter.getLast(btree)).toEqual(10);
  });

  test('gets undefined for the first item of an empty collection', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    expect(adapter.getFirst(btree)).toBeUndefined();
  });

  test('gets undefined for the last item of an empty collection', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    expect(adapter.getLast(btree)).toBeUndefined();
  });
});