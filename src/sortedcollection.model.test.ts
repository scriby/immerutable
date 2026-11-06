import produce from './test-support/immer';
import {SortedCollectionAdapter} from './sortedcollection';

interface Item {
  id: number;
  order: number;
}

// Fixed seeds make failures reproducible. The array oracle owns separate objects
// so a mutation of a collection item cannot silently update the expected result.
describe.each([false, true])('Sorted collection array-model checks (Immer: %s)', useImmer => {
  it.each([4, 16, 64])('matches the model through splits, updates, duplicates and deletion (fanout %s)', maxItemsPerLevel => {
    let seed = 0x5eed;
    const random = (limit: number) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed % limit;
    };
    const adapter = new SortedCollectionAdapter<Item>({
      orderComparer: (a, b) => a.order - b.order,
      equalityComparer: (a, b) => a.id === b.id,
      maxItemsPerLevel,
    });
    let collection = adapter.create();
    const expected: Item[] = [];
    let nextId = 0;

    const apply = (recipe: (draft: typeof collection) => void) => {
      if (useImmer) collection = produce(collection, recipe);
      else recipe(collection);
    };

    const verify = (step: number) => {
      const actual = Array.from(adapter.getIterable(collection));
      const context = {step, seed, maxItemsPerLevel, useImmer};
      expect({context, items: [...actual].sort((a, b) => a.id - b.id)})
        .toEqual({context, items: [...expected].sort((a, b) => a.id - b.id)});
      expect(actual.map(item => item.order))
        .toEqual(expected.map(item => item.order).sort((a, b) => a - b));
      expect(Array.from(adapter.getIterable(collection, 'backward'))).toEqual([...actual].reverse());
      expect(adapter.getSize(collection)).toBe(expected.length);
      expect(adapter.getFirst(collection)).toEqual(actual[0]);
      expect(adapter.getLast(collection)).toEqual(actual[actual.length - 1]);
    };

    for (let step = 0; step < 2000; step++) {
      const operation = random(10);
      if (operation < 5 || expected.length === 0) {
        const item = {id: nextId++, order: random(30)};
        expected.push(item);
        apply(draft => adapter.insert(draft, {...item}));
      } else if (operation < 8) {
        const index = random(expected.length);
        const item = expected.splice(index, 1)[0];
        apply(draft => adapter.remove(draft, item));
      } else {
        const item = expected[random(expected.length)];
        const order = random(30);
        apply(draft => {
          adapter.update(draft, item, stored => { stored.order = order; });
        });
        item.order = order;
      }
      verify(step);
    }

    // Drain the tree in a reproducible shuffled order to exercise root collapse.
    while (expected.length > 0) {
      const item = expected.splice(random(expected.length), 1)[0];
      apply(draft => adapter.remove(draft, item));
      verify(2000 + expected.length);
    }
    apply(draft => adapter.insert(draft, {id: nextId, order: 0}));
    expected.push({id: nextId, order: 0});
    verify(3000);
  });
});
