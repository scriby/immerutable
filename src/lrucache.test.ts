import {LruCacheAdapter} from './lrucache';

describe('LRU Cache', () => {
  test('expires old items', () => {
    const adapter = new LruCacheAdapter<string, string>(4);
    const lru = adapter.create();

    adapter.set(lru, 'a', 'a');
    adapter.set(lru, 'b', 'b');
    adapter.set(lru, 'c', 'c');
    adapter.set(lru, 'd', 'd');
    adapter.set(lru, 'e', 'e');

    expect(adapter.getSize(lru)).toBe(4);
    expect(Array.from(adapter.getIterable(lru))).toEqual([
      {key: 'b', value: 'b'},
      {key: 'c', value: 'c'},
      {key: 'd', value: 'd'},
      {key: 'e', value: 'e'},
    ]);
  });

  test('treats gotten items as more recent', () => {
    const adapter = new LruCacheAdapter<string, string>(4);
    const lru = adapter.create();

    adapter.set(lru, 'a', 'a');
    adapter.set(lru, 'b', 'b');
    adapter.set(lru, 'c', 'c');
    adapter.set(lru, 'd', 'd');
    adapter.get(lru, 'a');
    adapter.set(lru, 'e', 'e');

    expect(adapter.getSize(lru)).toBe(4);
    expect(Array.from(adapter.getValuesIterable(lru))).toEqual(['c', 'd', 'a', 'e']);
  });

  test('treats updates items as more recent', () => {
    const adapter = new LruCacheAdapter<string, string>(4);
    const lru = adapter.create();

    adapter.set(lru, 'a', 'a');
    adapter.set(lru, 'b', 'b');
    adapter.set(lru, 'c', 'c');
    adapter.update(lru, 'a', () => 'f');
    adapter.set(lru, 'd', 'd');
    adapter.set(lru, 'e', 'e');

    expect(adapter.getSize(lru)).toBe(4);
    expect(Array.from(adapter.getValuesIterable(lru))).toEqual(['c', 'f', 'd', 'e']);
  });

});