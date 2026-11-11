import {hash} from './hash';
import {checkLayout, occupiedSlots, readSlot, slotName} from './slots';
import {createReadonlyMap, createReadonlySet, isDraft, sameValueZero, untouched} from './util';

const hasOwn = Object.prototype.hasOwnProperty;

// A JSON-restored bucket is an ordinary object: assigning a `__proto__` key
// would replace its prototype, and other Object.prototype names are inherited.
// Escape those names, and the escape prefix itself.
function bucketKey(key: Key): Key {
  return typeof key === 'string' && (key.charCodeAt(0) === 0 || hasOwn.call(Object.prototype, key)) ? '\0' + key : key;
}

// A number and its decimal string (1.5 and '1.5') share a bucket property name.
// When both are in one bucket, whichever arrives second uses this secondary
// name. It cannot clash with an escaped name: decimal strings never begin with
// NUL and are never Object.prototype names.
function twinBucketKey(key: Key): string {
  return '\0' + key;
}

export interface IMap<K, V> {
  // Keep every access to 'root' quoted: untouched (util.ts) looks it up by
  // name, so a minifier must not rename it.
  'root': ITrieNode<K, V>,
  size: number;
}

export type Key = number | string;

export interface INumberIndexable<K, V> {
  [key: number]: ISingleValueNode<K, V>;
}

export interface IStringIndexable<K, V> {
  [key: string]: ISingleValueNode<K, V>;
}

/** The number of bits of the hash used per level of the trie. */
const SHIFT = 4;
/** The number of slots in a trie node. createTrieNode and occupiedSlots (slots.ts) spell them out. */
const TRIE_NODE_SIZE = 1 << SHIFT;
/** The mask used to grab the last SHIFT bits of the hash. */
const MASK = TRIE_NODE_SIZE - 1;

/** A trie node is an object with one property per slot, named as slots.ts describes. */
export interface ITrieNode<K, V> {
  [slot: string]: ITrieNode<K, V> | IMultiValueNode<K, V> | ISingleValueNode<K, V>;
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
  /** The maximum number of levels in the tree (when we've used up all the bits in the key). */
  protected maxDepth = Math.ceil(32 / SHIFT);

  /**
   * Creates a new Immerutable map. This map should be stored in the ngrx store.
   * It should not be modified or read from directly. All interaction with this
   * map should happen through this adapter class.
   */
  create(): IMap<K, V> {
    return {
      'root': this.createTrieNode(),
      size: 0,
    };
  }

  /** Returns true if the map contains the key, false otherwise. */
  has(map: IMap<K, V>, key: K): boolean {
    // Until something reaches the trie through a draft, it is read from the
    // state the draft was created from, which creates no drafts.
    return this.entryIn(untouched(map, 'root') || map['root'], key) !== undefined;
  }

  /** Gets the value for the specified key. If the key does not exist, undefined is returned. */
  get(map: IMap<K, V>, key: K): V|undefined {
    const entry = this.lookupEntry(map, key);
    return entry === undefined ? undefined : entry.value;
  }

  /** For adapter composition: presence must be independent of an undefined value. */
  protected lookupEntry(map: IMap<K, V>, key: K): ISingleValueNode<K, V>|undefined {
    return this.entryIn(map['root'], key);
  }

  private entryIn(root: ITrieNode<K, V>, key: K): ISingleValueNode<K, V>|undefined {
    const {valueNode, depth} = this.lookupValueNode(root, key);

    if (valueNode === undefined) return;

    if (depth < this.maxDepth) {
      const entry = valueNode as ISingleValueNode<K, V>;
      return sameValueZero(entry.key, key) ? entry : undefined;
    } else {
      return this.getBucketEntry(valueNode as IMultiValueNode<K, V>, key);
    }
  }

  /**
   * Stores the specified value in the map using the specified key.
   * If the key already exists, it will be replaced with the new value.
   */
  set(map: IMap<K, V>, key: K, value: V): void {
    // An entry is recognized by its key (see lookupValueNode), so it needs one.
    if (key === undefined) throw new TypeError('A map key must be a number or a string');
    const {containingTrieNode, depth, index, valueNode} = this.lookupValueNode(map['root'], key);

    if (valueNode === undefined) {
      map.size++;

      if (depth < this.maxDepth) {
        containingTrieNode[slotName(index)] = this.createSingleValueNode(key, value);
      } else if (depth === this.maxDepth) {
        const newValueNode = containingTrieNode[slotName(index)] = this.createValueNode();
        newValueNode.map[bucketKey(key)] = this.createSingleValueNode(key, value);
      }

      return;
    }

    if (depth < this.maxDepth) {
      // item already exists in single value node.
      if (sameValueZero((valueNode as ISingleValueNode<K, V>).key, key)) {
        (valueNode as ISingleValueNode<K, V>).value = value;
      } else {
        this.pushSingleValueNodeDown(containingTrieNode, index, depth);
        return this.set(map, key, value);
      }
    } else {
      const bucket = valueNode as IMultiValueNode<K, V>;
      let property = this.findBucketProperty(bucket, key);
      if (property === undefined) {
        map.size++;
        // A miss with the primary name occupied means the other twin holds it.
        property = hasOwn.call(bucket.map, bucketKey(key)) ? twinBucketKey(key) : bucketKey(key);
      }
      bucket.map[property] = this.createSingleValueNode(key, value);
    }
  }

