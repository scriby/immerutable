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

/**
 * Reads a property whose value is only ever replaced as a whole, never
 * changed in place (a sorted index), without creating a draft of it. On a
 * draft, a property descriptor carries the stored value, where a plain read
 * would create a draft of it. If something else did draft the value (a
 * nested producer does), nothing has modified that draft, so its original is
 * current. Undefined if the owner has no such property.
 *
 * The property must be quoted wherever it is used, so that a minifier keeps
 * the name this looks up.
 */
export function readWhole<T extends object, P extends keyof T>(owner: T, property: P): T[P]|undefined {
  const descriptor = Object.getOwnPropertyDescriptor(owner, property);
  return descriptor === undefined ? undefined : originalOf(descriptor.value);
}

/**
 * For a draft: the value a property had in the state the draft was created
 * from, provided nothing has replaced it and nothing has read it through the
 * draft. Undefined otherwise, and for an owner that is not a draft.
 *
 * Everything below such a value is unchanged too: changing it would have
 * needed a draft of the value, and Immer creates one only when the property
 * is read through the owner (after which this returns undefined). So it can
 * be read in place of the draft's own value, which creates no drafts, and so
 * no copies of the objects read. This holds however changes are made: by an
 * adapter, through a draft an adapter handed out, or by applying patches.
 *
 * In a nested producer the owner's original is the outer producer's draft, so
 * the value is read through that draft: it is current, but it is itself a
 * draft, and reading it creates drafts in the outer producer.
 */
export function untouched<T extends object, P extends keyof T>(owner: T, property: P): T[P]|undefined {
  if (!isDraft(owner)) return undefined;
  const value = (original(owner as any) as T)[property];
  // A property descriptor of a draft carries the value the draft holds,
  // where a plain read would create (and return) a draft of it.
  return Object.getOwnPropertyDescriptor(owner, property)!.value === value ? value : undefined;
}
