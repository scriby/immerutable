export type ItemsArray<T> = Array<BTreeNode<T>|BTreeLeafNode<T>|BTreeValueNode<T>>;

export interface BTreeNode<T> {
  items: ItemsArray<T>;
}

export interface BTree<T> extends BTreeNode<T> {
  maxItemsPerLevel: number;
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

// [ P, V, P, V, P, V, P, V, P, V, P ]

export function createBTree<T>(maxItemsPerLevel = MAX_ITEMS): BTree<T> {
  return createBTreeRootNode<T>(maxItemsPerLevel);
}

export function insertInBTree<T>(tree: BTree<T>, value: T, comparer: Comparer<T>) {
  insertInBTreeNode(tree, tree, null, value, tree.maxItemsPerLevel, comparer);
}

function insertInBTreeNode<T>(node: BTreeNode<T>, parent: BTreeNode<T>|null, parentIndex: number|null, value: T, maxItemsPerLevel: number, comparer: Comparer<T>): void {
  const isLeafNode = node.items.length === 0 || node.items[0].hasOwnProperty('value');

  if (parent && ((isLeafNode && node.items.length >= maxItemsPerLevel) || (!isLeafNode && node.items.length > maxItemsPerLevel * 2))) {
    const {left, mid, right} = splitNode(node);

    if (parentIndex == null) {
      // This is the root of the tree. Create a new root.
      parent.items = [left, mid, right];
    } else {
      // Insert pointers to the new arrays and value into the parent node. There is guaranteed to be space because
      // this algorithm preemptively splits full nodes on the way down the tree.
      parent.items.splice(parentIndex, 1, left, mid, right);
    }

    return insertInBTreeNode(parent, null, null, value, maxItemsPerLevel, comparer);
  }

  if (isLeafNode) {
    const insertionIndex = findLeafNodeInsertionPoint(node as BTreeLeafNode<T>, value, comparer);
    node.items.splice(insertionIndex, 0, createBTreeValueNode(value));
  } else {
    const recursionIndex = findRecursionIndex(node, value, comparer);
    insertInBTreeNode(node.items[recursionIndex] as BTreeNode<T>, node, recursionIndex, value, maxItemsPerLevel, comparer);
  }
}

function splitNode<T>(node: BTreeNode<T>) {
  const {items} = node;
  const midpoint = items.length / 2 | 0;
  return {
    left: createBTreeNode(items.slice(0, midpoint)),
    mid: items[midpoint],
    right: createBTreeNode(items.slice(midpoint + 1)),
  };
}

function findLeafNodeInsertionPoint<T>(leafNode: BTreeLeafNode<T>, value: T, comparer: Comparer<T>) {
  for (let i = leafNode.items.length - 1; i >= 0; i--) {
    const currValue = leafNode.items[i].value;
    const comparison = comparer(value, currValue);

    if (comparison >= 0) {
      return i + 1;
    }
  }

  return 0;
}

function findRecursionIndex<T>(node: BTreeNode<T>, value: T, comparer: Comparer<T>) {
  for (let i = node.items.length - 2; i >= 0; i-=2) {
    const currValue = (node.items[i] as BTreeValueNode<T>).value;
    const comparison = comparer(value, currValue);

    if (comparison >= 0) {
      return i + 1;
    }
  }

  return 0;
}

function createBTreeNode<T>(items: Array<BTreeNode<T>|BTreeValueNode<T>> = []) {
  return {
    items,
  }
}

function createBTreeRootNode<T>(maxItemsPerLevel: number): BTree<T> {
  return {
    items: [] as ItemsArray<T>,
    maxItemsPerLevel,
    size: 0,
  }
}

function createBTreeValueNode<T>(value: T) {
  return {
    value,
  };
}