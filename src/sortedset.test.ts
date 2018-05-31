import {SortedSetAdapter} from './sortedset';

interface TestObject {
  data: string;
  order: number;
}

const comparer = (a: TestObject, b: TestObject) => a.order - b.order;
const range = (start: number, end: number) => new Array(end - start + 1).join().split(',').map((empty, i) => i + start);

describe('Sorted set', () => {
  it('adds 20 items in order', () => {
    const adapter = new SortedSetAdapter<string, TestObject>({ comparer });
    const sortedSet = adapter.create();

    for (let i = 1; i <= 20; i++) {
      adapter.set(sortedSet, `data ${i}`, { data: i.toString(), order: i });
    }

    expect(Array.from(adapter.getIterable(sortedSet))).toEqual(range(1, 20).map(i => ({ data: i.toString(), order: i })))
  });

  it('adds 20 items in reverse order', () => {
    const adapter = new SortedSetAdapter<string, TestObject>({ comparer });
    const sortedSet = adapter.create();

    for (let i = 20; i > 0; i--) {
      adapter.set(sortedSet, `data ${i}`, { data: i.toString(), order: i });
    }

    expect(Array.from(adapter.getIterable(sortedSet))).toEqual(range(1, 20).map(i => ({ data: i.toString(), order: i })))
  });
});