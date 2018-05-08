import {createMap, getInMap, setInMap} from './map';
import * as hash from './hash';

describe('map', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  test('creates a map', () => {
    const map = createMap();

    expect(map.root || undefined).not.toBeUndefined();
    expect(map.size).toBe(0);
  });

  test('gets undefined for a non-existent map key', () => {
    const map = createMap();

    const value = getInMap(map, 'test');

    expect(value).toBeUndefined();
  });

  test('sets a map value', () => {
    const map = createMap();
    const testValue = { testKey: 'test value' };

    setInMap(map, 'test', testValue);

    const fromMap = getInMap(map, 'test');
    expect(fromMap).toBe(testValue);
  });

  test('correctly handles different keys with the same hash code', () => {
    jest.spyOn(hash, 'hash').mockImplementation(() => {
      return 987654321;
    });

    const testValue1 = { testKey: 'test value' };
    const testValue2 = { testKey: 'test value 2' };
    const map = createMap<number, typeof testValue1>();

    setInMap(map, 0, testValue1);
    setInMap(map, 1, testValue2);

    const fromMap1 = getInMap(map, 0);
    expect(fromMap1).toBe(testValue1);

    const fromMap2 = getInMap(map, 1);
    expect(fromMap2).toBe(testValue2);
  });
});