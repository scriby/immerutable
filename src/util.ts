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
  const getIterableIterator = (iterator?: Iterator<T>) => {
    return {
      [Symbol.iterator]: () => getIterableIterator(iterable[Symbol.iterator]()),
      next: iterator ? () => iterator!.next() : (() => {
        if (!iterator) iterator = iterable[Symbol.iterator]();

        return iterator.next();
      })
    };
  };

  return getIterableIterator();
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