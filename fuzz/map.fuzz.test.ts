import * as rng from 'number-generator';
import {MapAdapter} from '../src/map';
import {getSeed} from './util';

const seed = getSeed();

describe(`Map (fuzz) (Seed: ${seed})`, () => {
  it('Retains consistency over many sets', () => {
    const random = rng.aleaRNGFactory(seed);
    const adapter = new MapAdapter<number, { data: number}>();
    const map = adapter.create();
    const expected = Object.create(null);

    for (let i = 0; i < 300000; i++) {
      const value = random.uInt32();
      const data = { data: value };
      adapter.set(map, value, data);
      expected[value] = data;
    }

    expect(adapter.getSize(map)).toEqual(Object.keys(expected).length);

    for (const key in expected) {
      expect(adapter.get(map, Number(key))).toEqual(expected[key]);
    }

    //TODO: Check other direction as well once map has an iterator.
  });

  it('Retains consistency over many sets and removals', () => {
    const random = rng.aleaRNGFactory(seed);
    const adapter = new MapAdapter<number, { data: number }>();
    const map = adapter.create();
    const expected = Object.create(null);

    for (let i = 0; i < 300000; i++) {
      const value = random.uInt32();
      const data = { data: value };
      adapter.set(map, value, data);
      expected[value] = data;
    }

    expect(adapter.getSize(map)).toEqual(Object.keys(expected).length);

    Object.keys(expected).slice(200000).forEach((key) => {
      adapter.remove(map, Number(key));
      delete expected[key];
    });

    expect(adapter.getSize(map)).toEqual(Object.keys(expected).length);

    for (const key in expected) {
      expect(adapter.get(map, Number(key))).toEqual(expected[key]);
    }

    //TODO: Check other direction as well once map has an iterator.
  });
});