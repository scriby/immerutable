import {hash} from './hash';
import {iterableToIterableIterator, mapIterable} from './util';

export interface IMap<K, V> {
  root: ITrieNode<K, V>,
  size: number;
}

export type Key = number | string;

export interface INumberIndexable<K, V> {
  [key: number]: ISingleValueNode<K, V>;
}

export interface IStringIndexable<K, V> {
  [key: string]: ISingleValueNode<K, V>;
}

export interface ITrieNode<K, V> {
  [index: number]: ITrieNode<K, V> | IMultiValueNode<K, V> | ISingleValueNode<K, V>;
  length: number;
}

export interface IMultiValueNode<K, V> {
  map: INumberIndexable<K, V> & IStringIndexable<K, V>;
}

export interface ISingleValueNode<K, V> {
  key: K;
  value: V;
}

/**
 * This adapter class can be used to interact with an Immerutable Map stored in the ngrx store.
 * Immerutable maps are very similar to maps provided by ImmutableJS. They use a trie structure
 * for structural sharing which allows for items to be inserted and removed without the need
 * to shallow copy the entire map. The keys used by this map may be strings or numbers only.
 *
 * Runtimes:
 * Get/Has: O(1)
 * Set: O(1)
 * Remove: O(1)
 * Iterate: O(n)
 * Note: The constant factor for these operations will be considerably higher than for standard maps.
 */
export class MapAdapter<K extends Key, V> {
  /** The number of bits to use per level of the trie. */
  protected shift = 4;
  /** The maximum length of an internal node in the map (containing value and child pointers). */
  protected trieNodeSize = 1 << this.shift;
  /** The mask used to grab the last "shift" bits from the key. */
  protected mask = this.trieNodeSize - 1;
  /** The maximum number of levels in the tree (when we've used up all the bits in the key). */
  protected maxDepth = Math.ceil(32 / this.shift);

  /**
   * Creates a new Immerutable map. This map should be stored in the ngrx store.
   * It should not be modified or read from directly. All interaction with this
   * map should happen through this adapter class.
   */
  create(): IMap<K, V> {
    return {
      root: this.createTrieNode(),
      size: 0,
    };
  }

  /** Returns true if the map contains the key, false otherwise. */
  has(map: IMap<K, V>, key: K): boolean {
    const {valueNode, depth} = this.lookupValueNode(map, key);

    if (valueNode === undefined) return false;

    if (depth < this.maxDepth) {
      return (valueNode as ISingleValueNode<K, V>).key === key;
    } else {
      return key in (valueNode as IMultiValueNode<K, V>).map;
    }
  }

  /** Gets the value for the specified key. If the key does not exist, undefined is returned. */
  get(map: IMap<K, V>, key: K): V|undefined {
    const {valueNode, depth} = this.lookupValueNode(map, key);

    if (valueNode === undefined) return;

    if (depth < this.maxDepth) {
      return (valueNode as ISingleValueNode<K, V>).key === key ? (valueNode as ISingleValueNode<K, V>).value : undefined;
    } else {
      const existing = (valueNode as IMultiValueNode<K, V>).map[key as any];

      return existing && existing.value;
    }
  }

  /**
   * Stores the specified value in the map using the specified key.
   * If the key already exists, it will be replaced with the new value.
   */
  set(map: IMap<K, V>, key: K, value: V): void {
    const {containingTrieNode, depth, index, valueNode} = this.lookupValueNode(map, key);

    if (valueNode === undefined) {
      map.size++;

      if (depth < this.maxDepth) {
        containingTrieNode[index] = this.createSingleValueNode(key, value);
      } else if (depth === this.maxDepth) {
        const newValueNode = containingTrieNode[index] = this.createValueNode();
        newValueNode.map[key as Key] = this.createSingleValueNode(key, value);
      }

      return;
    }

    if (depth < this.maxDepth) {
      // item already exists in single value node.
      if ((valueNode as ISingleValueNode<K, V>).key === key) {
        (valueNode as ISingleValueNode<K, V>).value = value;
      } else {
        this.pushSingleValueNodeDown(containingTrieNode, index, depth);
        return this.set(map, key, value);
      }
    } else {
      if (!(key in (valueNode as IMultiValueNode<K, V>).map)) {
        map.size++;
      }

      (valueNode as IMultiValueNode<K, V>).map[key as Key] = this.createSingleValueNode(key, value);
    }
  }

