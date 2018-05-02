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

export interface ValueNode<T> {
  size: number;

  map: NumberIndexable<T> & StringIndexable<T>;
}

const SHIFT = 5;
const TRIE_NODE_SIZE = 1 << SHIFT;
const MASK = TRIE_NODE_SIZE - 1;
const MAX_DEPTH = Math.ceil(TRIE_NODE_SIZE / SHIFT);

const MAX_VALUE_NODE_SIZE = TRIE_NODE_SIZE;

export function createMap<K extends Key, V>(): Map<K, V> {
  return {
    root: createTrieNode(),
    size: 0,
  };
}

export function hasInMap<K extends Key, V>(map: Map<K, V>, key: K): boolean {
  const {valueNode} = lookupValueNode(map, key);

  return key in valueNode.map;
}

export function getInMap<K extends Key, V>(map: Map<K, V>, key: K): V|undefined {
  const {valueNode} = lookupValueNode(map, key);

  return valueNode.map[key as any];
}

export function setInMap<K extends Key, V>(map: Map<K, V>, key: Key, value: V): void {
  const {containingTrieNode, depth, valueNode} = lookupValueNode(map, key);
  const exists = key in valueNode.map;

  if (exists) return;

  if (valueNode.size >= MAX_VALUE_NODE_SIZE && depth < MAX_DEPTH) {
    const newTrieNode = splitValueNode(valueNode, depth);
    containingTrieNode[computePartialHashCode(hash(key.toString()), depth - 1)] = newTrieNode;

    this.setInMap(map, key, value);
    return;
  }

  valueNode.map[key] = value;
  valueNode.size++;
}

function createTrieNode<V>(): TrieNode<V> {
  return new Array(TRIE_NODE_SIZE);
}

function createValueNode<V>(): ValueNode<V> {
  return {
    size: 0,
    map: Object.create(null),
  };
}

function lookupValueNode<K extends Key, V>(map: Map<K, V>, key: Key) {
  let hashCode = hash(key.toString());
  let node: TrieNode<V> | ValueNode<V> = map.root;
  let containingTrieNode: TrieNode<V> = map.root;
  let depth = 1;

  while (depth <= MAX_DEPTH) {
    const index = computePartialHashCode(hashCode, depth);
    depth++;

    let nextNode: TrieNode<V> | ValueNode<V> = node[index];
    if (!nextNode) {
      node = node[index] = createValueNode<V>();
      break;
    } else if ('length' in nextNode) {
      containingTrieNode = node;
      node = nextNode;
    } else {
      node = nextNode;
      break;
    }
  }

  return { containingTrieNode, depth, valueNode: node as ValueNode<V> };
}

function splitValueNode<V>(valueNode: ValueNode<V>, depth: number) {
  const trieNode = createTrieNode<V>();

  for (const key in valueNode.map) {
    const value = valueNode.map[key];
    const hashCode = hash(key);
    const index = computePartialHashCode(hashCode, depth);
    const newValueNode = trieNode[index] = trieNode[index] as ValueNode<V> || createValueNode<V>();

    newValueNode.map[key] = value;
    newValueNode.size++;
  }

  return trieNode;
}

function computePartialHashCode(hashCode: number, depth: number) {
  return (hashCode >> ((depth - 1) * SHIFT)) & MASK;
}