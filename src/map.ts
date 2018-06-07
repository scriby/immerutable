import {hash} from './hash';

export interface IMap<K, V> {
  root: ITrieNode<K, V>,
  size: number;
}

export type Key = number | string;

export interface INumberIndexable<V> {
  [key: number]: V;
}

export interface IStringIndexable<V> {
  [key: string]: V;
}

export interface ITrieNode<K, V> {
  [index: number]: ITrieNode<K, V> | IMultiValueNode<V> | ISingleValueNode<K, V>;
  length: number;
}

export interface IMultiValueNode<V> {
  map: INumberIndexable<V> & IStringIndexable<V>;
}

export interface ISingleValueNode<K, V> {
  key: K;
  value: V;
}

const SHIFT = 4;
const TRIE_NODE_SIZE = 1 << SHIFT;
const MASK = TRIE_NODE_SIZE - 1;
const MAX_DEPTH = Math.ceil(32 / SHIFT);

export class MapAdapter<K extends Key, V> {
  create(): IMap<K, V> {
    return {
      root: this.createTrieNode(),
      size: 0,
    };
  }

  has(map: IMap<K, V>, key: K): boolean {
    const {valueNode, depth} = this.lookupValueNode(map, key);

    if (valueNode === undefined) return false;

    if (depth < MAX_DEPTH) {
      return (valueNode as ISingleValueNode<K, V>).key === key;
    } else {
      return key in (valueNode as IMultiValueNode<V>).map;
    }
  }

  get(map: IMap<K, V>, key: K): V|undefined {
    const {valueNode, depth} = this.lookupValueNode(map, key);

    if (valueNode === undefined) return;

    if (depth < MAX_DEPTH) {
      return (valueNode as ISingleValueNode<K, V>).key === key ? (valueNode as ISingleValueNode<K, V>).value : undefined;
    } else {
      return (valueNode as IMultiValueNode<V>).map[key as any];
    }
  }

  set(map: IMap<K, V>, key: K, value: V): void {
    const {containingTrieNode, depth, index, valueNode} = this.lookupValueNode(map, key);

    if (valueNode === undefined) {
      map.size++;

      if (depth < MAX_DEPTH) {
        containingTrieNode[index] = this.createSingleValueNode(key, value);
      } else if (depth === MAX_DEPTH) {
        const newValueNode = containingTrieNode[index] = this.createValueNode();
        newValueNode.map[key as Key] = value;
      }

      return;
    }

    if (depth < MAX_DEPTH) {
      if ((valueNode as ISingleValueNode<K, V>).key === key) {
        return; // Item already exists in single value node.
      }

      this.pushSingleValueNodeDown(containingTrieNode, index, depth);
      return this.set(map, key, value);
    } else {
      if (!(key in (valueNode as IMultiValueNode<V>).map)) {
        map.size++;
        (valueNode as IMultiValueNode<V>).map[key as Key] = value;
      }
    }
  }

  remove(map: IMap<K, V>, key: K): void {
    const {containingTrieNode, depth, index, valueNode} = this.lookupValueNode(map, key);

    if (valueNode) {
      if (depth < MAX_DEPTH) {
        delete containingTrieNode[index];
        map.size--;
      } else if (key in (valueNode as IMultiValueNode<V>).map) {
        delete (valueNode as IMultiValueNode<V>).map[key as Key];
        map.size--;
      }
    }
  }

  update(map: IMap<K, V>, key: K, updater: (item: V) => V|void|undefined): V|undefined {
    const {depth, valueNode} = this.lookupValueNode(map, key);
    if (valueNode === undefined) return;

    if (depth < MAX_DEPTH) {
      const value = (valueNode as ISingleValueNode<K, V>).value;
      const retVal = updater(value);
      if (retVal !== undefined) {
        (valueNode as ISingleValueNode<K, V>).value = retVal;
        return retVal;
      } else {
        return value;
      }
    } else {
      const value = (valueNode as IMultiValueNode<V>).map[key as Key];
      const retVal = updater(value);
      if (retVal !== undefined) {
        (valueNode as IMultiValueNode<V>).map[key as Key] = retVal;
        return retVal;
      } else {
        return value;
      }
    }
  }

  getSize(map: IMap<K, V>): number {
    return map.size;
  }

  private createTrieNode(): ITrieNode<K, V> {
    return [];
  }

  private createSingleValueNode(key: K, value: V) {
    return { key: key, value: value };
  }

  private createValueNode(): IMultiValueNode<V> {
    return {
      map: Object.create(null),
    };
  }

  private lookupValueNode(map: IMap<K, V>, key: K) {
    let hashCode = hash(key.toString());
    let node: ITrieNode<K, V> = map.root;
    let index = 0;
    let depth = 1;
    let valueNode: IMultiValueNode<V> | ISingleValueNode<K, V> | undefined;

    while (depth <= MAX_DEPTH) {
      index = this.computePartialHashCode(hashCode, depth);
      depth++;

      let nextNode: ITrieNode<K, V> | IMultiValueNode<V> | ISingleValueNode<K, V> = node[index];
      if (nextNode === undefined) {
        valueNode = undefined;
        break;
      } else if (Array.isArray(nextNode)) {
        node = nextNode;
      } else {
        valueNode = nextNode as IMultiValueNode<V> | ISingleValueNode<K, V>;
        break;
      }
    }

    return { containingTrieNode: node, depth, index, valueNode };
  }

  private pushSingleValueNodeDown(trieNode: ITrieNode<K, V>, index: number, depth: number) {
    const singleValueNode = trieNode[index] as ISingleValueNode<K, V>;
    const newTrieNode = trieNode[index] = this.createTrieNode();
    const partialHash = this.computePartialHashCode(hash(singleValueNode.key.toString()), depth);

    if (depth === MAX_DEPTH - 1) {
      const newValueNode = newTrieNode[partialHash] = this.createValueNode();
      newValueNode.map[singleValueNode.key as Key] = singleValueNode.value;
    } else {
      newTrieNode[partialHash] = singleValueNode;
    }
  }

  private computePartialHashCode(hashCode: number, depth: number) {
    return (hashCode >> ((depth - 1) * SHIFT)) & MASK;
  }

  getIterable(map: IMap<K, V>): Iterable<ISingleValueNode<K, V>> {
    type Frame = {
      index: number,
      content: ITrieNode<K, V> | ISingleValueNode<K, V> | IMultiValueNode<V>,
    };
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
        const multiValueNode = frame.content as IMultiValueNode<V>;
        //TODO: Do something about this converting keys to string.
        const nextContent = Object.keys(multiValueNode.map).map(key => this.createSingleValueNode(key as any, multiValueNode.map[key]));
        const nextFrame = { content: nextContent, index: 0 };
        stack.push(nextFrame);

        return traverseToFurthestLeft(nextFrame);
      }
    };

    return {
      [Symbol.iterator]: () => {
        return {
          next: () => {
            const value = traverseToFurthestLeft(stack[stack.length - 1]);

            if (value !== undefined) {
              return {
                value: value as ISingleValueNode<K, V>,
                done: false,
              };
            } else {
              return {
                value: undefined as any as ISingleValueNode<K, V>,
                done: true,
              };
            }
          }
        };
      }
    };
  }
}