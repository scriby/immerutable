import {hash} from './hash';
import {SingleValueNode} from '../dist/src/map';

export interface Map<K, V> {
  root: TrieNode<V>,
  size: number;
}

export type Key = number | string;

export interface NumberIndexable<V> {
  [key: number]: V;
}

export interface StringIndexable<V> {
  [key: string]: V;
}

export interface TrieNode<V> {
  [index: number]: TrieNode<V> | MultiValueNode<V> | SingleValueNode<V>;
  length: number;
}

export interface MultiValueNode<V> {
  map: NumberIndexable<V> & StringIndexable<V>;
}

export interface SingleValueNode<V> {
  key: Key;
  value: V;
}

const SHIFT = 4;
const TRIE_NODE_SIZE = 1 << SHIFT;
const MASK = TRIE_NODE_SIZE - 1;
const MAX_DEPTH = Math.ceil(32 / SHIFT);

export class MapAdapter<K, V> {
  create(): Map<K, V> {
    return {
      root: this.createTrieNode(),
      size: 0,
    };
  }

  has(map: Map<K, V>, key: Key): boolean {
    const {valueNode, depth} = this.lookupValueNode(map, key);

    if (valueNode === undefined) return false;

    if (depth < MAX_DEPTH) {
      return (valueNode as SingleValueNode<V>).key === key;
    } else {
      return key in valueNode;
    }
  }

  get(map: Map<K, V>, key: Key): V|undefined {
    const {valueNode, depth} = this.lookupValueNode(map, key);

    if (valueNode === undefined) return;

    if (depth < MAX_DEPTH) {
      return (valueNode as SingleValueNode<V>).value;
    } else {
      return (valueNode as MultiValueNode<V>).map[key as any];
    }
  }

  set(map: Map<K, V>, key: Key, value: V): void {
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

      (valueNode as MultiValueNode<V>).map[key] = value;
    }
  }

  remove(map: Map<K, V>, key: Key) {
    const {containingTrieNode, depth, index, valueNode} = this.lookupValueNode(map, key);

    if (valueNode) {
      if (depth < MAX_DEPTH) {
        delete containingTrieNode[index];
      } else {
        delete ((valueNode as MultiValueNode<V>).map)[key];
      }

      map.size--;
    }
  }

  update(map: Map<K, V>, key: Key, updater: (item: V) => void) {
    const {depth, valueNode} = this.lookupValueNode(map, key);

    if (valueNode) {
      if (depth < MAX_DEPTH) {
        updater((valueNode as SingleValueNode<V>).value);
      } else {
        updater((valueNode as MultiValueNode<V>).map[key]);
      }
    }
  }

  private createTrieNode(): TrieNode<V> {
    return [];
  }

  private createSingleValueNode(key: Key, value: V) {
    return { 'key': key, 'value': value };
  }

  private createValueNode(): MultiValueNode<V> {
    return {
      map: Object.create(null),
    };
  }

  private lookupValueNode(map: Map<K, V>, key: Key) {
    let hashCode = hash(key.toString());
    let node: TrieNode<V> = map.root;
    let index = 0;
    let depth = 1;
    let valueNode: MultiValueNode<V> | SingleValueNode<V> | undefined;

    while (depth <= MAX_DEPTH) {
      index = this.computePartialHashCode(hashCode, depth);
      depth++;

      let nextNode: TrieNode<V> | MultiValueNode<V> | SingleValueNode<V> = node[index];
      if (nextNode === undefined) {
        valueNode = undefined;
        break;
      } else if (Array.isArray(nextNode)) {
        node = nextNode;
      } else {
        valueNode = nextNode as MultiValueNode<V> | SingleValueNode<V>;
        break;
      }
    }

    return { containingTrieNode: node, depth, index, valueNode };
  }

  private pushSingleValueNodeDown(trieNode: TrieNode<V>, index: number, depth: number) {
    const singleValueNode = trieNode[index] as SingleValueNode<V>;
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