import * as hash from './hash';
import {MapAdapter} from './map';

describe('map', () => {
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

  test('Updates an item by returning a different value', () => {
    const adapter = new MapAdapter<number, typeof testValue>();
    const map = adapter.create();
    const testValue = { testKey: 'test value' };

    adapter.set(map, 1, testValue);
    adapter.update(map, 1, () => ({ testKey: 'asdf' }));

    expect(adapter.get(map, 1)).toEqual({ testKey: 'asdf' });
  });
});