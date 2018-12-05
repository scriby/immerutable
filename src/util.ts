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
  let iterator: Iterator<T>;

  const iterableIterator = {
    [Symbol.iterator]: () => iterableIterator,
    next: () => {
      if (!iterator) iterator = iterable[Symbol.iterator]();

      return iterator.next();
    }
  };

  return iterableIterator;
}