import { createContext, useContext } from 'react'
import type { Editor } from '@tiptap/react'
import type { Site } from '@/lib/app-context'
import type { Checks, ContentView, RightTab } from './types'

export interface EditorCtx {
  content: ContentView
  checks: Checks
  site: Site | null
  editor: Editor | null
  /** Put a fresh content record (returned by a route) on screen. `syncBody` also loads its body into the editor. */
  applyContent: (c: ContentView, opts?: { syncBody?: boolean }) => void
  reload: () => Promise<void>
  /** Save pending edits now (call before anything that changes the body on the server). */
  flushSave: () => Promise<void>
  setTab: (t: RightTab) => void
}

const Ctx = createContext<EditorCtx | null>(null)
export const EditorProvider = Ctx.Provider

export function useEditorCtx(): EditorCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useEditorCtx outside EditorProvider')
  return c
}
