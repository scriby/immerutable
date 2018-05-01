import {createMap, getInMap, setInMap} from './map';

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

  const newMap = setInMap(map, 'test', testValue);
  expect(newMap).not.toBe(map);

  const newValue = getInMap(newMap, 'test');

  expect(newValue).toBe(testValue);
});