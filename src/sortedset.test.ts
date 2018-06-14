import {SortedSetAdapter} from './sortedset';

interface TestObject {
  data: string;
  order: number;
}

const getOrderingKey = (obj: TestObject) => obj.order;
const range = (start: number, end: number) => new Array(end - start + 1).join().split(',').map((empty, i) => i + start);
const toTestObj = (i: number) => ({ key: `data ${i}`, value: { data: i.toString(), order: i }});

describe('Sorted set', () => {
  it('adds 20 items in order', () => {
    const adapter = new SortedSetAdapter<string, TestObject, number>({ getOrderingKey });
    const sortedSet = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.set(sortedSet, `data ${i}`, { data: i.toString(), order: i });
    }

    expect(adapter.getSize(sortedSet)).toEqual(20);
    expect(Array.from(adapter.getIterable(sortedSet))).toEqual(range(1, 20).map(toTestObj));
  });

  it('adds 20 items in reverse order', () => {
    const adapter = new SortedSetAdapter<string, TestObject, number>({ getOrderingKey });
    const sortedSet = adapter.create();

    for (let i = 20; i > 0; i--) {
      adapter.set(sortedSet, `data ${i}`, { data: i.toString(), order: i });
    }

    expect(adapter.getSize(sortedSet)).toEqual(20);
    expect(Array.from(adapter.getIterable(sortedSet))).toEqual(range(1, 20).map(toTestObj));
  });

  it('gets items', () => {
    const adapter = new SortedSetAdapter<string, TestObject, number>({ getOrderingKey });
    const sortedSet = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.set(sortedSet, `data ${i}`, { data: i.toString(), order: i });
    }

    for (let i = 1; i <= 20; i++) {
      expect(adapter.get(sortedSet, `data ${i}`)).toEqual({ data: i.toString(), order: i });
    }
  });

  it('returns undefined when getting a non-existent item', () => {
    const adapter = new SortedSetAdapter<string, TestObject, number>({ getOrderingKey });
    const sortedSet = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.set(sortedSet, `data ${i}`, { data: i.toString(), order: i });
    }

    expect(adapter.get(sortedSet, 'does not exist')).toBeUndefined();
  });

  it('reorders when updating item 10 to the end', () => {
    const adapter = new SortedSetAdapter<string, TestObject, number>({ getOrderingKey });
    const sortedSet = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.set(sortedSet, `data ${i}`, { data: i.toString(), order: i });
    }

    adapter.update(sortedSet, 'data 10', item => { item.order = 25; });

    expect(adapter.getSize(sortedSet)).toEqual(20);
    expect(Array.from(adapter.getIterable(sortedSet))).toEqual(
      range(1, 9).concat(range(11, 20)).map(toTestObj).concat({ key: 'data 10', value: { data: '10', order: 25 }})
    );
  });

  it('reorders when updating item 15 to the beginning', () => {
    const adapter = new SortedSetAdapter<string, TestObject, number>({ getOrderingKey });
    const sortedSet = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.set(sortedSet, `data ${i}`, { data: i.toString(), order: i });
    }

    adapter.update(sortedSet, 'data 15', (item) => { item.order = -1; });

    expect(adapter.getSize(sortedSet)).toEqual(20);
    expect(Array.from(adapter.getIterable(sortedSet))).toEqual(
      [{key: 'data 15', value: { data: '15', order: -1 }}].concat(range(1, 14).concat(range(16, 20)).map(toTestObj))
    );
  });

  it('reorders when updating item 1 to the middle', () => {
    const adapter = new SortedSetAdapter<string, TestObject, number>({ getOrderingKey });
    const sortedSet = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.set(sortedSet, `data ${i}`, { data: i.toString(), order: i });
    }

    adapter.update(sortedSet, 'data 1', (item) => { item.order = 10.5; });

    expect(adapter.getSize(sortedSet)).toEqual(20);
    expect(Array.from(adapter.getIterable(sortedSet))).toEqual(
      range(2, 10).map(toTestObj)
        .concat({key: 'data 1', value: { data: '1', order: 10.5 }}, range(11, 20).map(toTestObj))
    );
  });

  it('does nothing when updating a non-existent item', () => {
    const adapter = new SortedSetAdapter<string, TestObject, number>({ getOrderingKey });
    const sortedSet = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.set(sortedSet, `data ${i}`, { data: i.toString(), order: i });
    }

    adapter.update(sortedSet, 'does not exist', item => { item.data = 'test'; });
    expect(Array.from(adapter.getIterable(sortedSet))).toEqual(range(1, 20).map(toTestObj));
  });

  it('uses a custom ordering function', () => {
    const adapter = new SortedSetAdapter<string, TestObject, number>({
      getOrderingKey,
      orderComparer: (a, b) => b - a,
    });
    const sortedSet = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.set(sortedSet, `data ${i}`, { data: i.toString(), order: i });
    }

    expect(Array.from(adapter.getIterable(sortedSet))).toEqual(range(1, 20).reverse().map(toTestObj));
  });

  it('removes an item', () => {
    const adapter = new SortedSetAdapter<string, TestObject, number>({ getOrderingKey });
    const sortedSet = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.set(sortedSet, `data ${i}`, { data: i.toString(), order: i });
    }

    adapter.remove(sortedSet, 'data 20');

    expect(adapter.getSize(sortedSet)).toEqual(19);
    expect(Array.from(adapter.getIterable(sortedSet))).toEqual(range(1, 19).map(toTestObj));
  });

  it('gets the first item', () => {
    const adapter = new SortedSetAdapter<string, TestObject, number>({ getOrderingKey });
    const sortedSet = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.set(sortedSet, `data ${i}`, { data: i.toString(), order: i });
    }

    expect(adapter.getFirst(sortedSet)).toEqual({ data: '1', order: 1 });
  });

  it('gets the last item', () => {
    const adapter = new SortedSetAdapter<string, TestObject, number>({ getOrderingKey });
    const sortedSet = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.set(sortedSet, `data ${i}`, { data: i.toString(), order: i });
    }

    expect(adapter.getLast(sortedSet)).toEqual({ data: '20', order: 20 });
  });
});