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
  [index: number]: TrieNode<T> | ValueNode<T> | SingleValueNode<T>;
  length: number;
}

export interface ValueNode<T> {
  map: NumberIndexable<T> & StringIndexable<T>;
}

export interface SingleValueNode<V> {
  key: Key;
  value: V;
}

const SHIFT = 4;
const TRIE_NODE_SIZE = 1 << SHIFT;
const MASK = TRIE_NODE_SIZE - 1;
const MAX_DEPTH = Math.ceil(32 / SHIFT);

export function createMap<K extends Key, V>(): Map<K, V> {
  return {
    root: createTrieNode<V>(),
    size: 0,
  };
}

export function hasInMap<K extends Key, V>(map: Map<K, V>, key: K): boolean {
  const {valueNode, depth} = lookupValueNode(map, key);

  if (valueNode === undefined) return false;

  if (depth < MAX_DEPTH) {
    return (valueNode as SingleValueNode<V>).key === key;
  } else {
    return key in valueNode;
  }
}

export function getInMap<K extends Key, V>(map: Map<K, V>, key: K): V|undefined {
  const {valueNode, depth} = lookupValueNode(map, key);

  if (valueNode === undefined) return;

  if (depth < MAX_DEPTH) {
    return (valueNode as SingleValueNode<V>).value;
  } else {
    return (valueNode as ValueNode<V>).map[key as any];
  }
}

export function setInMap<K extends Key, V>(map: Map<K, V>, key: Key, value: V): void {
  const {containingTrieNode, depth, index, valueNode} = lookupValueNode(map, key);

  if (valueNode === undefined) {
    map.size++;

    if (depth < MAX_DEPTH) {
      containingTrieNode[index] = createSingleValueNode(key, value);
    } else if (depth === MAX_DEPTH) {
      const newValueNode = containingTrieNode[index] = createValueNode();
      newValueNode.map[key] = value;
    }

    return;
  }

  if (depth < MAX_DEPTH) {
    pushSingleValueNodeDown(containingTrieNode, index, depth);
    return setInMap(map, key, value);
  } else {
    if (!(key in valueNode)) {
      map.size++;
    }

    (valueNode as ValueNode<V>).map[key] = value;
  }
}

function createTrieNode<V>(): TrieNode<V> {
  return [];
}

function createSingleValueNode<K, V>(key: K, value: V) {
  return { key, value };
}

function createValueNode<V>(): ValueNode<V> {
  return {
    map: Object.create(null),
  };
}

function lookupValueNode<K extends Key, V>(map: Map<K, V>, key: Key) {
  let hashCode = hash(key.toString());
  let node: TrieNode<V> = map.root;
  let index = 0;
  let depth = 1;
  let valueNode: ValueNode<V> | SingleValueNode<V> | undefined;

  while (depth <= MAX_DEPTH) {
    index = computePartialHashCode(hashCode, depth);
    depth++;

    let nextNode: TrieNode<V> | ValueNode<V> | SingleValueNode<V> = node[index];
    if (nextNode === undefined) {
      valueNode = undefined;
      break;
    } else if (Array.isArray(nextNode)) {
      node = nextNode;
    } else {
      valueNode = nextNode as ValueNode<V> | SingleValueNode<V>;
      break;
    }
  }

  return { containingTrieNode: node, depth, index, valueNode: valueNode };
}

function pushSingleValueNodeDown<K, V>(trieNode: TrieNode<V>, index: number, depth: number) {
  const singleValueNode = trieNode[index] as SingleValueNode<V>;
  const newTrieNode = trieNode[index] = createTrieNode();
  const partialHash = computePartialHashCode(hash(singleValueNode.key.toString()), depth);

  if (depth === MAX_DEPTH - 1) {
    const newValueNode = newTrieNode[partialHash] = createValueNode();
    newValueNode.map[singleValueNode.key] = singleValueNode.value;
  } else {
    newTrieNode[partialHash] = singleValueNode;
  }
}

function computePartialHashCode(hashCode: number, depth: number) {
  return (hashCode >> ((depth - 1) * SHIFT)) & MASK;
}