import { createSeedState, type DemoState } from './demoData.js'

// The one in-memory copy of the demo dataset. It is recreated from the seed
// on every page load, so demo edits never persist and can never be mistaken
// for live account data. Tests call resetDemoState() for a clean slate.
let state: DemoState = createSeedState()

export function getDemoState(): DemoState {
  return state
}

export function resetDemoState(): void {
  state = createSeedState()
}
