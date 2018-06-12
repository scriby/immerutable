import {hash} from './hash';

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

export class MapAdapter<K extends Key, V> {
  protected shift = 4;
  protected trieNodeSize = 1 << this.shift;
  protected mask = this.trieNodeSize - 1;
  protected maxDepth = Math.ceil(32 / this.shift);

  create(): IMap<K, V> {
    return {
      root: this.createTrieNode(),
      size: 0,
    };
  }

  has(map: IMap<K, V>, key: K): boolean {
    const {valueNode, depth} = this.lookupValueNode(map, key);

    if (valueNode === undefined) return false;

    if (depth < this.maxDepth) {
      return (valueNode as ISingleValueNode<K, V>).key === key;
    } else {
      return key in (valueNode as IMultiValueNode<K, V>).map;
    }
  }

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

  update(map: IMap<K, V>, key: K, updater: (item: V) => V|void|undefined): V|undefined {
    const {depth, valueNode} = this.lookupValueNode(map, key);
    if (valueNode === undefined) return;

    if (depth < this.maxDepth) {
      const value = (valueNode as ISingleValueNode<K, V>).value;
      const retVal = updater(value);
      if (retVal !== undefined) {
        (valueNode as ISingleValueNode<K, V>).value = retVal;
        return retVal;
      } else {
        return value;
      }
    } else {
      const existing = (valueNode as IMultiValueNode<K, V>).map[key as Key];
      const value = existing && existing.value;
      const retVal = updater(value);
      if (retVal !== undefined) {
        (valueNode as IMultiValueNode<K, V>).map[key as Key] = this.createSingleValueNode(key, retVal);
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

  getIterable(map: IMap<K, V>): Iterable<ISingleValueNode<K, V>> {
    type Frame = {
      index: number,
      content: ITrieNode<K, V> | ISingleValueNode<K, V> | IMultiValueNode<K, V>,
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
        const multiValueNode = frame.content as IMultiValueNode<K, V>;
        const nextContent = Object.keys(multiValueNode.map).map(key => multiValueNode.map[key]);
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