  /**
   * Removes the specified key from the map. If the key does not exist, this is a no-op.
   */
  remove(map: IMap<K, V>, key: K): void {
    const {containingTrieNode, depth, index, valueNode} = this.lookupValueNode(map, key);

    if (valueNode) {
      if (depth < this.maxDepth) {
        delete containingTrieNode[index];
        map.size--;
      } else if (key in (valueNode as IMultiValueNode<K, V>).map) {
        delete (valueNode as IMultiValueNode<K, V>).map[key as Key];
        map.size--;
      }
    }
  }

  /**
   * Updates the value of the specified key in the map using an updater function.
   * The updater function will receive the existing value, and may either mutate it directly
   * or return a new value, which will take its place.
   * If the key is not found, the updater function is not called and no update is made.
   *
   * Example:
   * ```
   * const adapter = new MapAdapter<number, { data: string }>();
   * const map = adapter.create();
   *
   * adapter.set(map, 1, { data: 'one' });
   * adapter.update(map, 1, (value) => { value.data = 'ichi'; });
   * ```
   */
  update(map: IMap<K, V>, key: K, updater: (item: V) => V|void|undefined): V|undefined {
    const {depth, valueNode} = this.lookupValueNode(map, key);
    if (valueNode === undefined) return;

    if (depth < this.maxDepth) {
      const value = (valueNode as ISingleValueNode<K, V>).value;
      const retVal = updater(value) as V|undefined;
      if (retVal !== undefined) {
        (valueNode as ISingleValueNode<K, V>).value = retVal;
        return retVal;
      } else {
        return value;
      }
    } else {
      const existing = (valueNode as IMultiValueNode<K, V>).map[key as Key];
      const value = existing && existing.value;
      const retVal = updater(value) as V|undefined;
      if (retVal !== undefined) {
        (valueNode as IMultiValueNode<K, V>).map[key as Key] = this.createSingleValueNode(key, retVal);
        return retVal;
      } else {
        return value;
      }
    }
  }

  /** Gets the number of keys in the map. */
  getSize(map: IMap<K, V>): number {
    return map.size;
  }

  /**
   * Returns an Iterable which can be used to iterate through all the keys & values in the map.
   * Order of iteration is not guaranteed, however it will be consistent across multiple iterations.
   * DO NOT add or remove items from the map while iterating!
   *
   * This method requires Symbol.iterator or a polyfill. If using Typescript and compiling to ES5, the
   * downlevelIteration setting is recommended. Note that the iterable can be passed to Array.from to convert
   * to an array (note that this incurs a larger performance and memory cost compared to just iterating).
   *
   * Example (ES6 or ES5 w/ downlevelIteration):
   * ```
   * const adapter = new MapAdapter<string, T>();
   * ...
   *
   * for ({key, value} of adapter.getIterable(map)) {
   *   console.log(key, value);
   * }
   * ```
   *
   * Example (old school):
   * ```
   * const adapter = new MapAdapter<string, T>();
   * ...
   *
   * const iterable = adapter.getIterable(map);
   * const iterator = iterable[Symbol.iterator](); // May need Symbol.iterator polyfill
   * let next: T;
   * while (!(next = iterator.next()).done) {
   *   const {key, value} = next.value;
   *   console.log(key, value);
   * }
   * ```
   */
  getIterable(map: IMap<K, V>): Iterable<[K, V]> {
    type Frame = {
      index: number,
      content: ITrieNode<K, V> | ISingleValueNode<K, V> | IMultiValueNode<K, V>,
    };

    return {
      [Symbol.iterator]: () => {
        const stack: Frame[] = [{ index: 0, content: map.root }];

        const traverseToFurthestLeft = (frame: Frame): ISingleValueNode<K, V>|undefined => {
          if (frame === undefined) return undefined;

          if (Array.isArray(frame.content)) {
            if (frame.index < frame.content.length) {
              const child = frame.content[frame.index++];
              if (child === undefined) {
                return traverseToFurthestLeft(frame);
              }

              const nextFrame = { content: child, index: 0 };
              stack.push(nextFrame);
              return traverseToFurthestLeft(nextFrame);
            } else {
              stack.pop();

              return traverseToFurthestLeft(stack[stack.length - 1]);
            }
          } else if ('value' in frame.content) {
            stack.pop();

            return frame.content as ISingleValueNode<K, V>;
          } else {
            stack.pop();
            const multiValueNode = frame.content as IMultiValueNode<K, V>;
            const nextContent = Object.keys(multiValueNode.map).map(key => multiValueNode.map[key]);
            const nextFrame = { content: nextContent, index: 0 };
            stack.push(nextFrame);

            return traverseToFurthestLeft(nextFrame);
          }
        };

        return {
          next: () => {
            const value = traverseToFurthestLeft(stack[stack.length - 1]);

            if (value !== undefined) {
              return {
                value: [value.key, value.value],
                done: false,
              };
            } else {
              return {
                value: undefined as any,
                done: true,
              };
            }
          }
        };
      }
    };
  }

