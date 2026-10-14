import { useCallback, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { AssistantContext } from '../context/AssistantContext.js'
import { AssistantDrawer } from './AssistantDrawer.js'

const SIDEBAR_KEY = 'splitwise-pro:sidebar-collapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === 'true'
  } catch {
    return false
  }
}

function writeCollapsed(value: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_KEY, String(value))
  } catch {
    // Storage unavailable: the sidebar simply won't remember its state.
  }
}

interface NavItem {
  to: string
  label: string
  icon: string
  end?: boolean
}

// "Settings" is reached from the header gear, not this nav, so the screen
// title and this nav never show the same text.
const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', icon: '🏠', end: true },
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/settlement', label: 'Settle up', icon: '✓' },
]

interface AppShellProps {
  children: ReactNode
}

// Responsive frame around the routed screens. On wide screens it renders a
// collapsible sidebar; on phones it renders a bottom navigation bar. It always
// renders, even while the API is unreachable, so the layout never goes blank.
// The Assistant opens a left-side panel that works from the group's real data.
export function AppShell({ children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [assistantOpen, setAssistantOpen] = useState(false)

  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => {
      writeCollapsed(!current)
      return !current
    })
  }, [])

  const openAssistant = useCallback(() => setAssistantOpen(true), [])
  const closeAssistant = useCallback(() => setAssistantOpen(false), [])

  const assistantValue = { openAssistant }

  return (
    <AssistantContext.Provider value={assistantValue}>
      <div className="app-frame">
        <aside
          className={`app-sidebar ${collapsed ? 'app-sidebar--collapsed' : ''}`}
          aria-label="Main navigation"
        >
          <button
            type="button"
            className="app-sidebar__toggle"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span aria-hidden="true">{collapsed ? '»' : '«'}</span>
          </button>
          <nav className="app-sidebar__nav">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `app-nav-link ${isActive ? 'app-nav-link--active' : ''}`
                }
                title={item.label}
              >
                <span className="app-nav-link__icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="app-nav-link__label">{item.label}</span>
              </NavLink>
            ))}
            <button
              type="button"
              className="app-nav-link app-nav-link--button"
              onClick={openAssistant}
              title="Assistant"
            >
              <span className="app-nav-link__icon" aria-hidden="true">
                💬
              </span>
              <span className="app-nav-link__label">Assistant</span>
            </button>
          </nav>
        </aside>

        <div className="app-main">{children}</div>

        <nav className="app-bottom-nav" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `app-bottom-nav__link ${isActive ? 'app-bottom-nav__link--active' : ''}`
              }
            >
              <span aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
          <button type="button" className="app-bottom-nav__link" onClick={openAssistant}>
            <span aria-hidden="true">💬</span>
            <span>Assistant</span>
          </button>
        </nav>
      </div>

      {assistantOpen && <AssistantDrawer onClose={closeAssistant} />}
    </AssistantContext.Provider>
  )
}
