import {createReadonlySet, iterableToIterableIterator, mapIterable} from './util';

function trackedIterable() {
  const next = jest.fn((): IteratorResult<number> => ({value: 1, done: false}));
  const close = jest.fn((): IteratorResult<number> => ({value: undefined, done: true}));
  const start = jest.fn(() => ({next, return: close}));
  return {source: {[Symbol.iterator]: start}, start, next, close};
}

describe('Readonly iterator protocol', () => {
  it('starts lazily, returns itself, and stays exhausted', () => {
    const start = jest.fn(() => [1, 2][Symbol.iterator]());
    const iterator = iterableToIterableIterator({[Symbol.iterator]: start});
    expect(start).not.toHaveBeenCalled();
    expect(iterator[Symbol.iterator]()).toBe(iterator);
    expect(iterator.next()).toEqual({value: 1, done: false});
    expect(start).toHaveBeenCalledTimes(1);
    expect(Array.from(iterator)).toEqual([2]);
    expect(Array.from(iterator)).toEqual([]);
    expect(iterator.next()).toEqual({value: undefined, done: true});
  });

  it('can close before starting without creating the underlying iterator', () => {
    const tracked = trackedIterable();
    const iterator = iterableToIterableIterator(tracked.source);
    iterator.return!();
    expect(iterator.next().done).toBe(true);
    expect(tracked.start).not.toHaveBeenCalled();
    expect(tracked.close).not.toHaveBeenCalled();
  });

  it('closes the underlying iterator once when a loop breaks', () => {
    const tracked = trackedIterable();
    const iterator = iterableToIterableIterator(tracked.source);
    for (const value of iterator) { expect(value).toBe(1); break; }
    expect(tracked.close).toHaveBeenCalledTimes(1);
    iterator.return!();
    expect(iterator.next().done).toBe(true);
    expect(tracked.close).toHaveBeenCalledTimes(1);
  });

  it('does not call return after natural exhaustion', () => {
    const tracked = trackedIterable();
    tracked.next.mockReturnValue({value: 99, done: true});
    const iterator = iterableToIterableIterator(tracked.source);
    expect(iterator.next()).toEqual({value: undefined, done: true});
    iterator.return!();
    expect(tracked.close).not.toHaveBeenCalled();
  });

  it.each(['start', 'next', 'close'] as const)('stays closed after an error in %s', operation => {
    const tracked = trackedIterable();
    tracked[operation].mockImplementation(() => { throw new Error('source failed'); });
    const iterator = iterableToIterableIterator(tracked.source);
    if (operation === 'close') iterator.next();
    expect(() => operation === 'close' ? iterator.return!() : iterator.next()).toThrow('source failed');
    expect(iterator.next().done).toBe(true);
    expect(() => iterator.return!()).not.toThrow();
  });

  it('rejects a non-object result from the underlying return method', () => {
    const tracked = trackedIterable();
    tracked.close.mockReturnValue(undefined as any);
    const iterator = iterableToIterableIterator(tracked.source);
    iterator.next();
    expect(() => iterator.return!()).toThrow(TypeError);
    expect(iterator.next().done).toBe(true);
  });

  it('forwards cleanup through mapped iterables, including readonly set entries', () => {
    const tracked = trackedIterable();
    const set = createReadonlySet({keys: () => tracked.source, has: () => true, size: () => 1});
    for (const entry of set.entries()) { expect(entry).toEqual([1, 1]); break; }
    expect(tracked.close).toHaveBeenCalledTimes(1);
    const mapped = iterableToIterableIterator(mapIterable(tracked.source, value => String(value)));
    expect(mapped.next().value).toBe('1');
    mapped.return!();
    expect(tracked.close).toHaveBeenCalledTimes(2);
  });

  const dispose = (Symbol as any).dispose as symbol | undefined;
  (dispose === undefined ? it.skip : it)('disposes started and unstarted iterators without starting or closing twice', () => {
    const tracked = trackedIterable();
    const unstarted: any = iterableToIterableIterator(tracked.source);
    unstarted[dispose!]();
    expect(tracked.start).not.toHaveBeenCalled();
    const started: any = iterableToIterableIterator(tracked.source);
    started.next();
    started[dispose!]();
    started[dispose!]();
    expect(tracked.close).toHaveBeenCalledTimes(1);
    expect(started.next().done).toBe(true);
  });

  const NativeIterator = (globalThis as any).Iterator;
  (NativeIterator === undefined ? it.skip : it)('inherits native helpers and lets take close its source', () => {
    const iterator: any = iterableToIterableIterator([1, 2, 3]);
    expect(iterator).toBeInstanceOf(NativeIterator);
    expect(iterator.map((n: number) => n * 2).filter((n: number) => n > 2).toArray()).toEqual([4, 6]);
    const tracked = trackedIterable();
    const limited: any = iterableToIterableIterator(tracked.source);
    expect(limited.take(2).toArray()).toEqual([1, 1]);
    expect(tracked.close).toHaveBeenCalledTimes(1);
    expect(limited.next().done).toBe(true);
  });
});
