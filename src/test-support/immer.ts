import {produce} from 'immer';

export default produce;

/** Applies a recipe through Immer, or directly to a plain (non-draft) state. */
export function mutate<S>(state: S, useImmer: boolean, recipe: (draft: S) => void): S {
  if (useImmer) return produce(state, recipe);
  recipe(state);
  return state;
}
