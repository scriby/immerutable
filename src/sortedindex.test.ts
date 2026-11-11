import {ISortedIndexNode, SortedIndex} from './sortedindex';
import {snapshotOrder} from './sortedmap';
import {produce} from 'immer';

type Entry = [number, number];   // [order, key]

const compareEntries = (a: Entry, b: Entry) => a[0] - b[0] || a[1] - b[1];

function entries(index: SortedIndex<number>, root: ISortedIndexNode): Entry[] {
  const keys = Array.from(index.iterate(root, false, key => key as number));
  const orders: number[] = [];
  collectOrders(root, orders);
  return keys.map((key, i) => [orders[i], key] as Entry);
}

function collectOrders(node: ISortedIndexNode, out: number[]): void {
  if (node.c === undefined) out.push(...node.o);
  else node.c.forEach(child => collectOrders(child, out));
}

/**
 * Checks node widths, uniform depth, frozen nodes, that separators bound their
 * subtrees, and that each separator is the first entry of the child after it
 * (so no removed order lingers as a separator).
 */
function checkInvariants(root: ISortedIndexNode, max: number): void {
  const leafDepths = new Set<number>();
  const visit = (node: ISortedIndexNode, depth: number, low?: Entry, high?: Entry) => {
    expect(Object.isFrozen(node)).toBe(true);
    expect(node.o.length).toBe(node.k.length);
    if (node.c === undefined) {
      leafDepths.add(depth);
      expect(node.o.length).toBeLessThanOrEqual(max);
      // Only the root may be empty: an empty leaf would hide the edge entries.
      if (node !== root) expect(node.o.length).toBeGreaterThan(0);
      for (let i = 0; i < node.o.length; i++) {
        const entry: Entry = [node.o[i], node.k[i] as number];
        if (i > 0) expect(compareEntries([node.o[i - 1], node.k[i - 1] as number], entry)).toBeLessThan(0);
        if (low) expect(compareEntries(low, entry)).toBeLessThanOrEqual(0);
        if (high) expect(compareEntries(entry, high)).toBeLessThan(0);
      }
      return;
    }
    expect(node.c.length).toBe(node.o.length + 1);
    expect(node.c.length).toBeLessThanOrEqual(max);
    expect(node.c.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < node.c.length; i++) {
      let first = node.c[i];
      while (first.c !== undefined) first = first.c[0];
      expect(first.k[0]).toBe(node.k[i - 1]);
      expect(first.o[0]).toBe(node.o[i - 1]);
    }
    node.c.forEach((child, i) => visit(child, depth + 1,
      i === 0 ? low : [node.o[i - 1], node.k[i - 1] as number],
      i === node.o.length ? high : [node.o[i], node.k[i] as number]));
  };
  visit(root, 0);
  expect(leafDepths.size).toBeLessThanOrEqual(1);
}

/** Checks that each separator is a copy of the first entry of the child after it, whatever the key order. */
function checkSeparators(node: ISortedIndexNode): void {
  if (node.c === undefined) return;
  for (let i = 1; i < node.c.length; i++) {
    let first = node.c[i];
    while (first.c !== undefined) first = first.c[0];
    expect([node.o[i - 1], node.k[i - 1]]).toEqual([first.o[0], first.k[0]]);
  }
  node.c.forEach(checkSeparators);
}

