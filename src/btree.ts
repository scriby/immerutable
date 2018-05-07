export interface BTreeNode<T> {
  items: Array<BTreeNode<T>|BTreeLeafNode<T>|BTreeValueNode<T>>;
}

export interface BTree<T> extends BTreeNode<T> {
  size: number;
}

export interface BTreeValueNode<T> {
  value: T;
}

export interface BTreeLeafNode<T> {
  items: Array<BTreeValueNode<T>>;
}

export type Comparer<T> = (a: T, b: T) => number;

const MAX_ITEMS = 5; //Must be odd for this implementation

if (MAX_ITEMS % 2 !== 1) throw new Error('MAX_ITEMS must be odd');

// [ P, V, P, V, P, V, P, V, P, V, P ]

export function createBTree<T>() {
  return createBTreeNode<T>();
}

export function insertInBTree<T>(tree: BTree<T>, value: T, comparer: Comparer<T>) {
  insertInBTreeNode(tree.items, tree, null, value, comparer);
}

function insertInBTreeNode<T>(node: BTreeNode<T>, parent: BTreeNode<T>|null, parentIndex: number|null, value: T, comparer: Comparer<T>) {
  const isLeafNode = node.items.length === 0 || node.items[0].hasOwnProperty('value');

  if ((isLeafNode && node.items.length > MAX_ITEMS) || (!isLeafNode && node.items.length > MAX_ITEMS * 2)) {
    const {left, mid, right} = splitNode(node);

    if (parentIndex == null) {
      // This is the root of the tree. Create a new root.
      parent.items = [left, mid, right];
    } else {
      // Insert pointers to the new arrays and value into the parent node. There is guaranteed to be space because
      // this algorithm preemptively splits full nodes on the way down the tree.
      parent.items.splice(parentIndex, 1, left, mid, right);
    }

    return insertInBTreeNode(parent, null, null, value, comparer);
  }

  if (isLeafNode) {
    const insertionIndex = findLeafNodeInsertionPoint(node, value, comparer);
    node.items.splice(insertionIndex, 0, createBTreeValueNode(value));
  } else {
    const recursionIndex = findRecursionIndex(node, value, comparer);
    insertInBTreeNode<T>(node.items[recursionIndex], node.items, recursionIndex, value, comparer);
  }
}

function splitNode(node: BTreeNode<T>) {
  const {items} = node;
  return {
    left: createBTreeNode(items.slice(0, MIN_ITEMS)),
    mid: items[MIN_ITEMS],
    right: createBTreeNode(items.slice(MIN_ITEMS + 1)),
  };
}

function findLeafNodeInsertionPoint<T>(leafNode: BTreeLeafNode<T>, value: T, comparer: Comparer<T>) {
  for (let i = node.items.length - 1; i >= 0; i--) {
    const currValue = node.items[i].value;
    const comparison = comparer(value, currValue);

    if (comparison >= 0) {
      return i + 1;
    }
  }

  return 0;
}

function findRecursionIndex<T>(node: BTreeNode<T>, value: T, comparer: Comparer<T>) {
  for (let i = node.items.length - 2; i >= 0; i-=2) {
    const currValue = node.items[i].value;
    const comparison = comparer(value, currValue);

    if (comparison >= 0) {
      return i + 1;
    }
  }

  return 0;
}

function createBTreeNode<T>(items?: Array<BTreeNode<T>|BTreeValueNode<T>>) {
  return {
    items: items || [],
  }
}

function createBTreeValueNode<T>(value: T) {
  return {
    value,
  };
}