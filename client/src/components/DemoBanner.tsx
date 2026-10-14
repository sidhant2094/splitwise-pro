import { DEMO_ADMIN_PASSWORD, DEMO_BANNER_TEXT, isDemoMode } from '../demo/mode.js'

// Always-visible notice in demo mode, so sample data is never mistaken for a
// live account. Renders nothing in a normal build.
export function DemoBanner() {
  if (!isDemoMode()) return null

  return (
    <div className="demo-banner" role="status">
      <strong>DEMO DATA</strong>
      <span>
        {DEMO_BANNER_TEXT} Admin password for demo actions: <code>{DEMO_ADMIN_PASSWORD}</code>
      </span>
    </div>
  )
}
