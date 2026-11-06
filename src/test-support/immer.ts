import type legacyProduce from 'immer';

// Test a separately installed Immer without changing the package's pinned
// benchmark dependency. Newer Immer exports produce by name and has no ES5 mode.
const runtime = require(process.env.IMMER_MODULE || 'immer');
const produce: typeof legacyProduce = runtime.produce || runtime.default;
export default produce;

export function mutate<S>(state: S, useImmer: boolean, recipe: (draft: S) => void): S {
  if (useImmer) return produce(state, recipe);
  recipe(state);
  return state;
}

export const proxyModes: boolean[] = typeof runtime.setUseProxies === 'function' ? [true, false] : [true];
export function setUseProxies(enabled: boolean): void {
  if (typeof runtime.setUseProxies === 'function') runtime.setUseProxies(enabled);
  else if (!enabled) throw new Error('This Immer version does not support ES5 drafts');
}
export function setAutoFreeze(enabled: boolean): void {
  runtime.setAutoFreeze(enabled);
}
