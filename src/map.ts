import {hash} from './hash';

export interface IMap<K, V> {
  root: ITrieNode<V>,
  size: number;
}

export type Key = number | string;

export interface INumberIndexable<V> {
  [key: number]: V;
}

export interface IStringIndexable<V> {
  [key: string]: V;
}

export interface ITrieNode<V> {
  [index: number]: ITrieNode<V> | IMultiValueNode<V> | ISingleValueNode<V>;
  length: number;
}

export interface IMultiValueNode<V> {
  map: INumberIndexable<V> & IStringIndexable<V>;
}

export interface ISingleValueNode<V> {
  key: Key;
  value: V;
}

const SHIFT = 4;
const TRIE_NODE_SIZE = 1 << SHIFT;
const MASK = TRIE_NODE_SIZE - 1;
const MAX_DEPTH = Math.ceil(32 / SHIFT);

export class MapAdapter<K, V> {
  create(): IMap<K, V> {
    return {
      root: this.createTrieNode(),
      size: 0,
    };
  }

  has(map: IMap<K, V>, key: Key): boolean {
    const {valueNode, depth} = this.lookupValueNode(map, key);

    if (valueNode === undefined) return false;

    if (depth < MAX_DEPTH) {
      return (valueNode as ISingleValueNode<V>).key === key;
    } else {
      return key in valueNode;
    }
  }

  get(map: IMap<K, V>, key: Key): V|undefined {
    const {valueNode, depth} = this.lookupValueNode(map, key);

    if (valueNode === undefined) return;

    if (depth < MAX_DEPTH) {
      return (valueNode as ISingleValueNode<V>).key === key ? (valueNode as ISingleValueNode<V>).value : undefined;
    } else {
      return (valueNode as IMultiValueNode<V>).map[key as any];
    }
  }

  set(map: IMap<K, V>, key: Key, value: V): void {
    const {containingTrieNode, depth, index, valueNode} = this.lookupValueNode(map, key);

    if (valueNode === undefined) {
      map.size++;

      if (depth < MAX_DEPTH) {
        containingTrieNode[index] = this.createSingleValueNode(key, value);
      } else if (depth === MAX_DEPTH) {
        const newValueNode = containingTrieNode[index] = this.createValueNode();
        newValueNode.map[key] = value;
      }

      return;
    }

    if (depth < MAX_DEPTH) {
      this.pushSingleValueNodeDown(containingTrieNode, index, depth);
      return this.set(map, key, value);
    } else {
      if (!(key in valueNode)) {
        map.size++;
      }

      (valueNode as IMultiValueNode<V>).map[key] = value;
    }
  }

  remove(map: IMap<K, V>, key: Key): void {
    const {containingTrieNode, depth, index, valueNode} = this.lookupValueNode(map, key);

    if (valueNode) {
      if (depth < MAX_DEPTH) {
        delete containingTrieNode[index];
      } else {
        delete ((valueNode as IMultiValueNode<V>).map)[key];
      }

      map.size--;
    }
  }

  update(map: IMap<K, V>, key: Key, updater: (item: V) => V|void|undefined): V|undefined {
    const {depth, valueNode} = this.lookupValueNode(map, key);
    if (valueNode === undefined) return;

    if (depth < MAX_DEPTH) {
      const value = (valueNode as ISingleValueNode<V>).value;
      const retVal = updater(value);
      if (retVal !== undefined) {
        (valueNode as ISingleValueNode<V>).value = retVal;
        return retVal;
      } else {
        return value;
      }
    } else {
      const value = (valueNode as IMultiValueNode<V>).map[key];
      const retVal = updater(value);
      if (retVal !== undefined) {
        (valueNode as IMultiValueNode<V>).map[key] = retVal;
        return retVal;
      } else {
        return value;
      }
    }
  }

  getSize(map: IMap<K, V>): number {
    return map.size;
  }

  private createTrieNode(): ITrieNode<V> {
    return [];
  }

  private createSingleValueNode(key: Key, value: V) {
    return { 'key': key, 'value': value };
  }

  private createValueNode(): IMultiValueNode<V> {
    return {
      map: Object.create(null),
    };
  }

  private lookupValueNode(map: IMap<K, V>, key: Key) {
    let hashCode = hash(key.toString());
    let node: ITrieNode<V> = map.root;
    let index = 0;
    let depth = 1;
    let valueNode: IMultiValueNode<V> | ISingleValueNode<V> | undefined;

    while (depth <= MAX_DEPTH) {
      index = this.computePartialHashCode(hashCode, depth);
      depth++;

      let nextNode: ITrieNode<V> | IMultiValueNode<V> | ISingleValueNode<V> = node[index];
      if (nextNode === undefined) {
        valueNode = undefined;
        break;
      } else if (Array.isArray(nextNode)) {
        node = nextNode;
      } else {
        valueNode = nextNode as IMultiValueNode<V> | ISingleValueNode<V>;
        break;
      }
    }

    return { containingTrieNode: node, depth, index, valueNode };
  }

  private pushSingleValueNodeDown(trieNode: ITrieNode<V>, index: number, depth: number) {
    const singleValueNode = trieNode[index] as ISingleValueNode<V>;
    const newTrieNode = trieNode[index] = this.createTrieNode();
    const partialHash = this.computePartialHashCode(hash(singleValueNode.key.toString()), depth);

    if (depth === MAX_DEPTH - 1) {
      const newValueNode = newTrieNode[partialHash] = this.createValueNode();
      newValueNode.map[singleValueNode.key] = singleValueNode.value;
    } else {
      newTrieNode[partialHash] = singleValueNode;
    }
  }

  private computePartialHashCode(hashCode: number, depth: number) {
    return (hashCode >> ((depth - 1) * SHIFT)) & MASK;
  }
}