  /**
   * Removes the specified key from the map. If the key does not exist, this is a no-op.
   */
  remove(map: IMap<K, V>, key: K): void {
    const {containingTrieNode, depth, index, valueNode} = this.lookupValueNode(map['root'], key);

    if (valueNode) {
      if (depth < this.maxDepth) {
        if (!sameValueZero((valueNode as ISingleValueNode<K, V>).key, key)) return;
        // Clear the slot rather than deleting it, so the node keeps its shape.
        containingTrieNode[slotName(index)] = undefined as any;
        map.size--;
      } else {
        const bucket = valueNode as IMultiValueNode<K, V>;
        const property = this.findBucketProperty(bucket, key);
        if (property === undefined) return;
        delete bucket.map[property];
        map.size--;
        // Promote a waiting twin into the primary name (see findBucketProperty).
        if (property === bucketKey(key)) {
          const twin = twinBucketKey(key);
          if (hasOwn.call(bucket.map, twin)) {
            bucket.map[property] = bucket.map[twin];
            delete bucket.map[twin];
          }
        }
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
    const entry = this.lookupEntry(map, key);
    if (entry === undefined) return;

    const value = entry.value;
    const retVal = updater(value) as V|undefined;
    if (retVal === undefined) return value;

    entry.value = retVal;
    return retVal;
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
   * for (const [key, value] of adapter.getIterable(map)) {
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
   * let next: IteratorResult<[string, T]>;
   * while (!(next = iterator.next()).done) {
   *   const [key, value] = next.value;
   *   console.log(key, value);
   * }
   * ```
   */
  getIterable(map: IMap<K, V>): Iterable<[K, V]> {
    return this.createEntryIterable(map, (entry) => [entry.key, entry.value] as [K, V]);
  }

  getValuesIterable(map: IMap<K, V>): Iterable<V> {
    return this.createEntryIterable(map, (entry) => entry.value);
  }

  getKeysIterable(map: IMap<K, V>): Iterable<K> {
    return this.createEntryIterable(map, (entry) => entry.key);
  }

  private createEntryIterable<R>(map: IMap<K, V>, project: (entry: ISingleValueNode<K, V>) => R): Iterable<R> {
    return {
      [Symbol.iterator]: () => {
        // The path of trie nodes being visited, as parallel arrays by depth.
        // Iterative, so the number of empty slots skipped cannot exhaust the
        // call stack. A draft is read slot by slot, so that only the slots
        // reached are drafted. A plain node's occupied slots are listed at once
        // (into a list reused for its depth), which is faster. An entry
        // removed after its node was listed is therefore still visited:
        // removing while iterating is not supported.
        const drafts: Array<ITrieNode<K, V>|undefined> = [];
        const lists: any[][] = [];
        const counts: number[] = [];
        const indices: number[] = [];
        let depth = -1;
        const enter = (node: ITrieNode<K, V>) => {
          depth++;
          indices[depth] = 0;
          if (isDraft(node)) {
            drafts[depth] = node;
            counts[depth] = TRIE_NODE_SIZE;
          } else {
            drafts[depth] = undefined;
            counts[depth] = occupiedSlots(node, lists[depth] || (lists[depth] = []));
          }
        };
        checkLayout(map['root']);
        enter(map['root']);
        let bucket: ISingleValueNode<K, V>[]|undefined;
        let bucketIndex = 0;

        const nextEntry = (): ISingleValueNode<K, V>|undefined => {
          if (bucket !== undefined) {
            if (bucketIndex < bucket.length) return bucket[bucketIndex++];
            bucket = undefined;
          }

          while (depth >= 0) {
            const index = indices[depth];
            if (index >= counts[depth]) {
              depth--;
              continue;
            }

            indices[depth] = index + 1;
            const draft = drafts[depth];
            const child = draft === undefined ? lists[depth][index] : readSlot(draft, index);
            if (child == null) continue;

            if ((child as ISingleValueNode<K, V>).key !== undefined) {
              // Test the key: JSON drops an undefined value, leaving only {key}.
              return child as ISingleValueNode<K, V>;
            } else if ((child as IMultiValueNode<K, V>).map === undefined) {
              enter(child as ITrieNode<K, V>);
            } else {
              const entries = (child as IMultiValueNode<K, V>).map;
              const properties = Object.keys(entries);
              if (properties.length === 0) continue;
              bucket = [];
              for (let i = 0; i < properties.length; i++) bucket.push(entries[properties[i]]);
              bucketIndex = 1;
              return bucket[0];
            }
          }

          return undefined;
        };

        return {
          next: (): IteratorResult<R> => {
            const entry = nextEntry();
            return entry !== undefined ? { value: project(entry), done: false } : { value: undefined as any, done: true };
          }
        };
      }
    };
  }

  asReadonlyMap(map: IMap<K, V>): ReadonlyMap<K, V> {
    return createReadonlyMap<K, V>({
      entries: () => this.getIterable(map),
      keys: () => this.getKeysIterable(map),
      values: () => this.getValuesIterable(map),
      get: (key) => this.get(map, key),
      has: (key) => this.has(map, key),
      size: () => this.getSize(map),
    });
  }

  keysAsReadonlySet(map: IMap<K, V>): ReadonlySet<K> {
    return createReadonlySet<K>({
      keys: () => this.getKeysIterable(map),
      has: (key) => this.has(map, key),
      size: () => this.getSize(map),
    });
  }

  private createTrieNode(): ITrieNode<K, V> {
    // Every slot is present from the start (and is cleared, never deleted), so
    // all trie nodes share one shape, which V8 copies fastest. Building nodes
    // slot by slot measured about 30% slower in producers.
    const none: any = undefined;
    return {
      '#0': none, '#1': none, '#2': none, '#3': none, '#4': none, '#5': none, '#6': none, '#7': none,
      '#8': none, '#9': none, '#a': none, '#b': none, '#c': none, '#d': none, '#e': none, '#f': none,
    };
  }

  private createSingleValueNode(key: K, value: V) {
    return { key: key, value: value };
  }

  private createValueNode(): IMultiValueNode<K, V> {
    return {
      map: Object.create(null),
    };
  }

  private getBucketEntry(bucket: IMultiValueNode<K, V>, key: K): ISingleValueNode<K, V>|undefined {
    const property = this.findBucketProperty(bucket, key);
    return property === undefined ? undefined : bucket.map[property];
  }

  /** Returns the bucket property holding the entry for key, or undefined if it is absent. */
  private findBucketProperty(bucket: IMultiValueNode<K, V>, key: K): Key|undefined {
    const entries = bucket.map;
    const property = bucketKey(key);
    // The twin name is only occupied while the primary name holds the other
    // twin (remove promotes it), so an empty primary name means a miss.
    if (!hasOwn.call(entries, property)) return undefined;
    if (sameValueZero(entries[property].key, key)) return property;
    const twin = twinBucketKey(key);
    return hasOwn.call(entries, twin) ? twin : undefined;
  }

  private lookupValueNode(root: ITrieNode<K, V>, key: K) {
    checkLayout(root);
    let hashCode = hash(key);
    let node = root;
    let index = 0;
    let depth = 1;
    let valueNode: IMultiValueNode<K, V> | ISingleValueNode<K, V> | undefined;

    while (depth <= this.maxDepth) {
      index = this.computePartialHashCode(hashCode, depth);
      depth++;

      let nextNode: ITrieNode<K, V> | IMultiValueNode<K, V> | ISingleValueNode<K, V> = readSlot(node, index);
      if (nextNode == null) {
        valueNode = undefined;
        break;
      } else if (depth < this.maxDepth && (nextNode as ISingleValueNode<K, V>).key === undefined) {
        // Above the bucket level, a child without a key is a trie node.
        node = nextNode as ITrieNode<K, V>;
      } else {
        valueNode = nextNode as IMultiValueNode<K, V> | ISingleValueNode<K, V>;
        break;
      }
    }

    return { containingTrieNode: node, depth, index, valueNode };
  }

  private pushSingleValueNodeDown(trieNode: ITrieNode<K, V>, index: number, depth: number) {
    const singleValueNode = readSlot(trieNode, index) as ISingleValueNode<K, V>;
    const newTrieNode = trieNode[slotName(index)] = this.createTrieNode();
    const partialHash = slotName(this.computePartialHashCode(hash(singleValueNode.key), depth));

    if (depth === this.maxDepth - 1) {
      const newValueNode = newTrieNode[partialHash] = this.createValueNode();
      newValueNode.map[bucketKey(singleValueNode.key)] = singleValueNode;
    } else {
      newTrieNode[partialHash] = singleValueNode;
    }
  }

  private computePartialHashCode(hashCode: number, depth: number) {
    return (hashCode >> ((depth - 1) * SHIFT)) & MASK;
  }
}

/**
 * For the adapters built on a map: exposes entry lookup, so a missing key and
 * a stored undefined value are told apart with one lookup. Not exported from
 * the package.
 */
export class EntryMapAdapter<K extends Key, V> extends MapAdapter<K, V> {
  findEntry(map: IMap<K, V>, key: K): ISingleValueNode<K, V>|undefined {
    return this.lookupEntry(map, key);
  }
}