  getValuesIterable(map: IMap<K, V>): Iterable<V> {
    return mapIterable(this.getIterable(map), (entry) => entry[1]);
  }

  getKeysIterable(map: IMap<K, V>): Iterable<K> {
    return mapIterable(this.getIterable(map), (entry) => entry[0]);
  }

  asReadonlyMap(map: IMap<K, V>): ReadonlyMap<K, V> {
    const readonlyMap: ReadonlyMap<K, V> = {
      [Symbol.iterator]: () => iterableToIterableIterator(this.getIterable(map))[Symbol.iterator](),
      entries: () => iterableToIterableIterator(this.getIterable(map)),
      keys: () => iterableToIterableIterator(this.getKeysIterable(map)),
      values: () => iterableToIterableIterator(this.getValuesIterable(map)),
      forEach: (callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: any) => {
        const iterator = readonlyMap.entries();
        while (true) {
          const next = iterator.next();
          if (next.done) break;
          callbackfn.call(thisArg, next.value[1], next.value[0], readonlyMap);
        }
      },
      get: (key: K) => this.get(map, key),
      has: (key: K) => this.has(map, key),
      size: this.getSize(map),
    };

    return readonlyMap;
  }

  keysAsReadonlySet(map: IMap<K, V>): ReadonlySet<K> {
    const readonlySet: ReadonlySet<K> = {
      [Symbol.iterator]: () => iterableToIterableIterator(this.getKeysIterable(map))[Symbol.iterator](),
      entries: () => iterableToIterableIterator(mapIterable(this.getKeysIterable(map), (key) => [key, key] as [K, K])),
      keys: () => iterableToIterableIterator(this.getKeysIterable(map)),
      values: () => iterableToIterableIterator(this.getKeysIterable(map)),
      forEach: (callbackfn: (value: K, key: K, set: ReadonlySet<K>) => void, thisArg?: any) => {
        const iterator = readonlySet.keys();
        while (true) {
          const next = iterator.next();
          if (next.done) break;
          callbackfn.call(thisArg, next.value, next.value, readonlySet);
        }
      },
      has: (key: K) =>  this.has(map, key),
      size: this.getSize(map),
    };

    return readonlySet;
  }

  private createTrieNode(): ITrieNode<K, V> {
    return [];
  }

  private createSingleValueNode(key: K, value: V) {
    return { key: key, value: value };
  }

  private createValueNode(): IMultiValueNode<K, V> {
    return {
      map: Object.create(null),
    };
  }

  private lookupValueNode(map: IMap<K, V>, key: K) {
    let hashCode = hash(key);
    let node: ITrieNode<K, V> = map.root;
    let index = 0;
    let depth = 1;
    let valueNode: IMultiValueNode<K, V> | ISingleValueNode<K, V> | undefined;

    while (depth <= this.maxDepth) {
      index = this.computePartialHashCode(hashCode, depth);
      depth++;

      let nextNode: ITrieNode<K, V> | IMultiValueNode<K, V> | ISingleValueNode<K, V> = node[index];
      if (nextNode === undefined) {
        valueNode = undefined;
        break;
      } else if (Array.isArray(nextNode)) {
        node = nextNode;
      } else {
        valueNode = nextNode as IMultiValueNode<K, V> | ISingleValueNode<K, V>;
        break;
      }
    }

    return { containingTrieNode: node, depth, index, valueNode };
  }

  private pushSingleValueNodeDown(trieNode: ITrieNode<K, V>, index: number, depth: number) {
    const singleValueNode = trieNode[index] as ISingleValueNode<K, V>;
    const newTrieNode = trieNode[index] = this.createTrieNode();
    const partialHash = this.computePartialHashCode(hash(singleValueNode.key), depth);

    if (depth === this.maxDepth - 1) {
      const newValueNode = newTrieNode[partialHash] = this.createValueNode();
      newValueNode.map[singleValueNode.key as Key] = singleValueNode;
    } else {
      newTrieNode[partialHash] = singleValueNode;
    }
  }

  private computePartialHashCode(hashCode: number, depth: number) {
    return (hashCode >> ((depth - 1) * this.shift)) & this.mask;
  }
}