describe('Sorted index', () => {
  it.each([4, 6, 64])('matches a sorted-array model through inserts, moves and removals (max %s)', max => {
    const index = new SortedIndex<number>((a, b) => a - b, max);
    let root = index.empty();
    let model: Entry[] = [];
    let seed = max;
    const random = (n: number) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
    const snapshots: Array<[ISortedIndexNode, Entry[]]> = [];

    for (let step = 0; step < 3000; step++) {
      const key = random(400);
      const existing = model.find(entry => entry[1] === key);
      // Mostly ascending orders exercise the append-aware splits; the rest are random.
      const order = step % 3 === 0 ? step : random(50);
      const operation = random(3);
      if (existing === undefined) {
        root = index.insert(root, order, key);
        model.push([order, key]);
      } else if (operation === 0) {
        root = index.remove(root, existing[0], key)!;
        model = model.filter(entry => entry[1] !== key);
      } else {
        root = index.move(root, existing[0], order, key)!;
        existing[0] = order;
      }
      model.sort(compareEntries);

      expect(index.edgeKey(root, false)).toBe(model.length ? model[0][1] : undefined);
      expect(index.edgeKey(root, true)).toBe(model.length ? model[model.length - 1][1] : undefined);
      if (step % 97 === 0) {
        checkInvariants(root, max);
        snapshots.push([root, model.map(entry => [...entry] as Entry)]);
      }
    }

    checkInvariants(root, max);
    expect(entries(index, root)).toEqual(model);
    expect(Array.from(index.iterate(root, true, key => key))).toEqual(model.map(entry => entry[1]).reverse());
    // Earlier versions are untouched by later changes.
    for (const [snapshot, expected] of snapshots) expect(entries(index, snapshot)).toEqual(expected);
  });

  it('never leaves an empty leaf after an append split and removals', () => {
    // An interior split on append once gave the right half a single child,
    // which removals could empty, hiding the last entry.
    const index = new SortedIndex<number>((a, b) => a - b, 4);
    let root = index.empty();
    const model = new Set<number>();
    const set = (key: number) => { if (!model.has(key)) { root = index.insert(root, key, key); model.add(key); } };
    const remove = (key: number) => { root = index.remove(root, key, key)!; model.delete(key); };
    [27, 28, 9, 20, 18, 11].forEach(set);
    remove(28);
    [23, 16, 21, 19, 3, 29].forEach(set);
    remove(18);
    remove(29);
    checkInvariants(root, 4);
    expect(index.edgeKey(root, true)).toBe(Math.max(...model));
    expect(index.edgeKey(root, false)).toBe(Math.min(...model));
  });

  it('keeps both edges correct through long random churn at the production size', () => {
    const index = new SortedIndex<number>((a, b) => a - b, 32);
    let root = index.empty();
    const model = new Set<number>();
    let seed = 11;
    const random = (n: number) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
    for (let step = 0; step < 20000; step++) {
      const key = random(1500);
      if (model.has(key)) { root = index.remove(root, key, key)!; model.delete(key); }
      else { root = index.insert(root, key, key); model.add(key); }
      if (step % 50 === 0) {
        expect(index.edgeKey(root, true)).toBe(model.size ? Math.max(...model) : undefined);
        expect(index.edgeKey(root, false)).toBe(model.size ? Math.min(...model) : undefined);
      }
    }
    checkInvariants(root, 32);
  });

  it('rejects node sizes too small to rebalance', () => {
    expect(() => new SortedIndex<number>((a, b) => a - b, 3)).toThrow();
    expect(() => new SortedIndex<number>((a, b) => a - b, 4)).not.toThrow();
  });

  it('drains to an empty tree and reports missing entries', () => {
    const index = new SortedIndex<number>((a, b) => a - b, 4);
    let root = index.empty();
    for (let i = 0; i < 200; i++) root = index.insert(root, i % 7, i);
    expect(index.remove(root, 3, 4)).toBeUndefined();
    expect(index.move(root, 3, 5, 4)).toBeUndefined();
    expect(index.contains(root, 4, 4)).toBe(true);
    for (let i = 0; i < 200; i++) {
      root = index.remove(root, i % 7, i)!;
      checkInvariants(root, 4);
    }
    expect(Array.from(index.iterate(root, false, key => key))).toEqual([]);
    expect(index.edgeKey(root, false)).toBeUndefined();
  });

  it('reads and replaces stored orders in an index sorted by key alone', () => {
    // The LRU cache keeps each key's position in the recency order this way.
    const index = new SortedIndex<number>(() => 0, 4);
    let root = index.empty();
    const model = new Map<number, number>();
    let seed = 7;
    const random = (n: number) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return (seed >>> 8) % n;
    };

    for (let step = 0; step < 4000; step++) {
      const key = random(300);
      if (!model.has(key)) {
        expect(index.storedOrder(root, 0, key)).toBeUndefined();
        expect(index.replaceOrder(root, 0, key, step)).toBeUndefined();
        root = index.insert(root, step, key);
        model.set(key, step);
      } else if (random(4) === 0) {
        root = index.remove(root, 0, key)!;
        model.delete(key);
      } else {
        const before = root;
        const replaced = index.replaceOrder(root, 0, key, step)!;
        expect(replaced.previous).toBe(model.get(key));
        // The earlier version is untouched.
        expect(index.storedOrder(before, 0, key)).toBe(model.get(key));
        root = replaced.index;
        model.set(key, step);
      }
      expect(index.storedOrder(root, 0, key)).toBe(model.get(key));
      if (step % 53 === 0) {
        const expected = Array.from(model).sort((a, b) => a[0] - b[0]).map(([key, order]) => [order, key]);
        expect(entries(index, root)).toEqual(expected);
        checkSeparators(root);
      }
    }

    // Replace every order, so those of the keys that are separators as well.
    expect(root.c).toBeDefined();
    for (const key of Array.from(model.keys())) {
      root = index.replaceOrder(root, 0, key, -key)!.index;
      model.set(key, -key);
    }
    checkSeparators(root);
    expect(entries(index, root)).toEqual(Array.from(model).sort((a, b) => a[0] - b[0]).map(([key, order]) => [order, key]));
  });

  it('reads a restored undefined order as undefined when it looks one up or replaces it', () => {
    const index = new SortedIndex<number | undefined>(() => 0, 4);
    const root: ISortedIndexNode = JSON.parse(JSON.stringify(index.insert(index.empty(), undefined, 1)));
    expect(root.o).toEqual([null]);

    expect(index.storedOrder(root, 0, 1)).toBeUndefined();
    const replaced = index.replaceOrder(root, 0, 1, 5)!;
    expect(replaced.previous).toBeUndefined();
    expect(index.storedOrder(replaced.index, 0, 1)).toBe(5);
  });

  it('orders keys by the comparer it is given, at every level', () => {
    // Descending, so that any comparison made with the default order shows.
    const descending = (a: number | string, b: number | string) => (b as number) - (a as number);
    const index = new SortedIndex<number>(() => 0, 4, descending);
    let root = index.empty();
    const keys = Array.from({length: 120}, (_, i) => (i * 37) % 120);
    for (const key of keys) root = index.insert(root, key, key);
    const listed = () => Array.from(index.iterate(root, false, key => key as number));
    expect(root.c).toBeDefined();
    expect(listed()).toEqual(Array.from({length: 120}, (_, i) => 119 - i));

    for (const key of keys) {
      expect(index.contains(root, 0, key)).toBe(true);
      expect(index.storedOrder(root, 0, key)).toBe(key);
      const replaced = index.replaceOrder(root, 0, key, key + 1000)!;
      expect(replaced.previous).toBe(key);
      root = replaced.index;
    }
    expect(entries(index, root)).toEqual(Array.from({length: 120}, (_, i) => [1119 - i, 119 - i]));

    for (const key of keys.filter(key => key % 3 !== 0)) root = index.remove(root, 0, key)!;
    expect(listed()).toEqual(Array.from({length: 40}, (_, i) => 117 - 3 * i));
    expect(index.remove(root, 0, 1)).toBeUndefined();
    checkSeparators(root);
  });

  it('lists the first entries in order, reading a restored undefined order as undefined', () => {
    const index = new SortedIndex<number | undefined>((a, b) => (a === undefined ? Infinity : a) - (b === undefined ? Infinity : b), 4);
    let root = index.empty();
    for (let key = 0; key < 50; key++) root = index.insert(root, (key * 7) % 50, key);

    expect(index.firstEntries(root, 0)).toEqual({orders: [], keys: []});
    expect(index.firstEntries(root, 12)).toEqual({
      orders: Array.from({length: 12}, (_, order) => order),
      keys: Array.from({length: 12}, (_, order) => (order * 43) % 50), // 43 is the inverse of 7 modulo 50
    });
    expect(index.firstEntries(root, 80).keys.length).toBe(50);

    let small = index.insert(index.insert(index.empty(), undefined, 1), 5, 2);
    small = JSON.parse(JSON.stringify(small));
    expect(index.firstEntries(small, 2)).toEqual({orders: [5, undefined], keys: [2, 1]});
  });

  it('snapshots structured ordering keys so later mutation cannot reach the index', () => {
    const order = {rank: [1, 2], at: new Date(5)};
    const snapshot = snapshotOrder(order);
    order.rank.push(3);
    order.at.setTime(9);
    expect(snapshot).toEqual({rank: [1, 2], at: new Date(5)});
    expect(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.rank)).toBe(true);
    expect(snapshotOrder(7)).toBe(7);
    const rank = Symbol('rank');
    const withSymbol = snapshotOrder({[rank]: [3], name: 'x'});
    expect((withSymbol as any)[rank]).toEqual([3]);
    expect(Object.isFrozen((withSymbol as any)[rank])).toBe(true);
  });

  it('stores frozen ordering keys and unchanged drafts without copying them', () => {
    const frozen = Object.freeze({rank: Object.freeze([1, 2])});
    expect(snapshotOrder(frozen)).toBe(frozen);
    const state = produce({order: {rank: 1, items: [1, 2, 3]}}, () => undefined);
    produce(state, draft => {
      expect(snapshotOrder(draft.order)).toBe(state.order);
      draft.order.rank = 2;
      const changed = snapshotOrder(draft.order);
      expect(changed).toEqual({rank: 2, items: [1, 2, 3]});
      expect(changed.items).toBe(state.order.items);
    });
  });
});
