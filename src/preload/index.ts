import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

/** The only bridge between the UI and the main process. Inputs are validated in main with zod. */
const api = {
  invoke: (
    name: string,
    input?: unknown
  ): Promise<{ ok: boolean; data?: unknown; error?: string; code?: string }> =>
    ipcRenderer.invoke('api', name, input),
  on: (
    channel: 'jobs:update' | 'jobs:token' | 'notify' | 'navigate',
    cb: (payload: unknown) => void
  ): (() => void) => {
    const listener = (_e: IpcRendererEvent, payload: unknown) => cb(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type PreloadApi = typeof api
