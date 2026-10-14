import { createContext, useContext } from 'react'

export interface AssistantContextValue {
  // Opens the demo assistant sheet. It is only ever provided in demo mode, so
  // callers must check for null before showing an "Ask" control.
  openAssistant: (() => void) | null
}

export const AssistantContext = createContext<AssistantContextValue>({ openAssistant: null })

export function useAssistant(): AssistantContextValue {
  return useContext(AssistantContext)
}
