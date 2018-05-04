import produce, {setAutoFreeze, setUseProxies} from 'immer';
import {createMap, getInMap, setInMap} from '../src/map';

setUseProxies(true);
setAutoFreeze(false);

const ITERATIONS = 4000;

function mapBenchmark() {
  console.time('map');
  let state = { map: createMap<number, string>() };
  type State = typeof state;

  for (let i = 0; i < ITERATIONS; i++) {
    state = produce(state, (draft: State) => {
      setInMap(draft.map, i, i.toString());
    });
  }

  console.timeEnd('map');
}

mapBenchmark();