import * as hash from './hash';
import {Key, MapAdapter} from './map';

//TODO: size doesn't decrease when removing non-existent item

describe('map', () => {
  const range = (start: number, end: number) => new Array(end - start + 1).join().split(',').map((empty, i) => i + start);

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  test('creates a map', () => {
    const adapter = new MapAdapter();
    const map = adapter.create();

    expect(map.root || undefined).not.toBeUndefined();
    expect(map.size).toBe(0);
  });

  test('gets undefined for a non-existent map key', () => {
    const adapter = new MapAdapter();
    const map = adapter.create();

    const value = adapter.get(map, 'test');

    expect(value).toBeUndefined();
  });

  test('sets a map value', () => {
    const adapter = new MapAdapter();
    const map = adapter.create();
    const testValue = { testKey: 'test value' };

    adapter.set(map, 'test', testValue);

    const fromMap = adapter.get(map, 'test');
    expect(fromMap).toBe(testValue);
    expect(map.size).toBe(1);
  });

  test('correctly handles different keys with the same hash code', () => {
    const adapter = new MapAdapter();
    const map = adapter.create();
    jest.spyOn(hash, 'hash').mockImplementation(() => {
      return 987654321;
    });

    const testValue1 = { testKey: 'test value' };
    const testValue2 = { testKey: 'test value 2' };

    adapter.set(map, 0, testValue1);
    adapter.set(map, 1, testValue2);

    const fromMap1 = adapter.get(map, 0);
    expect(fromMap1).toBe(testValue1);

    const fromMap2 = adapter.get(map, 1);
    expect(fromMap2).toBe(testValue2);

    expect(map.size).toBe(2);
  });

  test('sets values at the max depth of the tree', () => {
    class TestAdapter<K extends Key, V> extends MapAdapter<K, V> {
      protected maxDepth = 3;
    }

    const adapter = new TestAdapter<string, number>();
    const map = adapter.create();

    for (let i = 0; i < 20; i++) {
      adapter.set(map, i.toString(), i);
      expect(adapter.get(map, i.toString())).toEqual(i);
    }
  });

  test('replaces a value in all node types', () => {
    class TestAdapter<K extends Key, V> extends MapAdapter<K, V> {
      protected maxDepth = 3;
    }

    const adapter = new TestAdapter<string, string>();
    const map = adapter.create();

    for (let i = 0; i < 20; i++) {
      adapter.set(map, i.toString(), i.toString());
      expect(adapter.get(map, i.toString())).toEqual(i.toString());
    }

    for (let i = 0; i < 20; i++) {
      adapter.set(map, i.toString(), i + '_updated');
      expect(adapter.get(map, i.toString())).toEqual(i + '_updated');
    }
  });

  test('removes by key', () => {
    const adapter = new MapAdapter();
    const map = adapter.create();
    const testValue = { testKey: 'test value' };

    adapter.set(map, 1, testValue);
    expect(adapter.get(map, 1)).toBe(testValue);
    expect(map.size).toBe(1);

    adapter.remove(map, 1);
    expect(adapter.get(map, 1)).toBeUndefined();
    expect(map.size).toBe(0);
  });

  test('removes by key with multiple items sharing the same hash code', () => {
    const adapter = new MapAdapter();
    const map = adapter.create();
    jest.spyOn(hash, 'hash').mockImplementation(() => {
      return 987654321;
    });

    const testValue1 = { testKey: 'test value' };
    const testValue2 = { testKey: 'test value 2' };

    adapter.set(map, 0, testValue1);
    adapter.set(map, 1, testValue2);

    const fromMap1 = adapter.get(map, 0);
    expect(fromMap1).toBe(testValue1);

    const fromMap2 = adapter.get(map, 1);
    expect(fromMap2).toBe(testValue2);
    expect(map.size).toBe(2);

    adapter.remove(map, 0);
    expect(adapter.get(map, 0)).toBeUndefined();
    expect(map.size).toBe(1);

    adapter.remove(map, 1);
    expect(adapter.get(map, 1)).toBeUndefined();
    expect(map.size).toBe(0);
  });

  test('removes a non-existent item', () => {
    const adapter = new MapAdapter();
    const map = adapter.create();

    adapter.remove(map, 1);

    expect(adapter.has(map, 1)).toBe(false);
  });

  test('updates an item', () => {
    const adapter = new MapAdapter<number, typeof testValue>();
    const map = adapter.create();
    const testValue = { testKey: 'test value' };

    adapter.set(map, 1, testValue);
    adapter.update(map, 1, item => { item.testKey = 'asdf'; });

    expect(adapter.get(map, 1)).toEqual({ testKey: 'asdf' });
  });

  test('updates by key with multiple items sharing the same hash code', () => {
    const adapter = new MapAdapter<number, typeof testValue1>();
    const map = adapter.create();
    jest.spyOn(hash, 'hash').mockImplementation(() => {
      return 987654321;
    });

    const testValue1 = { testKey: 'test value' };
    const testValue2 = { testKey: 'test value 2' };

    adapter.set(map, 0, testValue1);
    adapter.set(map, 1, testValue2);

    adapter.update(map, 0, item => { item.testKey += ' a'; });
    adapter.update(map, 1, item => { item.testKey += ' b'; });

    expect(adapter.get(map, 0)).toEqual({ testKey: 'test value a' });
    expect(adapter.get(map, 1)).toEqual({ testKey: 'test value 2 b' });
  });

  test('updates an item by returning a different value', () => {
    const adapter = new MapAdapter<number, typeof testValue>();
    const map = adapter.create();
    const testValue = { testKey: 'test value' };

    adapter.set(map, 1, testValue);
    adapter.update(map, 1, () => ({ testKey: 'asdf' }));

    expect(adapter.get(map, 1)).toEqual({ testKey: 'asdf' });
  });

  test('does not update a non-existent item', () => {
    const adapter = new MapAdapter<number, typeof testValue>();
    const map = adapter.create();
    const testValue = { testKey: 'test value' };

    adapter.update(map, 1, () => ({ testKey: 'asdf' }));

    expect(adapter.get(map, 1)).toBeUndefined();
  });

  test('updates an item at maxDepth', () => {
    class TestAdapter<K extends Key, V> extends MapAdapter<K, V> {
      protected maxDepth = 3;
    }

    const adapter = new TestAdapter<string, string>();
    const map = adapter.create();

    for (let i = 0; i < 20; i++) {
      adapter.set(map, i.toString(), i.toString());
      expect(adapter.get(map, i.toString())).toEqual(i.toString());
    }

    adapter.update(map, '0', (item) => item + '_updated');

    expect(adapter.get(map, '0')).toEqual('0_updated');
  });

  test('iterates through map entries', () => {
    const adapter = new MapAdapter<number, typeof testValue>();
    const map = adapter.create();
    const testValue = { x: 0, value: 'test value' };

    for (let i = 1; i <= 20; i++) {
      adapter.set(map, i, { ...testValue, x: i });
    }

    // Get coverage on "if (child === undefined) {" in map.ts.
    adapter.remove(map, 1);

    expect(Array.from(adapter.getIterable(map)).sort((a, b) => a.value.x - b.value.x)).toEqual(range(2, 20).map(i => ({ key: i, value: { x: i, value: 'test value' }})));
  });

  test('iterates through maxDepth map entries', () => {
    class TestAdapter<K extends Key, V> extends MapAdapter<K, V> {
      protected maxDepth = 3;
    }

    const adapter = new TestAdapter<number, typeof testValue>();
    const map = adapter.create();
    const testValue = { x: 0, value: 'test value' };

    for (let i = 1; i <= 20; i++) {
      adapter.set(map, i, { ...testValue, x: i });
    }

    expect(Array.from(adapter.getIterable(map)).sort((a, b) => a.value.x - b.value.x)).toEqual(range(1, 20).map(i => ({ key: i, value: { x: i, value: 'test value' }})));
  });

  test('determines a key exists using has', () => {
    const adapter = new MapAdapter<string, number>();
    const map = adapter.create();

    adapter.set(map, 'test', 10);

    expect(adapter.has(map, 'test')).toBe(true);
  });

  test('determines a key does not exist using has', () => {
    const adapter = new MapAdapter<string, number>();
    const map = adapter.create();

    expect(adapter.has(map, 'test')).toBe(false);
  });

  test('determines an existing key with hash conflict exists', () => {
    const adapter = new MapAdapter<string, number>();
    const map = adapter.create();
    jest.spyOn(hash, 'hash').mockImplementation(() => {
      return 987654321;
    });

    adapter.set(map, 'test', 10);
    adapter.set(map, 'test1', 11);

    expect(adapter.has(map, 'test')).toBe(true);
  });

  test('determines a non-existent key with hash conflict does not exist', () => {
    const adapter = new MapAdapter<string, number>();
    const map = adapter.create();
    jest.spyOn(hash, 'hash').mockImplementation(() => {
      return 987654321;
    });

    adapter.set(map, 'test', 10);

    expect(adapter.has(map, 'does not exist')).toBe(false);
  });
});