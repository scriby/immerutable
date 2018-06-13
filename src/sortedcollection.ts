export interface IBTreeNode<T> {
  isRoot?: boolean;
  items: IBTreeValueNode<T>[];
  children?: Array<IBTreeNode<T>>;
}

export interface IBTree<T> {
  root: IBTreeNode<T>;
}

export interface IBTreeValueNode<T> {
  value: T;
}

export type ParentPath<T> = {
  index: number;
  node: IBTreeNode<T>;
}[];

export interface LookupNodeInfo<T> {
  valueNode: IBTreeValueNode<T>;
  parentPath: ParentPath<T>;
}

export type Comparer<T> = (a: T, b: T) => number;

export type EqualityComparer<T> = (a: T, b: T) => boolean;

const MAX_ITEMS_PER_LEVEL = 64; // Must be even for this implementation

// Internal node layout: [ Child, Value, Child, Value, Child, ... ]
// Value node layout: [ Value, Value, Value, Value... ]
// Root starts as a value node and then looks like an internal node once it gets too large and splits

export class SortedCollectionAdapter<T> {
  orderComparer: Comparer<T>;
  equalityComparer: EqualityComparer<T>;
  private maxItemsPerLevel: number;
  private minItemsPerLevel: number;

  constructor(args: {
    orderComparer: Comparer<T>,
    equalityComparer?: EqualityComparer<T>,
    maxItemsPerLevel?: number,
  }) {
    this.orderComparer = args.orderComparer;
    this.equalityComparer = args.equalityComparer || ((a, b) => a === b);
    this.maxItemsPerLevel = args.maxItemsPerLevel || MAX_ITEMS_PER_LEVEL;

    if (this.maxItemsPerLevel % 2 === 1) throw new Error('maxItemsPerLevel must be even');
    if (this.maxItemsPerLevel < 3) throw new Error('maxItemsPerLevel must be at least 3');

    this.minItemsPerLevel = Math.floor(this.maxItemsPerLevel / 2);
  }

  create(): IBTree<T> {
    return this.createBTreeRootNode();
  }

  insert(tree: IBTree<T>, value: T): void {
    this.insertInBTreeNode(tree.root, tree.root, undefined, value);
  }

  ensureSortedOrderOfNode(tree: IBTree<T>, nodeInfo: LookupNodeInfo<T>): void {
    const proceedingItem = this.getPreviousValue(nodeInfo.parentPath);
    const nextItem = this.getNextValue(nodeInfo.parentPath);
    const value = nodeInfo.valueNode.value;

    if (
      (proceedingItem && this.orderComparer(value, proceedingItem) < 0) ||
      (nextItem && this.orderComparer(value, nextItem) > 0)
    ) {
      // Item is out of order, remove and re-insert it to fix up the order.
      this.removeByPath(nodeInfo);
      this.insert(tree, value);
    }
  }

  getFirst(tree: IBTree<T>): T|undefined {
    if (tree.root.items.length === 0) return;

    return this.getFurthestLeftValue(tree.root);
  }

  getLast(tree: IBTree<T>): T|undefined {
    if (tree.root.items.length === 0) return;

    return this.getFurthestRightValue(tree.root);
  }

