import produce from './test-support/immer';
import {isDraft} from 'immer';
import {SortedCollectionAdapter} from './sortedcollection';
import {untouched} from './util';

interface TestObject {
  key: string;
  order: number;
}

describe('B-tree', () => {
  const orderComparer = (a: number, b: number) => a - b;
  const objOrderComparer = (a: TestObject, b: TestObject) => a.order - b.order;
  const range = (start: number, end: number) => new Array(end - start + 1).join().split(',').map((empty, i) => i + start);

  it('creates a sorted list', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    expect(adapter.getSize(btree)).toBe(0);
    expect(Array.from(adapter.getIterable(btree))).toEqual([]);
    expect(adapter.getFirst(btree)).toBeUndefined();
  });

  it('keeps a multi-level collection usable after a JSON round trip', () => {
    const adapter = new SortedCollectionAdapter<{id: number, order: number}>({
      orderComparer: (a, b) => a.order - b.order, equalityComparer: (a, b) => a.id === b.id, maxItemsPerLevel: 4,
    });
    let collection = adapter.create();
    for (let i = 0; i < 200; i++) adapter.insert(collection, {id: i, order: (i * 37) % 101});
    const before = Array.from(adapter.getIterable(collection));
    collection = JSON.parse(JSON.stringify(collection));

    expect(Array.from(adapter.getIterable(collection))).toEqual(before);
    expect(Array.from(adapter.getIterable(collection, 'backward'))).toEqual([...before].reverse());
    adapter.update(collection, {id: 5, order: (5 * 37) % 101}, item => { item.order = -1; });
    adapter.remove(collection, {id: 6, order: (6 * 37) % 101});
    adapter.insert(collection, {id: 1000, order: 1000});

    const orders = Array.from(adapter.getIterable(collection)).map(item => item.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(adapter.getFirst(collection)).toEqual({id: 5, order: -1});
    expect(adapter.getSize(collection)).toBe(200);
  });

  it('inserts 1 through 10 in order', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    for (let i = 1; i <= 10; i++) {
      adapter.insert(btree, i);
    }

    expect(Array.from(adapter.getIterable(btree))).toEqual(range(1, 10));
  });

  it('inserts 1 through 10 in reverse order', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    for (let i = 10; i > 0; i--) {
      adapter.insert(btree, i);
    }

    expect(Array.from(adapter.getIterable(btree))).toEqual(range(1, 10));
  });

  it('re-orders input', () => {
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

  it('gets iterators (in-order insertion)', () => {
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

  it('removes items (right rotation)', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    for (let i = 1; i <= 10; i++) {
      adapter.insert(btree, i);
    }

    adapter.remove(btree, 3);
    adapter.remove(btree, 2);

    expect(Array.from(adapter.getIterable(btree))).toEqual([1].concat(range(4, 10)));
  });

  it('removes items (left rotation)', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    for (let i = 1; i <= 10; i++) {
      adapter.insert(btree, i);
    }

    adapter.remove(btree, 9);

    expect(Array.from(adapter.getIterable(btree))).toEqual(range(1, 8).concat(10));
  });

  it('removes items (combine leaves, middle -> left, parent is root)', () => {
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

  it('removes items (combine leaves, left -> middle, parent is root)', () => {
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

  it('removes items (replace root)', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    for (let i = 1; i <= 6; i++) {
      adapter.insert(btree, i);
    }

    adapter.remove(btree, 1);
    adapter.remove(btree, 2);

    expect(Array.from(adapter.getIterable(btree))).toEqual(range(3, 6));
  });

  it('removes items (internal node - take from left subtree)', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.insert(btree, i);
    }

    adapter.remove(btree, 8);

    expect(Array.from(adapter.getIterable(btree))).toEqual(range(1, 7).concat(range(9, 20)));
  });

  it('removes items (internal node - take from left subtree with rebalance)', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.insert(btree, i);
    }

    adapter.remove(btree, 8);
    adapter.remove(btree, 7);

    expect(Array.from(adapter.getIterable(btree))).toEqual(range(1, 6).concat(range(9, 20)));
  });

  it('removes items descending from 20', () => {
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

  it('removes items descending from 20 (same ordering key)', () => {
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

  it('removes items ascending to 20', () => {
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

  it('removes items ascending to 20 (same ordering key)', () => {
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

  it('removes items from middle', () => {
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

  it('removes items in a specific order', () => {
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

  it('removes one instance of duplicates', () => {
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

  it('removes a non-existent item (middle)', () => {
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

  it('removes a non-existent item', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer });
    const btree = adapter.create();

    adapter.remove(btree, 1);

    expect(Array.from(adapter.getIterable(btree))).toEqual([]);
  });

  it('removes an item with many items sharing the same order key', () => {
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

  it('reorders an item', () => {
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

  it('reorders the first item', () => {
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

  it('reorders the last item', () => {
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

  it('gets the first item', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    for (let i = 1; i <= 10; i++) {
      adapter.insert(btree, i);
    }

    expect(adapter.getFirst(btree)).toEqual(1);
  });

  it('gets the last item', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    for (let i = 1; i <= 10; i++) {
      adapter.insert(btree, i);
    }

    expect(adapter.getLast(btree)).toEqual(10);
  });

  it('gets undefined for the first item of an empty collection', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    expect(adapter.getFirst(btree)).toBeUndefined();
  });

  it('gets undefined for the last item of an empty collection', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    expect(adapter.getLast(btree)).toBeUndefined();
  });

  it('gets backwards iterables from 0 to 50', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    for (let i = 0; i < 50; i++) {
      adapter.insert(btree, i);

      expect(Array.from(adapter.getIterable(btree, 'backward')).reverse()).toEqual(range(0, i));
    }
  });

  it('gets backwards iterables from 50 to 0', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    for (let i = 50; i >= 0; i--) {
      adapter.insert(btree, i);

      expect(Array.from(adapter.getIterable(btree, 'backward')).reverse()).toEqual(range(i, 50));
    }
  });

  it('iterates iterables multiple times', () => {
    const adapter = new SortedCollectionAdapter({ orderComparer, maxItemsPerLevel: 4 });
    const btree = adapter.create();

    for (let i = 0; i < 20; i++) {
      adapter.insert(btree, i);
    }

    const iterable = adapter.getIterable(btree, 'forward');
    const backwardIterable = adapter.getIterable(btree, 'backward');

    expect(Array.from(iterable)).toEqual(Array.from(iterable));
    expect(Array.from(backwardIterable)).toEqual(Array.from(backwardIterable));

    expect(Array.from(iterable).length).toBeGreaterThan(0);
  });

  describe('updates and undefined elements', () => {
    it.each([
      {values: [0, 1], from: 1, to: -1, expected: [-1, 0]},
      {values: [-1, 0], from: -1, to: 1, expected: [0, 1]},
    ])('reorders across a zero-valued neighbor: $values, $from -> $to', ({values, from, to, expected}) => {
      const adapter = new SortedCollectionAdapter<number>({orderComparer: (a, b) => a - b});
      const collection = adapter.create();
      values.forEach(value => adapter.insert(collection, value));

      adapter.update(collection, from, () => to);

      expect(Array.from(adapter.getIterable(collection))).toEqual(expected);
      expect(adapter.getFirst(collection)).toBe(expected[0]);
      expect(adapter.getLast(collection)).toBe(expected[1]);
    });

    it.each(['forward', 'backward'] as const)('does not terminate %s iteration at an undefined element', direction => {
      const adapter = new SortedCollectionAdapter<number | undefined>({
        orderComparer: (a, b) => (a === undefined ? 0 : a) - (b === undefined ? 0 : b),
      });
      const collection = adapter.create();
      [-1, undefined, 1].forEach(value => adapter.insert(collection, value));

      const expected = direction === 'forward' ? [-1, undefined, 1] : [1, undefined, -1];
      expect(Array.from(adapter.getIterable(collection, direction))).toEqual(expected);
      expect(adapter.getSize(collection)).toBe(3);
    });
  });

  describe('update return value', () => {
    // MapAdapter.update and SortedMapAdapter.update return the current value
    // when the updater mutates in place. The README's sorted collection example
    // relies on that: it passes update's result straight to remove().
    it('returns the item when the updater mutates it in place', () => {
      const adapter = new SortedCollectionAdapter<TestObject>({
        orderComparer: (a, b) => a.order - b.order,
        equalityComparer: (a, b) => a.key === b.key,
      });
      const collection = adapter.create();
      const item = {key: 'a', order: 1};
      adapter.insert(collection, item);

      const updated = adapter.update(collection, item, existing => { existing.order = 2; });

      expect(updated).toBe(item);
    });

    it('supports the README flow of removing the value returned by update', () => {
      const adapter = new SortedCollectionAdapter<TestObject>({
        orderComparer: (a, b) => a.order - b.order,
        equalityComparer: (a, b) => a.key === b.key,
      });
      const collection = adapter.create();
      const item = {key: 'a', order: 1};
      adapter.insert(collection, item);

      const updated = adapter.update(collection, item, existing => { existing.order = 2; });
      adapter.remove(collection, updated as TestObject);

      expect(adapter.getSize(collection)).toBe(0);
    });
  });

  describe('lookup cost for absent values', () => {
    // Lookup's backward scan descends into children[index - 1] before checking
    // whether items[index - 1] can still match. That subtree lies wholly below
    // the value, and the same happens at every level, so a miss visits
    // O(2^height) nodes instead of one root-to-leaf path.
    it.each([
      {maxItemsPerLevel: 4, size: 4096},
      {maxItemsPerLevel: 8, size: 50000},
    ])('stays logarithmic with $size items and maxItemsPerLevel $maxItemsPerLevel', ({maxItemsPerLevel, size}) => {
      let comparisons = 0;
      const adapter = new SortedCollectionAdapter<number>({
        orderComparer: (a, b) => { comparisons++; return a - b; },
        maxItemsPerLevel,
      });
      const collection = adapter.create();
      for (let i = 0; i < size; i++) adapter.insert(collection, i * 2);

      comparisons = 0;
      adapter.remove(collection, size + 1); // odd values are never present

      // A root-to-leaf search needs about log2(size) comparisons; allow 4x.
      expect(comparisons).toBeLessThanOrEqual(4 * Math.ceil(Math.log2(size)));
      expect(adapter.getSize(collection)).toBe(size);
    });
  });

  describe('lookup handles', () => {
    type Item = {id: number, o: number, tag?: string};
    const adapter = new SortedCollectionAdapter<Item>({orderComparer: (a, b) => a.o - b.o, equalityComparer: (a, b) => a.id === b.id, maxItemsPerLevel: 4});

    it('stores a replacement assigned to the handle', () => {
      let collection = produce(adapter.create(), draft => { for (let i = 0; i < 20; i++) adapter.insert(draft, {id: i, o: i}); });
      collection = produce(collection, draft => {
        const info = adapter.lookupValuePath(draft, {id: 2, o: 2})!;
        expect(info.valueNode.value.id).toBe(2);
        info.valueNode.value = {id: 2, o: 2, tag: 'replaced'};
      });
      expect(Array.from(adapter.getIterable(collection))[2]).toEqual({id: 2, o: 2, tag: 'replaced'});

      collection = produce(collection, draft => {
        const info = adapter.lookupValuePath(draft, {id: 3, o: 3})!;
        info.valueNode.value = {id: 3, o: 100};
        adapter.ensureSortedOrderOfNode(draft, info);
      });
      const items = Array.from(adapter.getIterable(collection));
      expect(items[items.length - 1]).toEqual({id: 3, o: 100});
      expect(items.map(item => item.o)).toEqual([...items.map(item => item.o)].sort((a, b) => a - b));
    });
  });

  describe('searches inside a producer', () => {
    type Item = {id: number, o: number};

    it('compares against the items of the original state, and reads the root only once an item is found', () => {
      const comparedWithDraft: boolean[] = [];
      const adapter = new SortedCollectionAdapter<Item>({
        orderComparer: (a, b) => { comparedWithDraft.push(isDraft(b)); return a.o - b.o; },
        equalityComparer: (a, b) => a.id === b.id,
        maxItemsPerLevel: 4,
      });
      const collection = produce(adapter.create(), draft => { for (let i = 0; i < 60; i++) adapter.insert(draft, {id: i, o: i}); });
      comparedWithDraft.length = 0;

      // The first call of a producer searches the original state, whichever call it is.
      produce(collection, draft => { adapter.insert(draft, {id: 200, o: 30.5}); });
      expect(comparedWithDraft.length).toBeGreaterThan(0);
      expect(comparedWithDraft).not.toContain(true);
      comparedWithDraft.length = 0;

      const next = produce(collection, draft => {
        adapter.remove(draft, {id: -1, o: 30.5});
        // A search that finds nothing leaves the tree unread through the draft.
        expect(untouched(draft, 'root')).toBe(collection.root);

        let comparisonsToFind = 0;
        adapter.update(draft, {id: 40, o: 40}, item => {
          comparisonsToFind = comparedWithDraft.length;
          item.o = 5.5;
        });
        expect(comparisonsToFind).toBeGreaterThan(0);
        expect(comparedWithDraft.slice(0, comparisonsToFind)).not.toContain(true);
        expect(untouched(draft, 'root')).toBeUndefined();

        // Later searches go through the draft, and see the change.
        adapter.remove(draft, {id: 40, o: 5.5});
        adapter.insert(draft, {id: 100, o: 5.25});
      });

      expect(Array.from(adapter.getIterable(next)).map(item => item.id))
        .toEqual([0, 1, 2, 3, 4, 5, 100, ...Array.from({length: 54}, (_, i) => i + 6).filter(id => id !== 40)]);
      expect(Array.from(adapter.getIterable(collection)).map(item => item.id)).toEqual(Array.from({length: 60}, (_, i) => i));
    });
  });

  it('leaves equality to a custom comparer alone, even for the very object stored', () => {
    type Item = {id: number, o: number};
    // Never equal: with the default comparer's exact-match pass, the stored object would be found.
    const adapter = new SortedCollectionAdapter<Item>({orderComparer: (a, b) => a.o - b.o, equalityComparer: () => false, maxItemsPerLevel: 4});
    const collection = produce(adapter.create(), draft => { for (let i = 0; i < 10; i++) adapter.insert(draft, {id: i, o: i}); });
    const items = Array.from(adapter.getIterable(collection));

    const next = produce(collection, draft => {
      adapter.remove(draft, items[3]);
      expect(adapter.update(draft, adapter.getFirst(draft)!, item => { item.o = 99; })).toBeUndefined();
    });
    adapter.remove(collection, items[4]);

    expect(next).toBe(collection);
    expect(adapter.getSize(collection)).toBe(10);
  });

  describe('default equality inside a producer', () => {
    // A search reads items from the state under an untouched draft, and
    // through the draft afterwards, so the default comparer must treat an
    // item and a draft of it as the same item.
    type Item = {id: number, o: number};
    const adapter = new SortedCollectionAdapter<Item>({orderComparer: (a, b) => a.o - b.o, maxItemsPerLevel: 4});
    const filled = () => produce(adapter.create(), draft => { for (let i = 0; i < 40; i++) adapter.insert(draft, {id: i, o: i}); });

    it('finds an item given the object stored in the state, before and after other calls', () => {
      const collection = filled();
      const items = Array.from(adapter.getIterable(collection));
      const next = produce(collection, draft => {
        adapter.remove(draft, items[5]);
        adapter.remove(draft, items[6]);
        expect(adapter.update(draft, items[7], item => { item.o = 100; })!.id).toBe(7);
        adapter.remove(draft, {id: 8, o: 8}); // an equal-looking object is not the stored item
      });
      expect(Array.from(adapter.getIterable(next)).map(item => item.id))
        .toEqual([...items.map(item => item.id).filter(id => id !== 5 && id !== 6 && id !== 7), 7]);
      expect(adapter.getSize(collection)).toBe(40);
    });

    it('finds an item given the draft it was handed out as', () => {
      const collection = filled();
      const next = produce(collection, draft => {
        const first = adapter.getFirst(draft)!;
        adapter.update(draft, first, item => { item.o = 50; });
        adapter.remove(draft, adapter.getLast(draft)!);
        for (const item of adapter.getIterable(draft)) {
          if (item.id === 3) { adapter.remove(draft, item); break; }
        }
      });
      expect(Array.from(adapter.getIterable(next)).map(item => item.id))
        .toEqual(Array.from({length: 39}, (_, i) => i + 1).filter(id => id !== 3));
    });

    it('finds an item given the object stored in the state after the tree has grown a new root', () => {
      const small = produce(adapter.create(), draft => { for (let i = 0; i < 3; i++) adapter.insert(draft, {id: i, o: i}); });
      const items = Array.from(adapter.getIterable(small));
      const next = produce(small, draft => {
        // The new root is a plain object holding drafts of the old items.
        for (let i = 3; i < 12; i++) adapter.insert(draft, {id: i, o: i});
        adapter.remove(draft, items[1]);
      });
      expect(Array.from(adapter.getIterable(next)).map(item => item.id)).toEqual([0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    });

    it('finds an item given the object stored in the state from a nested producer, after the outer one gave the tree a new root', () => {
      const small = produce(adapter.create(), draft => { for (let i = 0; i < 3; i++) adapter.insert(draft, {id: i, o: i}); });
      const items = Array.from(adapter.getIterable(small));
      const next = produce({collection: small}, outer => {
        // The fourth item splits the root: the new one is a plain object holding the outer producer's drafts.
        adapter.insert(outer.collection, {id: 3, o: 3});
        outer.collection = produce(outer.collection, inner => { adapter.remove(inner, items[0]); });
      });
      expect(Array.from(adapter.getIterable(next.collection)).map(item => item.id)).toEqual([1, 2, 3]);
    });

    it('finds an item given the object stored in the state in a collection created inside the producer', () => {
      const state = produce({list: [{id: 0, o: 0}, {id: 1, o: 1}], collection: adapter.create()}, () => {});
      const next = produce(state, outer => {
        // A plain collection holding drafts of the listed items.
        const created = adapter.create();
        for (const item of outer.list) adapter.insert(created, item);
        adapter.remove(created, state.list[0]);
        outer.collection = produce(created, inner => { adapter.remove(inner, state.list[1]); });
      });
      expect(Array.from(adapter.getIterable(next.collection))).toEqual([]);
      expect(adapter.getSize(next.collection)).toBe(0);
      expect(next.list).toBe(state.list);
    });

    it('removes the occurrence it was given when the same object is stored twice', () => {
      const shared = {id: 7, o: 7};
      const collection = produce(adapter.create(), draft => {
        adapter.insert(draft, shared);
        adapter.insert(draft, shared);
        adapter.insert(draft, {id: 1, o: 1});
      });
      const next = produce(collection, draft => {
        // Each occurrence has its own draft; both are drafts of the same object.
        const [, first, second] = Array.from(adapter.getIterable(draft)) as Array<Item & {tag?: string}>;
        first.tag = 'kept';
        adapter.remove(draft, second);
      });
      expect(Array.from(adapter.getIterable(next))).toEqual([{id: 1, o: 1}, {id: 7, o: 7, tag: 'kept'}]);
    });

    it('finds an item given a draft of the same object reached another way', () => {
      const collection = filled();
      const state = produce({collection, selected: adapter.getFirst(collection)!}, () => {});
      const next = produce(state, draft => { adapter.remove(draft.collection, draft.selected); });
      expect(adapter.getSize(next.collection)).toBe(39);
      expect(adapter.getFirst(next.collection)!.id).toBe(1);
    });
  });

  it('stores nodes as objects, and keeps undefined items through a JSON round trip', () => {
    const adapter = new SortedCollectionAdapter<number|undefined>({
      orderComparer: (a, b) => (a === undefined ? 50 : a) - (b === undefined ? 50 : b), maxItemsPerLevel: 4,
    });
    const collection = adapter.create();
    for (let i = 0; i < 100; i++) adapter.insert(collection, i === 50 ? undefined : i);

    const restored: typeof collection = JSON.parse(JSON.stringify(collection));

    expect(Array.isArray(collection.root)).toBe(false);
    expect(Array.from(adapter.getIterable(restored))).toEqual(Array.from(adapter.getIterable(collection)));
    const next = produce(restored, draft => {
      adapter.remove(draft, undefined);
      adapter.insert(draft, 49.5);
      adapter.remove(draft, 0);
    });
    expect(Array.from(adapter.getIterable(next))).toEqual([...Array.from({length: 49}, (_, i) => i + 1), 49.5, ...Array.from({length: 49}, (_, i) => i + 51)]);
  });

  it('keeps NUL characters out of its stored state', () => {
    const adapter = new SortedCollectionAdapter<number>({orderComparer, maxItemsPerLevel: 4});
    const collection = adapter.create();
    for (let i = 0; i < 100; i++) adapter.insert(collection, (i * 37) % 101);
    // JSON writes a NUL character as the escape \u0000.
    expect(JSON.stringify(collection)).not.toContain('\\u0000');
  });
});
