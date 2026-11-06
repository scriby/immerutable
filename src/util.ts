export function shallowCopy(value: any) {
  if (value == null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0);
  } else if (typeof value === 'object') {
    return {...value};
  } else {
    return value;
  }
}

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

/** Map key equality: NaN equals itself, and -0 and +0 share a key. */
export function sameValueZero<T>(a: T, b: T): boolean {
  return a === b || (a !== a && b !== b);
}
