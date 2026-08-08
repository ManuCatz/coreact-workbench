import { buildDemo } from './demo/buildDemo';
import { sortStore, drawing, drawingStore, refresh } from './ui/store';
const globalScope = globalThis as unknown as { sortStore: typeof sortStore };
globalScope.sortStore = sortStore;

buildDemo({ sortStore, drawing, drawingStore });

// Notify reactive UI that the demo has finished populating state.
refresh();

export { buildDemo };
