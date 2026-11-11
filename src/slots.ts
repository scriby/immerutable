/**
 * Trie nodes (map.ts) and B-tree nodes (btree.ts) are objects whose
 * properties are numbered positions, not arrays: Immer freezes what it
 * produces, and V8 copies and iterates a frozen array several times more
 * slowly than an object of the same size.
 *
 * The property names are neither array indices (V8 would store those like
 * array elements, which is slower still) nor identifiers (so a minifier's
 * renamed properties cannot collide with them).
 */
const NAMES: string[] = [];

/** The property name of a position: '#' and the position in base 36. */
export function slotName(position: number): string {
  while (NAMES.length <= position) NAMES.push('#' + NAMES.length.toString(36));
  return NAMES[position];
}

/**
 * Reads a position of a node. On plain state, a property read whose name
 * varies from one execution to the next is several times slower than one with
 * a literal name, so the positions that nodes of the default sizes use (16 in
 * a trie node, 22 in a B-tree node) are spelled out.
 */
export function readSlot(node: any, position: number): any {
  switch (position) {
    case 0: return node['#0'];
    case 1: return node['#1'];
    case 2: return node['#2'];
    case 3: return node['#3'];
    case 4: return node['#4'];
    case 5: return node['#5'];
    case 6: return node['#6'];
    case 7: return node['#7'];
    case 8: return node['#8'];
    case 9: return node['#9'];
    case 10: return node['#a'];
    case 11: return node['#b'];
    case 12: return node['#c'];
    case 13: return node['#d'];
    case 14: return node['#e'];
    case 15: return node['#f'];
    case 16: return node['#g'];
    case 17: return node['#h'];
    case 18: return node['#i'];
    case 19: return node['#j'];
    case 20: return node['#k'];
    case 21: return node['#l'];
    default: return node[slotName(position)];
  }
}

/**
 * Copies the non-empty values of positions 0 to 15 of a node into out, in
 * order, and returns how many there are. On plain state, sixteen reads with
 * literal names cost less than the same reads made one at a time.
 */
export function occupiedSlots(node: any, out: any[]): number {
  let count = 0;
  let value: any;
  if ((value = node['#0']) != null) out[count++] = value;
  if ((value = node['#1']) != null) out[count++] = value;
  if ((value = node['#2']) != null) out[count++] = value;
  if ((value = node['#3']) != null) out[count++] = value;
  if ((value = node['#4']) != null) out[count++] = value;
  if ((value = node['#5']) != null) out[count++] = value;
  if ((value = node['#6']) != null) out[count++] = value;
  if ((value = node['#7']) != null) out[count++] = value;
  if ((value = node['#8']) != null) out[count++] = value;
  if ((value = node['#9']) != null) out[count++] = value;
  if ((value = node['#a']) != null) out[count++] = value;
  if ((value = node['#b']) != null) out[count++] = value;
  if ((value = node['#c']) != null) out[count++] = value;
  if ((value = node['#d']) != null) out[count++] = value;
  if ((value = node['#e']) != null) out[count++] = value;
  if ((value = node['#f']) != null) out[count++] = value;
  return count;
}

/**
 * Refuses a root whose nodes are arrays, as version 3 (and, for maps, earlier
 * versions) stored them. Read as an object, such a node would look empty
 * rather than fail.
 */
export function checkLayout(root: unknown): void {
  if (Array.isArray(root)) {
    throw new Error('This collection was stored by immerutable 3 or earlier, whose layout this version cannot read. Rebuild it from application data.');
  }
}
