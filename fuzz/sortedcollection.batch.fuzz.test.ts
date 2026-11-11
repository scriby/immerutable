import {produce} from 'immer';
import {SortedCollectionAdapter} from '../src/sortedcollection';

interface Item {
  id: number;
  order: number;
  tag: number;
}

// Several adapter calls per producer, mixing changes with reads that hand out
// drafts: the case where a search must not read state that an earlier call in
// the same producer has made stale.
describe.each([4, 6, 10])('sorted collection, several calls per producer (fanout %s)', maxItemsPerLevel => {
  it.each([1, 2, 3, 4])('matches an array model (seed %s)', seedStart => {
    let seed = seedStart * 0x9e3779b1;
    const random = (limit: number) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return (seed >>> 8) % limit;
    };
    const identity = seedStart % 2 === 0;
    const adapter = new SortedCollectionAdapter<Item>({
      orderComparer: (a, b) => a.order - b.order,
      // Even seeds use the default comparer (the same object, or a draft of it).
      equalityComparer: identity ? undefined : (a, b) => a.id === b.id,
      maxItemsPerLevel,
    });
    let collection = adapter.create();
    let model: Item[] = [];
    let nextId = 0;

    const stored = () => Array.from(adapter.getIterable(collection));
    // What to pass to find an item: with the default comparer, the stored object itself.
    const handle = (item: Item, current: Item[]): Item => identity ? current.find(other => other.id === item.id)! : {id: item.id, order: item.order, tag: -1};

    for (let step = 0; step < 1500; step++) {
      const before = stored();
      const next = model.map(item => ({...item}));
      collection = produce(collection, draft => {
        const calls = 1 + random(8);
        // Items found by object identity must come from the state the producer started with,
        // or be the draft handed out for them; items inserted in this producer are found by their own object.
        // An item whose order changed in this producer is found by that draft, which has its current order.
        const added = new Map<number, Item>();
        const find = (item: Item): Item => added.get(item.id) || handle(item, before);
        for (let call = 0; call < calls; call++) {
          const operation = random(20);
          if (operation < 6 || next.length === 0) {
            const item = {id: nextId++, order: random(40), tag: 0};
            next.push({...item});
            added.set(item.id, item);
            adapter.insert(draft, item);
          } else if (operation < 9) {
            const item = next.splice(random(next.length), 1)[0];
            adapter.remove(draft, find(item));
          } else if (operation < 10) {
            adapter.remove(draft, {id: -1, order: random(40), tag: 0});
          } else if (operation < 13) {
            const item = next[random(next.length)];
            const order = random(40);
            const result = adapter.update(draft, find(item), found => { found.order = order; added.set(item.id, found); });
            expect(result!.id).toBe(item.id);
            item.order = order;
          } else if (operation < 14) {
            const item = next[random(next.length)];
            const replacement = {id: item.id, order: random(40), tag: item.tag + 100};
            adapter.update(draft, find(item), () => replacement);
            added.set(item.id, replacement);
            item.order = replacement.order;
            item.tag = replacement.tag;
          } else if (operation < 15) {
            const item = next[random(next.length)];
            adapter.update(draft, find(item), () => undefined);
          } else if (operation < 16) {
            const item = next[random(next.length)];
            adapter.update(draft, find(item), found => { found.tag++; added.set(item.id, found); });
            item.tag++;
          } else if (operation < 17) {
            const first = adapter.getFirst(draft)!;
            const last = adapter.getLast(draft)!;
            first.tag += 1000;
            added.set(first.id, first);
            added.set(last.id, last);
            next.find(item => item.id === first.id)!.tag += 1000;
            // Move the last item to the front through the draft it was handed out as.
            const lowest = first.order - 1 - random(3);
            adapter.update(draft, last, found => { found.order = lowest; });
            next.find(item => item.id === last.id)!.order = lowest;
          } else if (operation < 18) {
            let count = random(6);
            for (const item of adapter.getIterable(draft, random(2) ? 'forward' : 'backward')) {
              if (count-- <= 0) break;
              item.tag += 7;
              added.set(item.id, item);
              next.find(other => other.id === item.id)!.tag += 7;
            }
          } else if (operation < 19) {
            const item = next[random(next.length)];
            const info = adapter.lookupValuePath(draft, find(item))!;
            const order = random(40);
            info.valueNode.value.order = order;
            added.set(item.id, info.valueNode.value);
            adapter.ensureSortedOrderOfNode(draft, info);
            item.order = order;
          } else {
            const first = adapter.getFirst(draft)!;
            adapter.remove(draft, first);
            next.splice(next.findIndex(item => item.id === first.id), 1);
          }
        }
        expect(adapter.getSize(draft)).toBe(next.length);
      });
      model = next;

      const actual = stored();
      const byOrder = (a: Item, b: Item) => a.order - b.order || a.id - b.id;
      const context = {step, seedStart, maxItemsPerLevel};
      expect({context, orders: actual.map(item => item.order)}).toEqual({context, orders: [...model].sort(byOrder).map(item => item.order)});
      expect({context, items: [...actual].sort(byOrder)}).toEqual({context, items: [...model].sort(byOrder)});
      expect(adapter.getSize(collection)).toBe(model.length);
    }
  });
});
