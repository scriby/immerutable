import produce from './test-support/immer';
import {SortedMapAdapter} from './sortedmap';

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
