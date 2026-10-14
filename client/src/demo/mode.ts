// Demo mode runs the whole UI against local, deterministic fixtures instead
// of the Express API. It is enabled only when the build/dev mode sets
// VITE_DEMO_MODE=true (see `npm run dev:demo` and client/.env.demo). It is
// off by default, so the normal build keeps calling the real API.
//
// Read at call time (not at module load) so tests can toggle it with
// vi.stubEnv().
export function isDemoMode(): boolean {
  return import.meta.env.VITE_DEMO_MODE === 'true'
}

// Fixed, public demo-only admin password. It guards the same destructive
// actions as the real admin password so those dialogs can be exercised. It
// protects nothing real.
export const DEMO_ADMIN_PASSWORD = 'demo'

export const DEMO_BANNER_TEXT =
  'Demo mode: sample data only, not a live account. Changes reset on reload.'
