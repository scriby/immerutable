import {immerable} from 'immer';
import produce from './test-support/immer';
import {SortedMapAdapter, snapshotOrder} from './sortedmap';

interface TestObject {
  data: string;
  order: number;
}

const getOrderingKey = (obj: TestObject) => obj.order;
const range = (start: number, end: number) => new Array(end - start + 1).join().split(',').map((empty, i) => i + start);
const toTestArr = (i: number) => [ `data ${i}`, { data: i.toString(), order: i }];

describe('Sorted map', () => {
  it('adds 20 items in order', () => {
    const adapter = new SortedMapAdapter<string, TestObject>({ getOrderingKey });
    const sortedMap = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.set(sortedMap, `data ${i}`, { data: i.toString(), order: i });
    }

    expect(adapter.getSize(sortedMap)).toEqual(20);
    expect(Array.from(adapter.getIterable(sortedMap))).toEqual(range(1, 20).map(toTestArr));
  });

  it('adds 20 items in reverse order', () => {
    const adapter = new SortedMapAdapter<string, TestObject>({ getOrderingKey });
    const sortedMap = adapter.create();

    for (let i = 20; i > 0; i--) {
      adapter.set(sortedMap, `data ${i}`, { data: i.toString(), order: i });
    }

    expect(adapter.getSize(sortedMap)).toEqual(20);
    expect(Array.from(adapter.getIterable(sortedMap))).toEqual(range(1, 20).map(toTestArr));
  });

  it('gets a value iterable', () => {
    const adapter = new SortedMapAdapter<string, TestObject>({ getOrderingKey });
    const sortedMap = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.set(sortedMap, `data ${i}`, { data: i.toString(), order: i });
    }

    expect(adapter.getSize(sortedMap)).toEqual(20);
    expect(Array.from(adapter.getValuesIterable(sortedMap))).toEqual(range(1, 20).map((n) => toTestArr(n)[1]));
  });

  it('gets items', () => {
    const adapter = new SortedMapAdapter<string, TestObject>({ getOrderingKey });
    const sortedMap = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.set(sortedMap, `data ${i}`, { data: i.toString(), order: i });
    }

    for (let i = 1; i <= 20; i++) {
      expect(adapter.get(sortedMap, `data ${i}`)).toEqual({ data: i.toString(), order: i });
    }
  });

  it('returns undefined when getting a non-existent item', () => {
    const adapter = new SortedMapAdapter<string, TestObject>({ getOrderingKey });
    const sortedMap = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.set(sortedMap, `data ${i}`, { data: i.toString(), order: i });
    }

    expect(adapter.get(sortedMap, 'does not exist')).toBeUndefined();
  });

  it('reorders when updating item 10 to the end', () => {
    const adapter = new SortedMapAdapter<string, TestObject>({ getOrderingKey });
    const sortedMap = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.set(sortedMap, `data ${i}`, { data: i.toString(), order: i });
    }

    adapter.update(sortedMap, 'data 10', item => { item.order = 25; });

    expect(adapter.getSize(sortedMap)).toEqual(20);
    expect(Array.from(adapter.getIterable(sortedMap))).toEqual(
      range(1, 9).concat(range(11, 20)).map(toTestArr).concat([['data 10', { data: '10', order: 25 }]])
    );
  });

  it('reorders when updating item 15 to the beginning', () => {
    const adapter = new SortedMapAdapter<string, TestObject>({ getOrderingKey });
    const sortedMap = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.set(sortedMap, `data ${i}`, { data: i.toString(), order: i });
    }

    adapter.update(sortedMap, 'data 15', (item) => { item.order = -1; });

    expect(adapter.getSize(sortedMap)).toEqual(20);
    expect(Array.from(adapter.getIterable(sortedMap))).toEqual(
      [['data 15', { data: '15', order: -1 }]].concat(range(1, 14).concat(range(16, 20)).map(toTestArr))
    );
  });

  it('reorders when updating item 1 to the middle', () => {
    const adapter = new SortedMapAdapter<string, TestObject>({ getOrderingKey });
    const sortedMap = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.set(sortedMap, `data ${i}`, { data: i.toString(), order: i });
    }

    adapter.update(sortedMap, 'data 1', (item) => { item.order = 10.5; });

    expect(adapter.getSize(sortedMap)).toEqual(20);
    expect(Array.from(adapter.getIterable(sortedMap))).toEqual(
      range(2, 10).map(toTestArr)
        .concat([['data 1', { data: '1', order: 10.5 }]], range(11, 20).map(toTestArr))
    );
  });

  it('reorders when using set to update an item', () => {
    const adapter = new SortedMapAdapter<string, TestObject>({ getOrderingKey });
    const sortedMap = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.set(sortedMap, `data ${i}`, { data: i.toString(), order: i });
    }

    adapter.set(sortedMap, 'data 10', { data: '10', order: 25});

    expect(adapter.getSize(sortedMap)).toEqual(20);
    expect(Array.from(adapter.getIterable(sortedMap))).toEqual(
      range(1, 9).concat(range(11, 20)).map(toTestArr).concat([['data 10', { data: '10', order: 25 }]])
    );
  });

  it('does nothing when updating a non-existent item', () => {
    const adapter = new SortedMapAdapter<string, TestObject>({ getOrderingKey });
    const sortedMap = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.set(sortedMap, `data ${i}`, { data: i.toString(), order: i });
    }

    adapter.update(sortedMap, 'does not exist', item => { item.data = 'test'; });
    expect(Array.from(adapter.getIterable(sortedMap))).toEqual(range(1, 20).map(toTestArr));
  });

  it('uses a custom ordering function', () => {
    const adapter = new SortedMapAdapter<string, TestObject>({
      getOrderingKey,
      orderComparer: (a, b) => b - a,
    });
    const sortedMap = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.set(sortedMap, `data ${i}`, { data: i.toString(), order: i });
    }

    expect(Array.from(adapter.getIterable(sortedMap))).toEqual(range(1, 20).reverse().map(toTestArr));
  });

  it('removes an item', () => {
    const adapter = new SortedMapAdapter<string, TestObject>({ getOrderingKey });
    const sortedMap = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.set(sortedMap, `data ${i}`, { data: i.toString(), order: i });
    }

    adapter.remove(sortedMap, 'data 20');

    expect(adapter.getSize(sortedMap)).toEqual(19);
    expect(Array.from(adapter.getIterable(sortedMap))).toEqual(range(1, 19).map(toTestArr));
  });

  it('gets the first item', () => {
    const adapter = new SortedMapAdapter<string, TestObject>({ getOrderingKey });
    const sortedMap = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.set(sortedMap, `data ${i}`, { data: i.toString(), order: i });
    }

    expect(adapter.getFirst(sortedMap)).toEqual({ data: '1', order: 1 });
  });

  it('gets the last item', () => {
    const adapter = new SortedMapAdapter<string, TestObject>({ getOrderingKey });
    const sortedMap = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.set(sortedMap, `data ${i}`, { data: i.toString(), order: i });
    }

    expect(adapter.getLast(sortedMap)).toEqual({ data: '20', order: 20 });
  });

  it('gets a backwards iterable', () => {
    const adapter = new SortedMapAdapter<string, TestObject>({ getOrderingKey });
    const sortedMap = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.set(sortedMap, `data ${i}`, { data: i.toString(), order: i });
    }

    expect(Array.from(adapter.getIterable(sortedMap, 'backward'))).toEqual(range(1, 20).reverse().map(toTestArr));
  });

  it('gets a backwards values iterable', () => {
    const adapter = new SortedMapAdapter<string, TestObject>({ getOrderingKey });
    const sortedMap = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.set(sortedMap, `data ${i}`, { data: i.toString(), order: i });
    }

    expect(Array.from(adapter.getValuesIterable(sortedMap, 'backward'))).toEqual(range(1, 20).reverse().map(x => toTestArr(x)[1]));
  });

  it('indicates when it has an item', () => {
    const adapter = new SortedMapAdapter<string, TestObject>({ getOrderingKey });
    const sortedMap = adapter.create();

    adapter.set(sortedMap, 'key', { data: 'data', order: 1 });

    expect(adapter.has(sortedMap, 'key')).toBe(true);
  });

  it('indicates when it does not have an item', () => {
    const adapter = new SortedMapAdapter<string, TestObject>({ getOrderingKey });
    const sortedMap = adapter.create();

    expect(adapter.has(sortedMap, 'key')).toBe(false);
  });

  it('iterables can be iterated multiple times', () => {
    const adapter = new SortedMapAdapter<string, TestObject>({ getOrderingKey });
    const sortedMap = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.set(sortedMap, `data ${i}`, { data: i.toString(), order: i });
    }

    const iterable = adapter.getIterable(sortedMap);
    const keysIterable = adapter.getKeysIterable(sortedMap);
    const valuesIterable = adapter.getValuesIterable(sortedMap);

    expect(Array.from(iterable)).toEqual(Array.from(iterable));
    expect(Array.from(keysIterable)).toEqual(Array.from(keysIterable));
    expect(Array.from(valuesIterable)).toEqual(Array.from(valuesIterable));

    expect(Array.from(iterable).length).toBeGreaterThan(0);
  });

  describe('asReadonlyMap', () => {
    const adapter = new SortedMapAdapter<string, TestObject>({ getOrderingKey });
    const sortedMap = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.set(sortedMap, `data ${i}`, { data: i.toString(), order: i });
    }

    const readonlyMap = adapter.asReadonlyMap(sortedMap);

    it('iterates', () => {
      expect(Array.from(readonlyMap)).toEqual(range(1, 20).map((n) => toTestArr(n)));
    });

    it('gets entries', () => {
      expect(Array.from(readonlyMap.entries())).toEqual(range(1, 20).map((n) => toTestArr(n)));
    });

    it('gets keys', () => {
      expect(Array.from(readonlyMap.keys())).toEqual(range(1, 20).map((n) => toTestArr(n)[0]));
    });

    it('gets values', () => {
      expect(Array.from(readonlyMap.values())).toEqual(range(1, 20).map((n) => toTestArr(n)[1]));
    });

    it('can be iterated multiple times', () => {
      expect(Array.from(readonlyMap)).toEqual(Array.from(readonlyMap));
      expect(Array.from(readonlyMap.entries())).toEqual(Array.from(readonlyMap.entries()));
      expect(Array.from(readonlyMap.keys())).toEqual(Array.from(readonlyMap.keys()));
      expect(Array.from(readonlyMap.values())).toEqual(Array.from(readonlyMap.values()));
    });

    it('foreaches', () => {
      const foreached: Array<{key: string, value: TestObject}> = [];

      readonlyMap.forEach((value, key) => {
        foreached.push({key, value});
      });

      expect(foreached).toEqual(range(1, 20).map((n) => {
        const item = toTestArr(n);
        return { key: item[0], value: item[1] };
      }));
    });

    it('gets a value', () => {
      expect(readonlyMap.get('data 10')).toEqual({ data: '10', order: 10 });
    });

    it('indicates when it has an item', () => {
      expect(readonlyMap.has('data 10')).toBe(true);
    });

    it('indicates when it does not have an item', () => {
      expect(readonlyMap.has('data 99')).toBe(false);
    });

    it('has the right size', () => {
      expect(readonlyMap.size).toBe(20);
    });
  });

  describe('keysAsReadonlySet', () => {
    const adapter = new SortedMapAdapter<string, TestObject>({ getOrderingKey });
    const sortedMap = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.set(sortedMap, `data ${i}`, { data: i.toString(), order: i });
    }

    const readonlySet = adapter.keysAsReadonlySet(sortedMap);

    it('iterates', () => {
      expect(Array.from(readonlySet)).toEqual(range(1, 20).map((n) => toTestArr(n)[0]));
    });

    it('gets entries', () => {
      expect(Array.from(readonlySet.entries())).toEqual(range(1, 20).map((n) => {
        const item = toTestArr(n);
        return [item[0], item[0]];
      }));
    });

    it('gets keys', () => {
      expect(Array.from(readonlySet.keys())).toEqual(range(1, 20).map((n) => toTestArr(n)[0]));
    });

    it('gets values', () => {
      expect(Array.from(readonlySet.values())).toEqual(range(1, 20).map((n) => toTestArr(n)[0]));
    });

    it('can be iterated multiple times', () => {
      expect(Array.from(readonlySet)).toEqual(Array.from(readonlySet));
      expect(Array.from(readonlySet.entries())).toEqual(Array.from(readonlySet.entries()));
      expect(Array.from(readonlySet.keys())).toEqual(Array.from(readonlySet.keys()));
      expect(Array.from(readonlySet.values())).toEqual(Array.from(readonlySet.values()));
    });

    it('foreaches', () => {
      const foreached: string[] = [];

      readonlySet.forEach((key) => {
        foreached.push(key);
      });

      expect(foreached).toEqual(range(1, 20).map((n) => toTestArr(n)[0]));
    });

    it('indicates when it has an item', () => {
      expect(readonlySet.has('data 10')).toBe(true);
    });

    it('indicates when it does not have an item', () => {
      expect(readonlySet.has('data 99')).toBe(false);
    });

    it('has the right size', () => {
      expect(readonlySet.size).toBe(20);
    });
  });

  describe('falsy values and ordering keys', () => {
    type Value = number | boolean | string | null | undefined;

    it.each([0, false, '', null, undefined])('updates an existing falsy value: %s', value => {
      const adapter = new SortedMapAdapter<string, Value>({getOrderingKey: () => 0});
      const map = adapter.create();
      adapter.set(map, 'key', value);
      const updater = jest.fn(() => 'replacement');

      adapter.update(map, 'key', updater);

      expect(updater).toHaveBeenCalledWith(value);
      expect(adapter.get(map, 'key')).toBe('replacement');
    });

    it.each([0, false, '', null, undefined])('overwrites an existing falsy value with set: %s', value => {
      const adapter = new SortedMapAdapter<string, Value>({getOrderingKey: () => 0});
      const map = adapter.create();
      adapter.set(map, 'key', value);

      adapter.set(map, 'key', 'replacement');

      expect(adapter.get(map, 'key')).toBe('replacement');
      expect(adapter.getSize(map)).toBe(1);
    });

    it('updates the sorted index when a replacement value is zero', () => {
      const adapter = new SortedMapAdapter<string, number>({getOrderingKey: value => value});
      const map = adapter.create();
      adapter.set(map, 'a', 1);
      adapter.set(map, 'b', 2);

      const result = adapter.update(map, 'b', () => 0);

      expect(Array.from(adapter.getIterable(map))).toEqual([['b', 0], ['a', 1]]);
      expect(result).toBe(0);
      adapter.remove(map, 'b');
      expect(adapter.getSize(map)).toBe(1);
      expect(Array.from(adapter.getIterable(map))).toEqual([['a', 1]]);
    });

    it('allows set to replace an existing value with undefined', () => {
      const adapter = new SortedMapAdapter<string, number | undefined>({getOrderingKey: () => 0});
      const map = adapter.create();
      adapter.set(map, 'key', 1);

      adapter.set(map, 'key', undefined);

      expect(adapter.has(map, 'key')).toBe(true);
      expect(adapter.get(map, 'key')).toBeUndefined();
      expect(Array.from(adapter.getIterable(map))).toEqual([['key', undefined]]);
    });

    it('removes an entry whose stored value is undefined', () => {
      const adapter = new SortedMapAdapter<string, number | undefined>({getOrderingKey: () => 0});
      const map = adapter.create();
      adapter.set(map, 'key', undefined);

      adapter.remove(map, 'key');

      expect(adapter.has(map, 'key')).toBe(false);
      expect(adapter.getSize(map)).toBe(0);
      expect(Array.from(adapter.getIterable(map))).toEqual([]);
    });

    it('reorders when an object-valued ordering key is mutated inside update', () => {
      type Order = {rank: number};
      const adapter = new SortedMapAdapter<string, {order: Order}, Order>({
        getOrderingKey: value => value.order,
        orderComparer: (a, b) => a.rank - b.rank,
      });
      const map = adapter.create();
      adapter.set(map, 'a', {order: {rank: 1}});
      adapter.set(map, 'b', {order: {rank: 2}});

      adapter.update(map, 'a', value => { value.order.rank = 3; });

      expect(Array.from(adapter.getKeysIterable(map))).toEqual(['b', 'a']);
      expect(adapter.getFirst(map)).toEqual({order: {rank: 2}});
    });

    // Finding 17: depends on finding 16 plus `===` key equality in the sorted index.
    it('keeps one index entry for a NaN key and can remove it', () => {
      const adapter = new SortedMapAdapter<number, number>({getOrderingKey: value => value});
      const map = adapter.create();
      adapter.set(map, NaN, 1);
      adapter.set(map, NaN, 2);

      expect(adapter.getSize(map)).toBe(1);
      expect(Array.from(adapter.getIterable(map))).toEqual([[NaN, 2]]);

      adapter.remove(map, NaN);

      expect(adapter.has(map, NaN)).toBe(false);
      expect(adapter.getSize(map)).toBe(0);
      expect(Array.from(adapter.getIterable(map))).toEqual([]);
    });
  });

  describe('readonly views after mutation or partial iteration', () => {
    function setup() {
      const adapter = new SortedMapAdapter<number, number>({getOrderingKey: value => value});
      const map = adapter.create();
      return {add: (key: number) => adapter.set(map, key, key),
        map: adapter.asReadonlyMap(map), set: adapter.keysAsReadonlySet(map)};
    }

    it.each(['map', 'set'] as const)('reports the current size of the %s view after mutation', view => {
      const fixture = setup();
      fixture.add(1);

      expect(fixture[view].has(1)).toBe(true);
      expect(Array.from(fixture[view].values())).toEqual([1]);
      expect(fixture[view].size).toBe(1);
    });

    it.each(['map', 'set'] as const)('resumes a partially consumed %s iterator instead of restarting it', view => {
      const fixture = setup();
      fixture.add(1);
      fixture.add(2);
      const expected = Array.from(fixture[view].values());
      const iterator = fixture[view].values();
      expect(iterator.next().value).toBe(expected[0]);

      expect(Array.from(iterator)).toEqual(expected.slice(1));
      expect(iterator[Symbol.iterator]()).toBe(iterator);
      expect(iterator.next().done).toBe(true);
    });
  });

  describe('updates that may skip locating the sorted index entry', () => {
    const build = () => {
      const adapter = new SortedMapAdapter<string, TestObject>({getOrderingKey});
      const sortedMap = adapter.create();
      for (let i = 1; i <= 100; i++) adapter.set(sortedMap, `data ${i}`, {data: i.toString(), order: i});
      return {adapter, sortedMap};
    };
    const orders = (adapter: SortedMapAdapter<string, TestObject>, sortedMap: any) =>
      Array.from(adapter.getValuesIterable(sortedMap)).map(value => value.order);

    it('still detects a stale index when set receives an object whose order was mutated in place', () => {
      const {adapter, sortedMap} = build();
      const value = adapter.get(sortedMap, 'data 10')!;
      value.order = 1000; // Changed outside update(), so the index still holds order 10.

      expect(() => adapter.set(sortedMap, 'data 10', value)).toThrow('not found in sorted collection');
    });

    it('keeps the index usable after replacing values without changing their order', () => {
      const {adapter, sortedMap} = build();
      adapter.set(sortedMap, 'data 50', {data: 'replaced', order: 50});
      adapter.update(sortedMap, 'data 60', () => ({data: 'returned', order: 60}));
      adapter.update(sortedMap, 'data 70', value => { value.data = 'mutated'; });

      expect(orders(adapter, sortedMap)).toEqual(range(1, 100));
      // Each entry must still be locatable from its current order.
      adapter.update(sortedMap, 'data 50', value => { value.order = 0; });
      adapter.set(sortedMap, 'data 60', {data: 'moved', order: 1001});
      adapter.remove(sortedMap, 'data 70');
      expect(orders(adapter, sortedMap)).toEqual([0].concat(range(1, 49), range(51, 59), range(61, 69), range(71, 100), [1001]));
    });

    it('reorders inside a produce when only the order changes', () => {
      const {adapter, sortedMap} = build();
      const result = produce(sortedMap, draft => {
        adapter.update(draft, 'data 1', value => { value.data = 'same order'; });
        adapter.update(draft, 'data 2', value => { value.order = 500; });
      });

      expect(orders(adapter, result)).toEqual([1].concat(range(3, 100), [500]));
      expect(adapter.get(result, 'data 1')!.data).toBe('same order');
      expect(orders(adapter, sortedMap)).toEqual(range(1, 100));
    });
  });

  describe('iterables', () => {
    it('reflect the current state each time they are iterated', () => {
      const adapter = new SortedMapAdapter<number, number>({getOrderingKey: value => value});
      const map = adapter.create();
      adapter.set(map, 1, 1);
      adapter.set(map, 2, 2);
      const entries = adapter.getIterable(map);
      const values = adapter.getValuesIterable(map, 'backward');
      const keys = adapter.getKeysIterable(map);
      adapter.remove(map, 1);
      adapter.set(map, 3, 3);
      expect(Array.from(entries)).toEqual([[2, 2], [3, 3]]);
      expect(Array.from(values)).toEqual([3, 2]);
      expect(Array.from(keys)).toEqual([2, 3]);
    });
  });

  describe('structured ordering keys', () => {
    it('keeps named properties of array ordering keys', () => {
      type Item = {order: number[] & {rank: number}};
      const adapter = new SortedMapAdapter<string, Item, Item['order']>({getOrderingKey: item => item.order, orderComparer: (a, b) => a.rank - b.rank});
      const map = adapter.create();
      adapter.set(map, 'a', {order: Object.assign([], {rank: 2})});
      adapter.set(map, 'z', {order: Object.assign([], {rank: 1})});
      expect(Array.from(adapter.getKeysIterable(map))).toEqual(['z', 'a']);
    });

    it('follows class-instance ordering keys that an updater mutates in place', () => {
      class Priority { constructor(public n: number) {} }
      type Item = {p: Priority};
      const adapter = new SortedMapAdapter<number, Item, Priority>({getOrderingKey: item => item.p, orderComparer: (a, b) => a.n - b.n});
      for (const useImmer of [false, true]) {
        let map = adapter.create();
        for (let i = 0; i < 5; i++) adapter.set(map, i, {p: new Priority(i)});
        const step = (recipe: (draft: typeof map) => void) => { if (useImmer) map = produce(map, recipe); else recipe(map); };
        step(draft => { adapter.update(draft, 0, item => { item.p.n = 10; }); });
        expect(Array.from(adapter.getKeysIterable(map))).toEqual([1, 2, 3, 4, 0]);
        step(draft => { adapter.remove(draft, 0); });
        expect(Array.from(adapter.getKeysIterable(map))).toEqual([1, 2, 3, 4]);
      }
    });

    describe('class-instance ordering keys in a multi-level index', () => {
      class Priority { constructor(public n: number) {} }
      type Item = {p: Priority};
      const adapter = new SortedMapAdapter<number, Item, Priority>({getOrderingKey: item => item.p, orderComparer: (a, b) => a.n - b.n});
      const scenarios = (name: string, body: (step: (recipe: (draft: any) => void) => void, get: () => any) => void) => {
        it.each([false, true])(name + ' (Immer: %s)', useImmer => {
          let map = adapter.create();
          for (let i = 0; i < 70; i++) adapter.set(map, i, {p: new Priority(i)});
          const step = (recipe: (draft: typeof map) => void) => { if (useImmer) map = produce(map, recipe); else recipe(map); };
          body(step, () => map);
        });
      };

      scenarios('stays searchable after an updater mutates a key that is also a separator', (step, get) => {
        step(draft => { adapter.update(draft, 32, item => { item.p.n = 100; }); });
        step(draft => { adapter.remove(draft, 33); });
        const keys = Array.from(adapter.getKeysIterable(get()));
        expect(keys.length).toBe(69);
        expect(keys[keys.length - 1]).toBe(32);
      });

      scenarios('stays searchable after the key of a removed value is mutated', (step, get) => {
        const removed = adapter.get(get(), 32)!;
        step(draft => { adapter.remove(draft, 32); });
        removed.p.n = 100;
        step(draft => { adapter.remove(draft, 33); });
        expect(adapter.getSize(get())).toBe(68);
      });

      scenarios('stays searchable after the key of a replaced value is mutated', (step, get) => {
        const replaced = adapter.get(get(), 5)!;
        step(draft => { adapter.set(draft, 5, {p: new Priority(5)}); });
        replaced.p.n = 100;
        step(draft => { adapter.remove(draft, 5); adapter.remove(draft, 6); });
        expect(adapter.getSize(get())).toBe(68);
      });
    });

    it('does not rebuild the index when an updater changes a different sorted map', () => {
      type Inner = ReturnType<SortedMapAdapter<number, number, number>['create']>;
      const inner = new SortedMapAdapter<number, number, number>({getOrderingKey: value => value});
      let orderingKeyCalls = 0;
      const outer = new SortedMapAdapter<number, {rank: number, items: Inner}, number>({
        getOrderingKey: value => { orderingKeyCalls++; return value.rank; },
      });
      for (const useImmer of [false, true]) {
        let map = outer.create();
        for (let i = 0; i < 100; i++) outer.set(map, i, {rank: i, items: inner.create()});
        orderingKeyCalls = 0;
        const recipe = (draft: typeof map) => { outer.update(draft, 5, value => { inner.set(value.items, 1, 1); }); };
        if (useImmer) map = produce(map, recipe); else recipe(map);
        expect(orderingKeyCalls).toBeLessThan(5);
        expect(Array.from(inner.getKeysIterable(outer.get(map, 5)!.items))).toEqual([1]);
      }
    });

    it('keeps the index in step when an updater sets or removes its own entry', () => {
      const adapter = new SortedMapAdapter<number, {o: number}, number>({getOrderingKey: item => item.o});
      for (const useImmer of [false, true]) {
        let map = adapter.create();
        const step = (recipe: (draft: typeof map) => void) => { if (useImmer) map = produce(map, recipe); else recipe(map); };
        step(draft => { for (let i = 0; i < 10; i++) adapter.set(draft, i, {o: i}); });
        step(draft => { adapter.update(draft, 3, () => { adapter.set(draft, 3, {o: 100}); return {o: 3}; }); });
        expect(Array.from(adapter.getKeysIterable(map))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        step(draft => { adapter.set(draft, 3, {o: 50}); });
        step(draft => { adapter.update(draft, 4, () => { adapter.remove(draft, 4); return {o: 50}; }); });
        expect(Array.from(adapter.getKeysIterable(map))).toEqual([0, 1, 2, 5, 6, 7, 8, 9, 3]);
        expect(adapter.getSize(map)).toBe(9);
      }
    });

    it('keeps the index in step when an updater calls the adapter on a class-keyed map', () => {
      class Priority { constructor(public n: number) {} }
      type Item = {p: Priority};
      const adapter = new SortedMapAdapter<number, Item, Priority>({getOrderingKey: item => item.p, orderComparer: (a, b) => a.n - b.n});
      for (const useImmer of [false, true]) {
        let map = adapter.create();
        const step = (recipe: (draft: typeof map) => void) => { if (useImmer) map = produce(map, recipe); else recipe(map); };
        step(draft => { adapter.set(draft, 1, {p: new Priority(10)}); });
        step(draft => { adapter.update(draft, 1, item => { adapter.set(draft, 2, {p: new Priority(1)}); item.p.n = 20; }); });
        expect(Array.from(adapter.getKeysIterable(map))).toEqual([2, 1]);
        step(draft => { adapter.update(draft, 1, () => { adapter.remove(draft, 1); }); });
        expect(Array.from(adapter.getKeysIterable(map))).toEqual([2]);
        expect(adapter.getSize(map)).toBe(1);
      }
    });

    it('keeps own __proto__ properties and null prototypes of plain-object ordering keys', () => {
      const adapter = new SortedMapAdapter<string, any, any>({getOrderingKey: value => value, orderComparer: (a, b) => a['__proto__'] - b['__proto__']});
      const map = adapter.create();
      adapter.set(map, 'a', JSON.parse('{"__proto__": 2}'));
      adapter.set(map, 'b', JSON.parse('{"__proto__": 1}'));
      expect(Array.from(adapter.getKeysIterable(map))).toEqual(['b', 'a']);

      const bare = Object.create(null);
      bare.n = 1;
      expect(Object.getPrototypeOf(snapshotOrder(bare))).toBe(null);
    });

    it('follows function ordering keys whose properties an updater mutates', () => {
      type Ranked = (() => void) & {rank: number};
      const ranked = (rank: number) => Object.assign(() => undefined, {rank}) as Ranked;
      const adapter = new SortedMapAdapter<string, {f: Ranked}, Ranked>({getOrderingKey: item => item.f, orderComparer: (a, b) => a.rank - b.rank});
      for (const useImmer of [false, true]) {
        let map = adapter.create();
        adapter.set(map, 'a', {f: ranked(1)});
        adapter.set(map, 'b', {f: ranked(2)});
        const recipe = (draft: typeof map) => { adapter.update(draft, 'a', item => { item.f.rank = 3; }); };
        if (useImmer) map = produce(map, recipe); else recipe(map);
        expect(Array.from(adapter.getKeysIterable(map))).toEqual(['b', 'a']);
      }
    });

    it('follows class instances nested in plain-object ordering keys that an updater mutates', () => {
      class Priority { constructor(public n: number) {} }
      type Item = {o: {p: Priority}};
      const adapter = new SortedMapAdapter<string, Item, {p: Priority}>({getOrderingKey: item => item.o, orderComparer: (a, b) => a.p.n - b.p.n});
      for (const useImmer of [false, true]) {
        let map = adapter.create();
        adapter.set(map, 'a', {o: {p: new Priority(1)}});
        adapter.set(map, 'b', {o: {p: new Priority(2)}});
        const recipe = (draft: typeof map) => { adapter.update(draft, 'a', item => { item.o.p.n = 3; }); };
        if (useImmer) map = produce(map, recipe); else recipe(map);
        expect(Array.from(adapter.getKeysIterable(map))).toEqual(['b', 'a']);
      }
    });

    it('stores no drafts from nested producers', () => {
      class Rank {
        [immerable] = true;
        constructor(public value: number) {}
      }
      const plain = new SortedMapAdapter<number, {order: number}>({getOrderingKey: item => item.order});
      const base = produce(plain.create(), draft => { for (let i = 0; i < 100; i++) plain.set(draft, i, {order: i}); });
      // Reading the whole inner draft drafts the index through the outer draft too.
      const next = produce({map: base}, outer => {
        outer.map = produce(outer.map, inner => { JSON.stringify(inner); plain.set(inner, 200, {order: 200}); });
      });
      expect(Array.from(plain.getKeysIterable(next.map))).toHaveLength(101);

      const ranked = new SortedMapAdapter<string, {rank: Rank}, Rank>({getOrderingKey: item => item.rank, orderComparer: (a, b) => a.value - b.value});
      const state = produce(ranked.create(), draft => { ranked.set(draft, 'a', {rank: new Rank(1)}); ranked.set(draft, 'b', {rank: new Rank(2)}); });
      const moved = produce({map: state}, outer => {
        outer.map = produce(outer.map, inner => { const item = ranked.get(inner, 'a')!; ranked.remove(inner, 'a'); ranked.set(inner, 'c', item); });
      });
      const after = produce(moved.map, draft => { ranked.set(draft, 'd', {rank: new Rank(1.5)}); });
      expect(Array.from(ranked.getKeysIterable(after))).toEqual(['c', 'd', 'b']);
    });

    it('keeps symbol-keyed properties of plain-object ordering keys', () => {
      const rank = Symbol('rank');
      type Item = {order: {[rank]: number}};
      const adapter = new SortedMapAdapter<string, Item, {[rank]: number}>({
        getOrderingKey: item => item.order,
        orderComparer: (a, b) => a[rank] - b[rank],
      });
      const map = produce(adapter.create(), draft => {
        adapter.set(draft, 'a', {order: {[rank]: 2}});
        adapter.set(draft, 'z', {order: {[rank]: 1}});
      });
      expect(Array.from(adapter.getKeysIterable(map))).toEqual(['z', 'a']);
    });

    it('does not keep drafts of draftable class ordering keys after the producer ends', () => {
      class Rank {
        [immerable] = true;
        constructor(public value: number) {}
      }
      type Item = {rank: Rank};
      const adapter = new SortedMapAdapter<string, Item, Rank>({
        getOrderingKey: item => item.rank,
        orderComparer: (a, b) => a.value - b.value,
      });
      let map = produce(adapter.create(), draft => {
        adapter.set(draft, 'a', {rank: new Rank(1)});
        adapter.set(draft, 'b', {rank: new Rank(2)});
      });
      map = produce(map, draft => {
        // Moving a value to another key stores its (drafted) ordering key anew.
        const item = adapter.get(draft, 'a')!;
        adapter.remove(draft, 'a');
        adapter.set(draft, 'c', item);
      });
      map = produce(map, draft => {
        adapter.set(draft, 'd', {rank: new Rank(1.5)});
        adapter.remove(draft, 'c');
      });
      expect(Array.from(adapter.getKeysIterable(map))).toEqual(['d', 'b']);
    });
  });

  describe('JSON round trips', () => {
    it('keeps entries with undefined ordering keys usable, and treats null like undefined', () => {
      type Item = {p?: number|null};
      const seen: any[] = [];
      const adapter = new SortedMapAdapter<number, Item>({
        getOrderingKey: item => item.p,
        orderComparer: (a: any, b: any) => {
          seen.push(a, b);
          const aLast = a === undefined, bLast = b === undefined;
          return aLast || bLast ? (aLast === bLast ? 0 : aLast ? 1 : -1) : a - b;
        },
      });
      let map = adapter.create();
      adapter.set(map, 1, {p: undefined});
      adapter.set(map, 2, {p: 2});
      adapter.set(map, 3, {p: null});
      adapter.set(map, 4, {p: 1});
      map = JSON.parse(JSON.stringify(map));

      expect(Array.from(adapter.getKeysIterable(map))).toEqual([4, 2, 1, 3]);
      adapter.update(map, 1, item => { item.p = 3; });
      adapter.update(map, 3, item => { item.p = 0; });
      adapter.set(map, 5, {});
      adapter.remove(map, 2);
      expect(Array.from(adapter.getKeysIterable(map))).toEqual([3, 4, 1, 5]);
      expect(seen).not.toContain(null);
    });

    it('keeps a multi-level sorted map usable after serialization', () => {
      const adapter = new SortedMapAdapter<string | number, TestObject>({getOrderingKey, maxItemsPerLevel: 4});
      let sortedMap = adapter.create();
      for (let i = 0; i < 200; i++) adapter.set(sortedMap, i % 3 ? i : `key ${i}`, {data: String(i), order: (i * 37) % 101});
      const before = Array.from(adapter.getIterable(sortedMap));
      sortedMap = JSON.parse(JSON.stringify(sortedMap));

      expect(Array.from(adapter.getIterable(sortedMap))).toEqual(before);
      adapter.update(sortedMap, 1, value => { value.order = -1; });
      adapter.remove(sortedMap, 'key 3');
      adapter.set(sortedMap, 'new', {data: 'new', order: 1000});

      const orders = Array.from(adapter.getValuesIterable(sortedMap)).map(value => value.order);
      expect(orders).toEqual([...orders].sort((a, b) => a - b));
      expect(orders[0]).toBe(-1);
      expect(adapter.getLast(sortedMap)).toEqual({data: 'new', order: 1000});
      expect(adapter.getSize(sortedMap)).toBe(200);
    });
  });

  describe('removing and re-adding a key in one produce', () => {
    it('keeps the backing map and sorted index in agreement', () => {
      // 1 and 2^28 + 1 share the low 28 hash bits, so the backing map stores
      // them in one collision bucket.
      const adapter = new SortedMapAdapter<number, TestObject>({getOrderingKey});
      const original = produce(adapter.create(), draft => {
        adapter.set(draft, 1, {data: 'old', order: 1});
        adapter.set(draft, 1 + (1 << 28), {data: 'neighbor', order: 2});
      });

      const result = produce(original, draft => {
        adapter.remove(draft, 1);
        adapter.set(draft, 1, {data: 'new', order: 3});
      });

      expect(Array.from(adapter.getIterable(result))).toEqual([
        [1 + (1 << 28), {data: 'neighbor', order: 2}],
        [1, {data: 'new', order: 3}],
      ]);
    });
  });

  describe('undefined ordering keys with the default comparer', () => {
    // An optional ordering field yields undefined, which the default comparer
    // treats as equal to every value. That breaks the B-tree's ordering, and a
    // later lookup misses an entry. remove() then deletes only the map half.
    it('keeps the backing map and sorted index in agreement after removal', () => {
      const adapter = new SortedMapAdapter<string, {order?: number}>({getOrderingKey: value => value.order});
      const sortedMap = adapter.create();
      adapter.set(sortedMap, 'a', {order: 1});
      adapter.set(sortedMap, 'b', {order: 3});
      adapter.set(sortedMap, 'missing', {});
      adapter.set(sortedMap, 'c', {order: 2});

      adapter.remove(sortedMap, 'c');

      expect(adapter.has(sortedMap, 'c')).toBe(false);
      expect(adapter.getSize(sortedMap)).toBe(3);
      expect(Array.from(adapter.getKeysIterable(sortedMap))).not.toContain('c');
    });

    it('iterates the defined ordering keys in sorted order', () => {
      const adapter = new SortedMapAdapter<string, {order?: number}>({getOrderingKey: value => value.order});
      const sortedMap = adapter.create();
      adapter.set(sortedMap, 'a', {order: 1});
      adapter.set(sortedMap, 'b', {order: 3});
      adapter.set(sortedMap, 'missing', {});
      adapter.set(sortedMap, 'c', {order: 2});

      const defined = Array.from(adapter.getKeysIterable(sortedMap)).filter(key => key !== 'missing');
      expect(defined).toEqual(['a', 'c', 'b']);
    });

    it.each([undefined, NaN])('sorts the unordered key %s after every ordered key', unordered => {
      const adapter = new SortedMapAdapter<string, number | undefined>({getOrderingKey: value => value});
      const sortedMap = adapter.create();
      adapter.set(sortedMap, 'x', unordered);
      adapter.set(sortedMap, 'b', 2);
      adapter.set(sortedMap, 'a', 1);

      expect(Array.from(adapter.getKeysIterable(sortedMap))).toEqual(['a', 'b', 'x']);
      adapter.remove(sortedMap, 'x');
      expect(Array.from(adapter.getKeysIterable(sortedMap))).toEqual(['a', 'b']);
    });
  });

  describe('removal when the sorted index cannot find the entry', () => {
    it('throws without removing only the map half', () => {
      const adapter = new SortedMapAdapter<string, TestObject>({getOrderingKey});
      const sortedMap = adapter.create();
      const stale = {data: 'stale', order: 1};
      adapter.set(sortedMap, 'stale', stale);
      adapter.set(sortedMap, 'other', {data: 'other', order: 2});
      stale.order = 99; // Changed outside update(), so the index still holds order 1.

      expect(() => adapter.remove(sortedMap, 'stale')).toThrow('not found in sorted collection');
      expect(adapter.get(sortedMap, 'stale')).toBe(stale);
      expect(adapter.getSize(sortedMap)).toBe(2);
    });
  });
});
