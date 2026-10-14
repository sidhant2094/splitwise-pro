import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ApiRequestError } from './api/errors.js'
import { AppGate } from './AppGate.js'
import { AppShell } from './components/AppShell.js'
import { DemoBanner } from './components/DemoBanner.js'
import { GroupProvider } from './context/GroupContext.js'
import { AddExpenseScreen } from './screens/AddExpenseScreen.js'
import { CategoriesScreen } from './screens/CategoriesScreen.js'
import { DashboardScreen } from './screens/DashboardScreen.js'
import { ExpenseDetailScreen } from './screens/ExpenseDetailScreen.js'
import { HomeScreen } from './screens/HomeScreen.js'
import { PeopleScreen } from './screens/PeopleScreen.js'
import { SettingsScreen } from './screens/SettingsScreen.js'
import { SettlementScreen } from './screens/SettlementScreen.js'

// Network failures are not retried automatically. React Query pauses a retry
// until the window is focused and online, which would leave a query pending
// behind a loading state indefinitely. A network failure surfaces at once with
// a Try again button. Server errors (5xx) keep one automatic retry.
// networkMode 'always' stops React Query from pausing requests when the browser
// reports offline, for the same reason.
//
// Exported so tests can clear the cache between renders of <App /> within
// the same file (module-level singleton, otherwise long-lived by design).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) =>
        error instanceof ApiRequestError && error.status >= 500 && failureCount < 1,
      networkMode: 'always',
    },
    mutations: {
      networkMode: 'always',
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <GroupProvider>
        <DemoBanner />
        <BrowserRouter>
          <AppShell>
            <AppGate>
              <Routes>
                <Route path="/" element={<HomeScreen />} />
                <Route path="/dashboard" element={<DashboardScreen />} />
                <Route path="/add-expense" element={<AddExpenseScreen />} />
                <Route path="/expenses/:expenseId" element={<ExpenseDetailScreen />} />
                <Route path="/settings" element={<SettingsScreen />} />
                <Route path="/settings/people" element={<PeopleScreen />} />
                <Route path="/settings/categories" element={<CategoriesScreen />} />
                <Route path="/settlement" element={<SettlementScreen />} />
              </Routes>
            </AppGate>
          </AppShell>
        </BrowserRouter>
      </GroupProvider>
    </QueryClientProvider>
  )
}

export default App
