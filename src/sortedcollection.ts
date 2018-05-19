export interface IBTreeNode<T> {
  items: IBTreeValueNode<T>[];
  children?: Array<IBTreeNode<T>>;
}

export interface IBTree<T> extends IBTreeNode<T> {
  size: number;
}

export interface IBTreeValueNode<T> {
  value: T;
}

export type Comparer<T> = (a: T, b: T) => number;

const MAX_ITEMS_PER_LEVEL = 64; //Must be even for this implementation

// Internal node layout: [ Child, Value, Child, Value, Child, ... ]
// Value node layout: [ Value, Value, Value, Value... ]
// Root starts as a value node and then looks like an internal node once it gets too large and splits

export class SortedCollectionAdapter<T> {
  private comparer: Comparer<T>;
  private maxItemsPerLevel: number;
  private minItemsPerLevel: number;

  constructor(args: {
    comparer: Comparer<T>,
    maxItemsPerLevel?: number,
  }) {
    this.comparer = args.comparer;
    this.maxItemsPerLevel = args.maxItemsPerLevel || MAX_ITEMS_PER_LEVEL;

    if (this.maxItemsPerLevel % 2 === 1) throw new Error('maxItemsPerLevel must be even');
    if (this.maxItemsPerLevel < 3) throw new Error('maxItemsPerLevel must be at least 3');

    this.minItemsPerLevel = Math.floor(this.maxItemsPerLevel / 2);
  }

  create(): IBTree<T> {
    return this.createBTreeRootNode();
  }

  insert(tree: IBTree<T>, value: T): void {
    this.insertInBTreeNode(tree, tree, null, value);
  }

  getSize(tree: IBTree<T>): number {
    return tree.size;
  }

  private insertInBTreeNode(node: IBTreeNode<T>, parent: IBTreeNode<T>|null, parentIndex: number|null, value: T): void {
    if (parent !== null && node.items.length >= this.maxItemsPerLevel) {
      // Instead of splitting the rightmost leaf in half, split it such that all (but one) of the items are in the left
      // subtree, leaving the right subtree empty. This optimizes for increasing in-order insertions.
      const isRightMostLeaf = (parentIndex === null || parentIndex === parent.children!.length - 1) && this.isLeafNode(node);
      const {left, mid, right} = isRightMostLeaf ? this.splitNodeLeftHeavy(node) : this.splitNode(node);

      if (parentIndex === null) {
        // This is the root of the tree. Create a new root.
        parent.items = [mid];
        parent.children = [left, right];
      } else {
        // Insert pointers to the new arrays and value into the parent node.
        parent.children!.splice(parentIndex, 1, left, right);
        parent.items.splice(parentIndex, 0, mid);
      }

      return this.insertInBTreeNode(parent, null, null, value);
    }

    if (this.isLeafNode(node)) {
      const insertionIndex = this.findLeafNodeInsertionPoint(node, value);

      if (insertionIndex >= node.items.length) {
        node.items.push(this.createBTreeValueNode(value));
      } else {
        node.items.splice(insertionIndex, 0, this.createBTreeValueNode(value));
      }
    } else {
      const interiorNode = node as IBTreeNode<T>;
      const recursionIndex = this.findRecursionIndex(interiorNode, value);
      this.insertInBTreeNode(interiorNode.children![recursionIndex], interiorNode, recursionIndex, value);
    }
  }

  private isLeafNode(node: IBTreeNode<T>) {
    return (node as IBTreeNode<T>).children === undefined;
  }

  private isRootNode(node: IBTreeNode<T>) {
    return (node as IBTree<T>).size != null;
  }

  private splitNode(node: IBTreeNode<T>) {
    const {children, items} = node;
    let midpoint = Math.floor(items.length / 2);
    return {
      left: this.createBTreeNode(items.slice(0, midpoint), children && children.slice(0, midpoint + 1)),
      mid: items[midpoint],
      right: this.createBTreeNode(items.slice(midpoint + 1), children && children.slice(midpoint + 1)),
    };
  }

  private splitNodeLeftHeavy(node: IBTreeNode<T>) {
    const {children, items} = node;

    return {
      left: this.createBTreeNode(items.slice(0, items.length - 1), children),
      mid: items[items.length - 1],
      right: this.createBTreeNode([], children && []),
    };
  }

  private findLeafNodeInsertionPoint(leafNode: IBTreeLeafNode<T>, value: T) {
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

  private findRecursionIndex(node: IBTreeNode<T>, value: T) {
    return this.binarySearch(node.items, value) + 1;
  }

  private binarySearch(items: IBTreeValueNode<T>[], value: T) {
    if (items.length === 0) return 0;
    const lastItemValue = (items[items.length - 1]).value;
    if (this.comparer(value, lastItemValue) >= 0) {
      return items.length - 1;
    }

    //-2 because we already compared with the last value
    return this._binarySearch(items, value, 0, items.length - 2);
  }

  private _binarySearch(items: IBTreeValueNode<T>[], value: T, low: number, high: number): number {
    if (high < low) {
      return low - 1;
    }

    const mid = Math.floor(low + (high - low) / 2);
    const currValue = items[mid].value;
    const comparison = this.comparer(value, currValue);

    if (comparison < 0) {
      return this._binarySearch(items, value, low, mid - 1);
    } else if (comparison > 0) {
      return this._binarySearch(items, value, mid + 1, high);
    } else {
      return mid;
    }
  };

  private createBTreeNode(items: IBTreeValueNode<T>[], children?: Array<IBTreeNode<T>>): IBTreeNode<T> {
    return {
      children,
      items,
    }
  }

  private createBTreeRootNode(): IBTree<T> {
    return {
      items: [] as IBTreeValueNode<T>[],
      size: 0,
    };
  }

  private createBTreeValueNode(value: T) {
    return {
      'value': value,
    };
  }

  getIterable(tree: IBTree<T>): Iterable<T> {
    type Frame = {
      index: number,
      onChildren: boolean,
      items: IBTreeValueNode<T>[],
      children?: IBTreeNode<T>[]
    };
    const stack: Frame[] = [{ onChildren: true, index: 0, items: tree.items, children: tree.children }];

    function traverseToFurthestLeft(frame: Frame): T|undefined {
      if (frame === undefined) return undefined;

      if (
        frame.index < frame.items.length ||
        (frame.children !== undefined && frame.onChildren && frame.index < frame.children.length)
      ) {
        if (frame.children !== undefined && frame.onChildren) {
          const child = frame.children[frame.index];
          const nextFrame = { items: child.items, onChildren: true, children: child.children, index: 0 };
          stack.push(nextFrame);

          frame.onChildren = false;
          return traverseToFurthestLeft(nextFrame);
        } else {
          const item = frame.items[frame.index++];
          frame.onChildren = true;
          return item.value;
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

