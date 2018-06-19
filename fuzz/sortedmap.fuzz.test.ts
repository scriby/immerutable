import * as rng from 'number-generator';
import {SortedMapAdapter} from '../src/sortedmap';
import {getSeed} from './util';

const seed = getSeed();

describe(`SortedSet (fuzz) (Seed: ${seed})`, () => {
  it('Retains consistency over many sets', () => {
    const random = rng.aleaRNGFactory(seed);
    const adapter = new SortedMapAdapter<number, { data: number, order: number }, number>({
      getOrderingKey: item => item.order,
    });
    const map = adapter.create();
    const expected = Object.create(null);

    for (let i = 0; i < 200000; i++) {
      const value = random.uInt32();
      const data = { data: value, order: value };
      adapter.set(map, value, data);
      expected[value] = data;
    }

    expect(adapter.getSize(map)).toEqual(Object.keys(expected).length);

    for (const key in expected) {
      expect(adapter.get(map, Number(key))).toEqual(expected[key]);
    }

    let lastOrder = -Infinity;
    for (const {key, value} of adapter.getIterable(map)) {
      expect(value.order).toBeGreaterThanOrEqual(lastOrder);
      lastOrder = value.order;
      expect(value).toEqual(expected[key]);
    }
  });

  it('Adds and removes randomly', () => {
    const random = rng.aleaRNGFactory(seed);
    const adapter = new SortedMapAdapter<number, { data: number, order: number }, number>({
      getOrderingKey: item => item.order,
    });
    const map = adapter.create();
    const expected = Object.create(null);
    const keys = [];

    for (let i = 0; i < 500000; i++) {
      // 2/3 of the time, add a random value
      if (random.uFloat32() < .67) {
        const value = random.uInt32();
        const data = { data: value, order: value % 5 }; // Mod value by 5 to increase collisions
        adapter.set(map, value, data);
        expected[value] = data;
        keys.push(value);
      } else {
        // 1/3 of the time, remove a value
        if (keys.length === 0) continue;

        const lastKey = keys.pop()!;
        adapter.remove(map, Number(lastKey));
        delete expected[lastKey];
      }
    }

    expect(adapter.getSize(map)).toEqual(Object.keys(expected).length);

    for (const key in expected) {
      expect(adapter.get(map, Number(key))).toEqual(expected[key]);
    }

    let lastOrder = -Infinity;
    for (const {key, value} of adapter.getIterable(map)) {
      expect(value.order).toBeGreaterThanOrEqual(lastOrder);
      lastOrder = value.order;
      expect(value).toEqual(expected[key]);
    }
  });
});