import {current, original} from 'immer';

// The intrinsic iterator prototype exists even on ES2018 runtimes without a
// global Iterator constructor. On newer runtimes it also supplies the helpers.
const iteratorPrototype = Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()));

function closeIterator(iterator: Iterator<unknown>): void {
  const close = iterator.return;
  if (close) {
    const result = close.call(iterator);
    if (result === null || (typeof result !== 'object' && typeof result !== 'function')) {
      throw new TypeError('Iterator return() must return an object');
    }
  }
}

class LazyIterator<T> {
  private iterator: Iterator<T> | undefined;
  private closed = false;

  constructor(private iterable: Iterable<T> | undefined) {}

  next(): IteratorResult<T, undefined> {
    if (this.closed) return {value: undefined, done: true};
    try {
      if (!this.iterator) this.iterator = this.iterable![Symbol.iterator]();
      const result = this.iterator.next();
      if (!result.done) return result;
      this.finish();
      return {value: undefined, done: true};
    } catch (error) {
      this.finish();
      throw error;
    }
  }

  return(): IteratorResult<T, undefined> {
    const iterator = this.iterator;
    this.finish();
    if (iterator) closeIterator(iterator);
    return {value: undefined, done: true};
  }

  private finish(): void {
    this.closed = true;
    this.iterator = undefined;
    this.iterable = undefined;
  }
}

// Change the shared prototype once, never the prototype of each new iterator.
Object.setPrototypeOf(LazyIterator.prototype, iteratorPrototype);
// Do not require disposable declarations (or create an "undefined" property)
// on older TypeScript libs/runtimes. Closing an unstarted iterator stays lazy.
const dispose: symbol | undefined = (Symbol as unknown as {readonly dispose?: symbol}).dispose;
if (dispose !== undefined) {
  Object.defineProperty(LazyIterator.prototype, dispose, {
    configurable: true,
    writable: true,
    value(this: LazyIterator<unknown>) { this.return(); },
  });
}

export function iterableToIterableIterator<T>(iterable: Iterable<T>): IteratorObject<T, undefined, unknown> {
  // TypeScript cannot infer methods installed through the prototype chain.
  return new LazyIterator(iterable) as unknown as IteratorObject<T, undefined, unknown>;
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
        },
        return() {
          closeIterator(iterator);
          return {value: undefined, done: true};
        },
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

/**
 * The state a draft (or any other value, returned as is) was created from. In
 * nested producers, original can return a draft of the outer producer, so
 * unwrap until none is left.
 */
export function originalOf<T>(value: T): T {
  while (isDraft(value)) value = original(value as any) as T;
  return value;
}

/**
 * A non-draft copy of a draft's current state. In nested producers, current
 * can return a draft of the outer producer, so unwrap until none is left.
 */
export function currentOf<T extends object>(draft: T): T {
  let value = draft;
  while (isDraft(value)) value = current(value as any) as T;
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
