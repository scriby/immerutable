export function iterableToIterableIterator<T>(iterable: Iterable<T>): IterableIterator<T> {
  let iterator: Iterator<T> | undefined;
  const result: IterableIterator<T> & Disposable = {
    [Symbol.iterator]: () => result,
    next: () => {
      if (!iterator) iterator = iterable[Symbol.iterator]();
      return iterator.next();
    },
    [Symbol.dispose]: () => {
      if (Symbol.dispose in iterable) {
        (iterable as Iterable<T> & Disposable)[Symbol.dispose]();
      }
    },
  };
  return result;
}

export function mapIterable<T, U>(iterable: Iterable<T>, transform: (item: T) => U): Iterable<U> {
  return {
    [Symbol.iterator]() {
      const iterator = iterable[Symbol.iterator]();

      return {
        next() {
          const next = iterator.next();

          if (next.done) {
            return { value: undefined as any as U, done: true };
          } else {
            return { value: transform(next.value), done: false };
          }
        }
      };
    }
  };
}

/** The operations a collection adapter provides to back a ReadonlyMap view. */
export interface ReadonlyMapSource<K, V> {
  entries(): Iterable<[K, V]>;
  keys(): Iterable<K>;
  values(): Iterable<V>;
  get(key: K): V|undefined;
  has(key: K): boolean;
  size(): number;
}

export function createReadonlyMap<K, V>(source: ReadonlyMapSource<K, V>): ReadonlyMap<K, V> {
  const readonlyMap: ReadonlyMap<K, V> = {
    [Symbol.iterator]: () => iterableToIterableIterator(source.entries())[Symbol.iterator](),
    entries: () => iterableToIterableIterator(source.entries()),
    keys: () => iterableToIterableIterator(source.keys()),
    values: () => iterableToIterableIterator(source.values()),
    forEach: (callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: any) => {
      const iterator = readonlyMap.entries();
      while (true) {
        const next = iterator.next();
        if (next.done) break;
        callbackfn.call(thisArg, next.value[1], next.value[0], readonlyMap);
      }
    },
    get: (key: K) => source.get(key),
    has: (key: K) => source.has(key),
    get size() { return source.size(); },
  };

  return readonlyMap;
}

export function createReadonlySet<K>(source: Pick<ReadonlyMapSource<K, unknown>, 'keys' | 'has' | 'size'>): ReadonlySet<K> {
  const readonlySet: ReadonlySet<K> = {
    [Symbol.iterator]: () => iterableToIterableIterator(source.keys())[Symbol.iterator](),
    entries: () => iterableToIterableIterator(mapIterable(source.keys(), (key) => [key, key] as [K, K])),
    keys: () => iterableToIterableIterator(source.keys()),
    values: () => iterableToIterableIterator(source.keys()),
    forEach: (callbackfn: (value: K, key: K, set: ReadonlySet<K>) => void, thisArg?: any) => {
      const iterator = readonlySet.keys();
      while (true) {
        const next = iterator.next();
        if (next.done) break;
        callbackfn.call(thisArg, next.value, next.value, readonlySet);
      }
    },
    has: (key: K) => source.has(key),
    get size() { return source.size(); },
  };

  return readonlySet;
}

// Immer marks drafts with this registered symbol.
const DRAFT_STATE = Symbol.for('immer-state');

export function isDraft(value: any): boolean {
  return value != null && value[DRAFT_STATE] !== undefined;
}

// Draft internals are renamed in Immer's production build, so use its public
// API. Loaded lazily: only a draft (so Immer itself) can reach the callers.
// Kept once loaded: require resolves the module path on every call.
declare const require: (id: string) => any;
let immerModule: any;
function immer(): any {
  return immerModule || (immerModule = require('immer'));
}

/**
 * The state a draft (or any other value, returned as is) was created from. In
 * nested producers, original can return a draft of the outer producer, so
 * unwrap until none is left.
 */
export function originalOf<T>(value: T): T {
  while (isDraft(value)) value = immer().original(value);
  return value;
}

/**
 * A non-draft copy of a draft's current state. In nested producers, current
 * can return a draft of the outer producer, so unwrap until none is left.
 */
export function currentOf<T extends object>(draft: T): T {
  let value = draft;
  while (isDraft(value)) value = immer().current(value);
  return value;
}

/** An iterable that calls create each time it is iterated, so it reflects the current state. */
export function lazyIterable<T>(create: () => Iterable<T>): Iterable<T> {
  return { [Symbol.iterator]: () => create()[Symbol.iterator]() };
}

/** Map key equality: NaN equals itself, and -0 and +0 share a key. */
export function sameValueZero<T>(a: T, b: T): boolean {
  return a === b || (a !== a && b !== b);
}
