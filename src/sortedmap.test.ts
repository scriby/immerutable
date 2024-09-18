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
});