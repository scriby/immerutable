import {SortedSetAdapter} from './sortedset';

interface TestObject {
  data: string;
  order: number;
}

const getOrderingKey = (obj: TestObject) => obj.order;
const range = (start: number, end: number) => new Array(end - start + 1).join().split(',').map((empty, i) => i + start);

describe('Sorted set', () => {
  it('adds 20 items in order', () => {
    const adapter = new SortedSetAdapter<string, TestObject, number>({ getOrderingKey });
    const sortedSet = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.set(sortedSet, `data ${i}`, { data: i.toString(), order: i });
    }

    expect(adapter.getSize(sortedSet)).toEqual(20);
    expect(Array.from(adapter.getIterable(sortedSet))).toEqual(range(1, 20).map(i => ({ data: i.toString(), order: i })));
  });

  it('adds 20 items in reverse order', () => {
    const adapter = new SortedSetAdapter<string, TestObject, number>({ getOrderingKey });
    const sortedSet = adapter.create();

    for (let i = 20; i > 0; i--) {
      adapter.set(sortedSet, `data ${i}`, { data: i.toString(), order: i });
    }

    expect(adapter.getSize(sortedSet)).toEqual(20);
    expect(Array.from(adapter.getIterable(sortedSet))).toEqual(range(1, 20).map(i => ({ data: i.toString(), order: i })));
  });

  it('reorders when updating item 10 to the end', () => {
    const adapter = new SortedSetAdapter<string, TestObject, number>({ getOrderingKey });
    const sortedSet = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.set(sortedSet, `data ${i}`, { data: i.toString(), order: i });
    }

    adapter.update(sortedSet, 'data 10', (item) => { item.order = 25; });

    expect(adapter.getSize(sortedSet)).toEqual(20);
    expect(Array.from(adapter.getIterable(sortedSet))).toEqual(
      range(1, 9).concat(range(11, 20)).map(i => ({ data: i.toString(), order: i })).concat({ data: '10', order: 25 })
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
      [{ data: '15', order: -1 }].concat(range(1, 14).concat(range(16, 20)).map(i => ({ data: i.toString(), order: i })))
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
      range(2, 10).map(i => ({ data: i.toString(), order: i }))
        .concat({ data: '1', order: 10.5 }, range(11, 20).map(i => ({ data: i.toString(), order: i })))
    );
  });
});