import {createMap, getInMap, setInMap, ValueNode} from './map';
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

  test('splits a value node correctly when it gets too large', () => {
    jest.spyOn(hash, 'hash').mockImplementation(() => {
      return 987654321;
    });

    const testValue = { testKey: 'test value' };
    const testValue2 = { testKey: 'test value 2' };
    const map = createMap<number, typeof testValue>();

    setInMap(map, 0, testValue);
    const valueNode = map.root[Number(Object.keys(map.root)[0])] as ValueNode<typeof testValue>;
    expect(valueNode.size).toBe(1);

    valueNode.size = 32;
    setInMap(map, 1, testValue2);

    const fromMap = getInMap(map, 1);
    expect(fromMap).toBe(testValue2);
  });
});