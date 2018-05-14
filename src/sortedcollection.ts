export type ItemsArray<T> = Array<BTreeNode<T>|BTreeLeafNode<T>|BTreeValueNode<T>>;

export interface BTreeNode<T> {
  items: ItemsArray<T>;
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

export type Key = number | string;

const MAX_ITEMS_PER_LEVEL = 127; //Must be odd for this implementation

// Internal node layout: [ Child, Value, Child, Value, Child, ... ]
// Value node layout: [ Value, Value, Value, Value... ]
// Root starts as a value node and then looks like an internal node once it gets too large and splits

export class SortedCollection<K extends Key, T> {
  private comparer: Comparer<T>;
  private maxItemsPerLevel: number;

  constructor(args: {
    comparer: Comparer<T>,
    maxItemsPerLevel?: number,
  }) {
    this.comparer = args.comparer;
    this.maxItemsPerLevel = args.maxItemsPerLevel || MAX_ITEMS_PER_LEVEL;

    if (this.maxItemsPerLevel % 2 === 0) throw new Error('maxItemsPerLevel must be odd');
  }

  create(): BTree<T> {
    return this.createBTreeRootNode();
  }

  set(tree: BTree<T>, value: T) {
    this.insertInBTreeNode(tree, tree, null, value);
  }

  private insertInBTreeNode(node: BTreeNode<T>, parent: BTreeNode<T>|null, parentIndex: number|null, value: T): void {
    if (parent !== null && node.items.length >= this.maxItemsPerLevel) {
      // Instead of splitting the rightmost leaf in half, split it such that all (but one) of the items are in the left
      // subtree, leaving the right subtree empty. This optimizes for increasing in-order insertions.
      const isRightMostLeaf = parentIndex === parent.items.length - 1 && this.isLeafNode(node);
      const {left, mid, right} = isRightMostLeaf ? this.splitNodeLeftHeavy(node) : this.splitNode(node);

      if (parentIndex === null) {
        // This is the root of the tree. Create a new root.
        parent.items = [left, mid, right];
      } else {
        // Insert pointers to the new arrays and value into the parent node. There is guaranteed to be space because
        // this algorithm preemptively splits full nodes on the way down the tree.
        parent.items.splice(parentIndex, 1, left, mid, right);
      }

      return this.insertInBTreeNode(parent, null, null, value);
    }

    if (this.isLeafNode(node)) {
      const insertionIndex = this.findLeafNodeInsertionPoint(node as BTreeLeafNode<T>, value);

      if (insertionIndex >= node.items.length) {
        node.items.push(this.createBTreeValueNode(value));
      } else {
        node.items.splice(insertionIndex, 0, this.createBTreeValueNode(value));
      }
    } else {
      const recursionIndex = this.findRecursionIndex(node, value);
      this.insertInBTreeNode(node.items[recursionIndex] as BTreeNode<T>, node, recursionIndex, value);
    }
  }

  private isLeafNode(node: BTreeNode<T>) {
    return node.items.length === 0 || node.items[0].hasOwnProperty('value');
  }

  private splitNode(node: BTreeNode<T>) {
    const {items} = node;
    let midpoint = Math.floor(items.length / 2);
    if (midpoint % 2 === 0) midpoint += 1; //Midpoint needs to land on a value node when splitting an internal node
    return {
      left: this.createBTreeNode(items.slice(0, midpoint)),
      mid: items[midpoint],
      right: this.createBTreeNode(items.slice(midpoint + 1)),
    };
  }

  private splitNodeLeftHeavy(node: BTreeNode<T>) {
    const {items} = node;

    return {
      left: this.createBTreeNode(items.slice(0, items.length - 2)),
      mid: items[items.length - 2],
      right: this.createBTreeNode([items[items.length - 1]]),
    };
  }

  private findLeafNodeInsertionPoint(leafNode: BTreeLeafNode<T>, value: T) {
    // Loop is optimized for inserting on the end. Consider using binary search if not inserting on the end.
    for (let i = leafNode.items.length - 1; i >= 0; i--) {
      const currValue = leafNode.items[i].value;
      const comparison = this.comparer(value, currValue);

      if (comparison >= 0) {
        return i + 1;
      }
    }

    return 0;
  }

  private findRecursionIndex(node: BTreeNode<T>, value: T) {
    // Loop is optimized for inserting on the end. Consider using binary search if not inserting on the end.
    for (let i = node.items.length - 2; i >= 0; i-=2) {
      let currValue = (node.items[i] as BTreeValueNode<T>).value;
      const comparison = this.comparer(value, currValue);

      if (comparison >= 0) {
        return i + 1;
      }
    }

    return 0;
  }

  private createBTreeNode(items: Array<BTreeNode<T>|BTreeValueNode<T>> = []) {
    return {
      'items': items,
    }
  }

  private createBTreeRootNode(): BTree<T> {
    return {
      'items': [] as ItemsArray<T>,
      size: 0,
    };
  }

  private createBTreeValueNode(value: T) {
    return {
      'value': value,
    };
  }

  getIterable(tree: BTree<T>): Iterable<T> {
    type Frame = {index: number, items: ItemsArray<T>};
    const stack: Frame[] = [{ index: 0, items: tree.items }];

    function traverseToFurthestLeft(frame: Frame): T|undefined {
      if (frame === undefined) return undefined;

      if (frame.index < frame.items.length) {
        const item = frame.items[frame.index++];

        if ('items' in item) {
          const nextFrame = { items: item.items, index: 0 };
          stack.push(nextFrame);
          return traverseToFurthestLeft(nextFrame);
        } else if ('value' in item) {
          return item.value;
        } else {
          throw new Error('Expected a BTreeNode or BTreeValueNode');
        }
      } else {
        stack.pop();

        return traverseToFurthestLeft(stack[stack.length - 1]);
      }
    }

    return {
      [Symbol.iterator]() {
        return {
          next() {
            const value = traverseToFurthestLeft(stack[stack.length - 1]);

            if (value !== undefined) {
              return {
                value: value as T,
                done: false,
              };
            } else {
              return {
                value: undefined as any as T,
                done: true,
              };
            }
          }
        };
      }
    };
  }
}

