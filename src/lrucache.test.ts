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

    expect(Array.from(adapter.getIterable(lru))).toEqual([
      {key: 'b', value: 'b'},
      {key: 'c', value: 'c'},
      {key: 'd', value: 'd'},
      {key: 'e', value: 'e'},
    ])
  });
});