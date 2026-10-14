import { useEffect, useState, type ReactNode } from 'react'
import { CreateGroupSheet } from './components/CreateGroupSheet.js'
import { EmptyState } from './components/EmptyState.js'
import { ErrorState } from './components/ErrorState.js'
import { LoadingState } from './components/LoadingState.js'
import { useCurrentGroup } from './context/GroupContext.js'
import { useCreateGroupMutation, useGroupsQuery } from './hooks/useGroups.js'
import { isRetryableError } from './utils/errors.js'

// Ensures there is always a valid current group before any screen renders,
// and shows the "no groups yet" flow otherwise (User_Stories_User_Flows.md
// US-007 / UI_UX_Specification.md §41).
export function AppGate({ children }: { children: ReactNode }) {
  const { currentGroupId, setCurrentGroupId } = useCurrentGroup()
  const groupsQuery = useGroupsQuery()
  const createGroupMutation = useCreateGroupMutation()
  const [showCreateGroup, setShowCreateGroup] = useState(false)

  useEffect(() => {
    if (!groupsQuery.data) return
    const exists = groupsQuery.data.some((group) => group.id === currentGroupId)
    if (!exists) {
      setCurrentGroupId(groupsQuery.data[0]?.id ?? null)
    }
  }, [groupsQuery.data, currentGroupId, setCurrentGroupId])

  // Loading and failure render inside the app shell (see App.tsx), so the
  // navigation stays usable while the server is unreachable or waking up.
  if (groupsQuery.isPending) {
    return <LoadingState label="Connecting to your groups…" />
  }

  if (groupsQuery.isError) {
    return (
      <ErrorState
        error={groupsQuery.error}
        onRetry={isRetryableError(groupsQuery.error) ? () => groupsQuery.refetch() : undefined}
      />
    )
  }

  if ((groupsQuery.data ?? []).length === 0) {
    return (
      <>
        <EmptyState
          title="No groups yet."
          body="Create your first group to get started."
          action={
            <button
              type="button"
              className="button button--primary"
              style={{ width: 'auto' }}
              onClick={() => setShowCreateGroup(true)}
            >
              + Create Group
            </button>
          }
        />
        {showCreateGroup && (
          <CreateGroupSheet
            onCreate={async (name) => {
              const group = await createGroupMutation.mutateAsync(name)
              setCurrentGroupId(group.id)
              setShowCreateGroup(false)
            }}
            onCancel={() => setShowCreateGroup(false)}
          />
        )}
      </>
    )
  }

  if (!currentGroupId) {
    return <LoadingState />
  }

  return <>{children}</>
}
