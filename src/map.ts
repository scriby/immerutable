import {hash} from './hash';

export interface Map<K, V> {
  root: TrieNode<V>,
  size: number;
}

export type Key = number | string;

export interface NumberIndexable<T> {
  [key: number]: T;
}

export interface StringIndexable<T> {
  [key: string]: T;
}

export interface TrieNode<T> {
  [index: number]: TrieNode<T> | ValueNode<T>;
  length: number;
}

export type ValueNode<T> = NumberIndexable<T> & StringIndexable<T>;

const SHIFT = 5;
const TRIE_NODE_SIZE = 1 << SHIFT;
const MASK = TRIE_NODE_SIZE - 1;
const DEPTH = Math.ceil(TRIE_NODE_SIZE / SHIFT);

export function createMap<K extends Key, V>(): Map<K, V> {
  return {
    root: createTrieNode(),
    size: 0,
  };
}

export function hasInMap<K extends Key, V>(map: Map<K, V>, key: K): boolean {
  const {valueNode} = getValueNodePath(map, key);

  return key in valueNode;
}

export function getInMap<K extends Key, V>(map: Map<K, V>, key: K): V|undefined {
  const {valueNode} = getValueNodePath(map, key);

  return valueNode[key as any];
}

export function setInMap<K extends Key, V>(map: Map<K, V>, key: Key, value: V): Map<K, V> {
  const {path, valueNode} = getValueNodePath(map, key);
  const existingValue = valueNode[key];

  if (existingValue === value) {
    return map;
  }

  const newValueNode = {
    ...valueNode,
    [key]: value,
  };
  let prev: TrieNode<V> | ValueNode<V> = newValueNode;

  for (let i = DEPTH - 1; i >= 0; i--) {
    const next = path[i].node.slice();
    next[path[i].index] = prev;

    prev = next;
  }

  return {
    root: prev as TrieNode<V>,
    size: map.size + 1,
  };
}

function createTrieNode<V>(): TrieNode<V> {
  return new Array(TRIE_NODE_SIZE);
}

function createValueNode<V>(): ValueNode<V> {
  return Object.create(null);
}

function getValueNodePath<K extends Key, V>(map: Map<K, V>, key: Key) {
  const path = new Array(DEPTH);
  let hashCode = hash(key);
  let node: TrieNode<V> | ValueNode<V> = map.root;

  for (let i = 0; i < DEPTH; i++) {
    const index = hashCode & MASK;
    hashCode >>= SHIFT;

    let nextNode: TrieNode<V> | ValueNode<V> = node[index] as any;
    if (!nextNode) {
      if (i === DEPTH - 1) {
        nextNode = node[index] = createValueNode<V>();
      } else {
        nextNode = node[index] = createTrieNode<V>();
      }
    }

    path[i] = {index, node};
    node = nextNode;
  }

  return {
    valueNode: node as ValueNode<V>,
    path,
  };
}