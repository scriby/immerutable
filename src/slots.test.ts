import {produce} from 'immer';
import {LruCacheAdapter} from './lrucache';
import {MapAdapter} from './map';
import {SortedCollectionAdapter} from './sortedcollection';
import {SortedMapAdapter} from './sortedmap';
import {occupiedSlots, readSlot, slotName} from './slots';

describe('node slots', () => {
  it('names positions so that they are neither array indices nor identifiers', () => {
    expect([0, 9, 10, 15, 16, 35, 36, 131].map(slotName)).toEqual(['#0', '#9', '#a', '#f', '#g', '#z', '#10', '#3n']);
  });

  it('reads every position under the name slotName gives it', () => {
    // readSlot spells out the first positions; they must agree with slotName.
    const node: {[name: string]: number} = {};
    for (let position = 0; position < 60; position++) node[slotName(position)] = position * 3 + 1;
    for (let position = 0; position < 60; position++) expect(readSlot(node, position)).toBe(position * 3 + 1);
    expect(readSlot({}, 5)).toBeUndefined();
    expect(readSlot({}, 59)).toBeUndefined();
  });

  it('lists the occupied slots among the first sixteen, in order', () => {
    const node: {[name: string]: unknown} = {};
    [15, 0, 7, 3, 16].forEach(position => { node[slotName(position)] = `at ${position}`; });
    node[slotName(4)] = null;
    node[slotName(5)] = undefined;
    node[slotName(6)] = 0;

    // The list is reused: only the counted prefix is meaningful.
    const out: unknown[] = ['stale', 'stale', 'stale', 'stale', 'stale', 'stale', 'stale'];
    const count = occupiedSlots(node, out);

    expect(out.slice(0, count)).toEqual(['at 0', 'at 3', 0, 'at 7', 'at 15']);
    expect(occupiedSlots({}, out)).toBe(0);
  });

  it('refuses collections stored with the array nodes of version 3 instead of misreading them', () => {
    const refusal = /stored by immerutable 3 or earlier/;
    const tree = {o: [0], k: [1]};

    const map = new MapAdapter<number, number>();
    const legacyMap: any = {root: [undefined, {key: 1, value: 1}], size: 1};
    expect(() => map.get(legacyMap, 1)).toThrow(refusal);
    expect(() => map.has(legacyMap, 1)).toThrow(refusal);
    expect(() => map.set(legacyMap, 2, 2)).toThrow(refusal);
    expect(() => Array.from(map.getIterable(legacyMap))).toThrow(refusal);
    expect(() => produce(legacyMap, (draft: any) => { map.remove(draft, 1); })).toThrow(refusal);

    const sorted = new SortedMapAdapter<number, number>({getOrderingKey: value => value});
    const legacySorted: any = {root: [undefined, {key: 1, value: 0}], size: 1, tree};
    expect(() => sorted.get(legacySorted, 1)).toThrow(refusal);
    expect(() => sorted.set(legacySorted, 2, 2)).toThrow(refusal);
    expect(() => Array.from(sorted.getIterable(legacySorted))).toThrow(refusal);

    const lru = new LruCacheAdapter<number, number>(10);
    const legacyLru: any = {root: [undefined, {key: 1, value: {value: 1, order: 0}}], size: 1, tree, nextOrder: 1};
    expect(() => lru.get(legacyLru, 1)).toThrow(refusal);
    expect(() => lru.peek(legacyLru, 1)).toThrow(refusal);
    expect(() => lru.set(legacyLru, 2, 2)).toThrow(refusal);
    expect(() => lru.remove(legacyLru, 1)).toThrow(refusal);
    expect(() => Array.from(lru.getValuesIterable(legacyLru))).toThrow(refusal);

    const collection = new SortedCollectionAdapter<number>({orderComparer: (a, b) => a - b});
    const legacyCollection: any = {root: ['L0', 5], size: 1};
    expect(() => collection.insert(legacyCollection, 6)).toThrow(refusal);
    expect(() => collection.remove(legacyCollection, 5)).toThrow(refusal);
    expect(() => collection.getFirst(legacyCollection)).toThrow(refusal);
    expect(() => Array.from(collection.getIterable(legacyCollection))).toThrow(refusal);
    expect(() => produce(legacyCollection, (draft: any) => { collection.update(draft, 5, () => 6); })).toThrow(refusal);
  });

  it('gives every map trie node exactly the sixteen named slots', () => {
    const adapter = new MapAdapter<number, number>();
    const map = produce(adapter.create(), draft => { for (let i = 0; i < 500; i++) adapter.set(draft, i, i); });
    const expected = Array.from({length: 16}, (_, position) => slotName(position));
    const check = (node: any): void => {
      expect(Object.keys(node)).toEqual(expected);
      for (const name of expected) {
        const child = node[name];
        if (child != null && !('key' in child) && !('map' in child)) check(child);
      }
    };
    check(map.root);
  });
});