  private insertInBTreeNode(node: IBTreeNode<T>, parent: IBTreeNode<T>|undefined, parentIndex: number|undefined, value: T): void {
    const isLeafNode = this.isLeafNode(node);
    if (parent !== undefined && ((isLeafNode && node.items.length >= this.maxItemsPerLevel) || (!isLeafNode && node.children!.length >= this.maxItemsPerLevel))) {
      // Instead of splitting the rightmost leaf in half, split it such that all (but one) of the items are in the left
      // subtree, leaving the right subtree empty. This optimizes for increasing in-order insertions.
      // Note that this doesn't detect if it's actually the furthest right node in the tree; it just checks for the
      // current parent. Trying to make it more accurate is slow enough that it negates the perf benefit.
      const isRightMostLeaf = isLeafNode && parentIndex !== undefined && parentIndex === parent.children!.length - 1;
      const isLeftMostLeaf = isLeafNode && parentIndex === 0;
      const {left, mid, right} = isRightMostLeaf ? this.splitLeafNodeLeftHeavy(node) : isLeftMostLeaf ? this.splitLeafNodeRightHeavy(node) : this.splitNode(node);

      if (parentIndex === undefined) {
        // This is the root of the tree. Create a new root.
        parent.items = [mid];
        parent.children = [left, right];
        parent.isRoot = true;
      } else {
        // Insert pointers to the new arrays and value into the parent node.
        parent.children!.splice(parentIndex, 1, left, right);
        parent.items.splice(parentIndex, 0, mid);
      }

      return this.insertInBTreeNode(parent, undefined, undefined, value);
    }

    if (isLeafNode) {
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

  private isLeafNode(node: IBTreeNode<T>): boolean {
    return (node as IBTreeNode<T>).children === undefined;
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

  private splitLeafNodeLeftHeavy(node: IBTreeNode<T>) {
    const {items} = node;

    return {
      left: this.createBTreeNode(items.slice(0, items.length - 1)),
      mid: items[items.length - 1],
      right: this.createBTreeNode([]),
    };
  }

  private splitLeafNodeRightHeavy(node: IBTreeNode<T>) {
    const {items} = node;

    return {
      left: this.createBTreeNode([]),
      mid: items[0],
      right: this.createBTreeNode(items.slice(1)),
    };
  }

  private findLeafNodeInsertionPoint(leafNode: IBTreeNode<T>, value: T) {
    return this.binarySearch(leafNode.items, value);
  }

  private findRecursionIndex(node: IBTreeNode<T>, value: T) {
    return this.binarySearch(node.items, value);
  }

  remove(tree: IBTree<T>, value: T): void {
    const existingInfo = this.lookupValuePath(tree, value);
    if (existingInfo === undefined) return;

    return this.removeByPath(existingInfo);
  }

  private removeByPath(nodeInfo: LookupNodeInfo<T>): void {
    const containerInfo = nodeInfo.parentPath[nodeInfo.parentPath.length - 1];
    containerInfo.node.items.splice(containerInfo.index, 1);
    const isLeafNode = this.isLeafNode(containerInfo.node);

    // When removing from an internal node, take the last item of the left subtree.
    // Then, start rebalancing from the leaf node from which the item was taken.
    if (!isLeafNode) {
      const leftSibling = containerInfo.node.children![containerInfo.index];
      const valueInfo = this.lookupRightMostValueWithParentPath(leftSibling, nodeInfo.parentPath);

      const valueContainer = valueInfo.parentPath[valueInfo.parentPath.length - 1];
      valueContainer.node.items.splice(valueContainer.index);
      containerInfo.node.items.splice(containerInfo.index, 0, valueInfo.valueNode);

      this.rebalance(valueInfo.parentPath);
    } else {
      this.rebalance(nodeInfo.parentPath);
    }
  }

  // Fix up a leaf or internal node which is deficient by taking items from nearby nodes or combining nodes.
  private rebalance(parentPath: ParentPath<T>) {
    const containerInfo = parentPath[parentPath.length - 1];
    if (containerInfo.node.isRoot) return;
    const isLeafNode = this.isLeafNode(containerInfo.node);

    // No rebalancing is necessary if the current node meets btree constraints
    if (this.isNodeDeficient(containerInfo.node, isLeafNode)) {
      const parentInfo = parentPath[parentPath.length - 2]!;
      const rightSibling = parentInfo.node.children![parentInfo.index + 1];

      // The node has a right sibling that can spare an item.
      if (rightSibling && this.canNodeLoseItem(rightSibling, isLeafNode)) {
        const rightItem = rightSibling.items.shift()!;
        const separator = parentInfo.node.items.splice(parentInfo.index, 1, rightItem)[0];
        containerInfo.node.items.push(separator);

        if (!isLeafNode) {
          containerInfo.node.children!.push(rightSibling.children!.shift()!);
        }

        return;
      }

      const leftSibling = parentInfo.node.children![parentInfo.index - 1];

      // The node has a left sibling that can spare an item.
      if (leftSibling && this.canNodeLoseItem(leftSibling, isLeafNode)) {
        const leftItem = leftSibling.items.pop()!;
        const separator = parentInfo.node.items.splice(parentInfo.index - 1, 1, leftItem)[0];
        containerInfo.node.items.unshift(separator);

        if (!isLeafNode) {
          containerInfo.node.children!.unshift(leftSibling.children!.pop()!);
        }

        return;
      }

      const separator = parentInfo.node.items.splice(leftSibling ? parentInfo.index - 1 : parentInfo.index, 1)[0];

      // Both left and right siblings are deficient. Combine them into one node.
      const copyInto = leftSibling || containerInfo.node;
      const copyFrom = leftSibling ? containerInfo.node : rightSibling;

      parentInfo.node.children!.splice(leftSibling ? parentInfo.index : parentInfo.index + 1, 1);
      parentInfo.index--;
      copyInto.items.push(separator);
      copyInto.items.push.apply(copyInto.items, copyFrom.items);

      if (!isLeafNode) {
        copyInto.children!.push.apply(copyInto.children, copyFrom.children);
      }

      // If the current root is empty, make the current node the new root.
      if (parentInfo.node.items.length === 0 && parentInfo.node.isRoot) {
        // Make copyInto the new root
        parentInfo.node.items = copyInto.items;
        parentInfo.node.children = copyInto.children;
      } else {
        // Rebalance the parent (which may or may not need rebalancing)
        parentPath.pop();
        this.rebalance(parentPath);
      }
    }
  }

  private isNodeDeficient(node: IBTreeNode<T>, isLeafNode: boolean) {
    return (isLeafNode && node.items.length < this.minItemsPerLevel) ||
      (!isLeafNode && node.children!.length < this.minItemsPerLevel);
  }

  private canNodeLoseItem(node: IBTreeNode<T>, isLeafNode: boolean) {
    return (isLeafNode && node.items.length > this.minItemsPerLevel) ||
      (!isLeafNode && node.children!.length > this.minItemsPerLevel);
  }

  private lookupRightMostValueWithParentPath(
    node: IBTreeNode<T>,
    parentPath: ParentPath<T>
  ): LookupNodeInfo<T> {

    if (this.isLeafNode(node)) {
      return {
        valueNode: node.items[node.items.length - 1],
        parentPath: parentPath.concat({ node, index: node.items.length - 1 })
      };
    } else {
      return this.lookupRightMostValueWithParentPath(
        node.children![node.children!.length - 1],
        parentPath.concat({ node, index: node.children!.length - 1 })
      );
    }
  }

  private getFurthestLeftValue(node: IBTreeNode<T>): T {
    if (this.isLeafNode(node)) {
      return node.items[0].value;
    } else {
      return this.getFurthestLeftValue(node.children![0]);
    }
  }

  private getFurthestRightValue(node: IBTreeNode<T>): T {
    if (this.isLeafNode(node)) {
      return node.items[node.items.length - 1].value;
    } else {
      return this.getFurthestRightValue(node.children![node.children!.length - 1]);
    }
  }

  private getPreviousValue(parentPath: ParentPath<T>): T|undefined {
    for (let i = parentPath.length - 1; i >= 0; i--) {
      const nodeInfo = parentPath[i];
      if (nodeInfo.index > 0) {
        if (i === parentPath.length - 1) {
          // Leaf node
          return nodeInfo.node.items[nodeInfo.index - 1].value;
        } else {
          // Internal node
          const child = nodeInfo.node.children![nodeInfo.index - 1];
          return this.getFurthestRightValue(child);
        }
      }
    }
  }

  private getNextValue(parentPath: ParentPath<T>): T|undefined {
    for (let i = parentPath.length - 1; i >= 0; i--) {
      const nodeInfo = parentPath[i];
      if (nodeInfo.index < nodeInfo.node.items.length - 1) {
        if (i === parentPath.length - 1) {
          // Leaf node
          return nodeInfo.node.items[nodeInfo.index + 1].value;
        } else {
          // Internal node
          const child = nodeInfo.node.children![nodeInfo.index + 1];
          return this.getFurthestLeftValue(child);
        }
      }
    }
  }

  lookupValuePath(
    tree: IBTree<T>,
    value: T,
  ): LookupNodeInfo<T>|undefined {
    return this._lookupValuePath(tree.root, value);
  }

  private _lookupValuePath(
    node: IBTreeNode<T>,
    value: T,
    parentPath: ParentPath<T> = []
  ): LookupNodeInfo<T>|undefined {
    const index = this.binarySearch(node.items, value);

    const currNode = node.items[index];
    if (currNode && this.equalityComparer(currNode.value, value)) {
      return { valueNode: currNode, parentPath: parentPath.concat({ node, index }) };
    }

    for (let prev = index - 1; ; prev--) {
      if (node.children !== undefined && node.children.length > 1) {
        const subtreeResult = this._lookupValuePath(node.children[prev + 1], value, parentPath.concat({ node, index: prev + 1 }));
        if (subtreeResult !== undefined) {
          return subtreeResult;
        }
      }

      const prevNode = node.items[prev];
      if (prevNode && this.equalityComparer(prevNode.value, value)) {
        return { valueNode: node.items[prev], parentPath: parentPath.concat({ node, index: prev }) };
      }

      if (!prevNode || this.orderComparer(value, prevNode.value) !== 0) {
        break;
      }
    }

    if (!currNode) return;
    if (this.orderComparer(value, currNode.value) !== 0) return;

    for (let next = index + 1; ; next++) {
      if (node.children !== undefined) {
        const subtreeResult = this._lookupValuePath(node.children[next], value, parentPath.concat({ node, index: next }));
        if (subtreeResult !== undefined) {
          return subtreeResult;
        }
      }

      const nextNode = node.items[next];
      if (nextNode && this.equalityComparer(nextNode.value, value)) {
        return { valueNode: node.items[next], parentPath: parentPath.concat({ node, index: next }) };
      }

      if (!nextNode || this.orderComparer(value, nextNode.value) !== 0) {
        break;
      }
    }
  }

  private binarySearch(items: IBTreeValueNode<T>[], value: T) {
    if (items.length === 0) return 0;

    // Optimize increasing order insertions.
    const lastItemValue = (items[items.length - 1]).value;
    if (this.orderComparer(value, lastItemValue) >= 0) {
      return items.length;
    }

    // Optimize decreasing order insertions.
    const firstItemValue = items[0].value;
    if (this.orderComparer(value, firstItemValue) <= 0) {
      return 0;
    }

    // -2 because we already compared with the last value
    return this._binarySearch(items, value, 1, items.length - 2);
  }

  private _binarySearch(items: IBTreeValueNode<T>[], value: T, low: number, high: number): number {
    if (high < low) {
      return low;
    }

    const mid = Math.floor(low + (high - low) / 2);
    const currValue = items[mid].value;
    const comparison = this.orderComparer(value, currValue);

    if (comparison < 0) {
      return this._binarySearch(items, value, low, mid - 1);
    } else if (comparison > 0) {
      return this._binarySearch(items, value, mid + 1, high);
    } else {
      return mid;
    }
  };

  private createBTreeNode(items: IBTreeValueNode<T>[], children?: Array<IBTreeNode<T>>, isRoot = false): IBTreeNode<T> {
    if (isRoot) {
      return { isRoot, items };
    } else if (children) {
      return { children, items };
    } else {
      return { items };
    }
  }

  private createBTreeRootNode(): IBTree<T> {
    return {
      root: this.createBTreeNode([], undefined, true),
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
    const stack: Frame[] = [{ onChildren: true, index: 0, items: tree.root.items, children: tree.root.children }];

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
      [Symbol.iterator]: () => {
        return {
          next: () => {
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

