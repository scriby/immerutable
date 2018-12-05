import {LruCacheAdapter} from './lrucache';

describe('LRU Cache', () => {
  it('expires old items', () => {
    const adapter = new LruCacheAdapter<string, string>(4);
    const lru = adapter.create();

    adapter.set(lru, 'a', 'a');
    adapter.set(lru, 'b', 'b');
    adapter.set(lru, 'c', 'c');
    adapter.set(lru, 'd', 'd');
    adapter.set(lru, 'e', 'e');

    expect(adapter.getSize(lru)).toBe(4);
    expect(Array.from(adapter.getIterable(lru))).toEqual([
      ['b', 'b'],
      ['c', 'c'],
      ['d', 'd'],
      ['e', 'e'],
    ]);
  });

  it('treats gotten items as more recent', () => {
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

  it('treats updated items as more recent', () => {
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

  it('removes items', () => {
    const adapter = new LruCacheAdapter<string, string>(4);
    const lru = adapter.create();

    adapter.set(lru, 'a', 'a');
    adapter.set(lru, 'b', 'b');
    adapter.set(lru, 'c', 'c');
    expect(adapter.getSize(lru)).toBe(3);

    adapter.remove(lru, 'c');
    expect(adapter.getSize(lru)).toBe(2);
    expect(Array.from(adapter.getValuesIterable(lru))).toEqual(['a', 'b']);
  });

  it('gets keys', () => {
    const adapter = new LruCacheAdapter<string, string>(4);
    const lru = adapter.create();

    adapter.set(lru, 'a', 'a');
    adapter.set(lru, 'b', 'b');
    adapter.set(lru, 'c', 'c');

    expect(Array.from(adapter.getKeysIterable(lru))).toEqual(['a', 'b', 'c']);
  });
});