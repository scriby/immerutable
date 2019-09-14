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
    for (const [key, value] of adapter.getIterable(map)) {
      expect(value.order).toBeGreaterThanOrEqual(lastOrder);
      lastOrder = value.order;
      expect(value).toEqual(expected[key]);
    }
  });

  it('Retains consistency for a large map with in-order inserts', () => {
    const LENGTH = 300000;
    const adapter = new SortedMapAdapter<number, { data: number, order: number }, number>({
      getOrderingKey: item => item.order,
    });
    const map = adapter.create();

    for (let i = 1; i <= LENGTH; i++) {
      adapter.set(map, i, { data: i, order: i });
    }

    expect(adapter.getSize(map)).toEqual(LENGTH);

    let curr = 0;
    for (const [key, value] of adapter.getIterable(map)) {
      curr++;

      expect(key).toEqual(curr);
      expect(value.data).toEqual(curr);
      expect(value.order).toEqual(curr);
    }

    expect(curr).toEqual(LENGTH);
  });

  it('Retains consistency for a large map with reverse-order inserts', () => {
    const LENGTH = 300000;
    const adapter = new SortedMapAdapter<number, { data: number, order: number }, number>({
      getOrderingKey: item => -item.order,
    });
    const map = adapter.create();

    for (let i = 1; i <= LENGTH; i++) {
      adapter.set(map, i, { data: i, order: i });
    }

    expect(adapter.getSize(map)).toEqual(LENGTH);

    let curr = LENGTH;
    for (const [key, value] of adapter.getIterable(map)) {
      expect(key).toEqual(curr);
      expect(value.data).toEqual(curr);
      expect(value.order).toEqual(curr);

      curr--;
    }

    expect(curr).toEqual(0);
  });

  it('Retains consistency for medium list sizes', () => {
    const random = rng.aleaRNGFactory(seed);

    for (let i = 0; i < 200; i++) {
      const adapter = new SortedMapAdapter<number, { data: number, order: number }, number>({
        getOrderingKey: item => -item.order,
      });

      const map = adapter.create();

      const length = 3000 + (random.uInt32() % 2000);
      const variance = (random.uInt32() % 100) + 1;

      for (let k = 1; k <= length; k++) {
        const key = k + (random.uInt32() % variance);
        const order = k + (random.uInt32() % variance);

        adapter.set(map, key, { data: key, order });
      }

      let lastOrder = Infinity;
      for (const [key, value] of adapter.getIterable(map)) {
        expect(value.order).toBeLessThanOrEqual(lastOrder);
        lastOrder = value.order;

        expect(value.data).toEqual(key);
      }
    }
  });

  //3662728131053617
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
    for (const [key, value] of adapter.getIterable(map)) {
      expect(value.order).toBeGreaterThanOrEqual(lastOrder);
      lastOrder = value.order;
      expect(value).toEqual(expected[key]);
    }
  });

  it('Retains consistency over many updates', () => {
    const random = rng.aleaRNGFactory(seed);
    const adapter = new SortedMapAdapter<number, { data: number, order: number }, number>({
      getOrderingKey: item => item.order,
    });
    const map = adapter.create();
    const expected = Object.create(null);

    for (let i = 0; i < 100000; i++) {
      const value = random.uInt32();
      const data = { data: value, order: value };
      adapter.set(map, value, data);
      expected[value] = data;
    }

    const expectedKeys = Object.keys(expected);

    for (let i = 0; i < 100000; i++) {
      const key = expectedKeys[Math.floor(random.uFloat32() * expectedKeys.length)];

      adapter.update(map, Number(key), (item) => {
        item.order = random.uInt32();
      });
    }

    expect(adapter.getSize(map)).toEqual(expectedKeys.length);

    for (const key in expected) {
      expect(adapter.get(map, Number(key))).toEqual(expected[key]);
    }

    let lastOrder = -Infinity;
    for (const [key, value] of adapter.getIterable(map)) {
      expect(value.order).toBeGreaterThanOrEqual(lastOrder);
      lastOrder = value.order;
      expect(value).toEqual(expected[key]);
    }
  });
});