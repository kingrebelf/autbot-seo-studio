/**
 * Everything that depends on Electron is injected here by `index.ts`, so the rest of the
 * main-process code can run (and be unit-tested) in plain Node.
 */
export interface Cipher {
  available(): boolean
  encrypt(plain: string): Buffer
  decrypt(data: Buffer): string
}

export interface Runtime {
  dataDir: string
  appVersion: string
  cipher: Cipher
  /** Send an event to every renderer window. */
  broadcast(channel: string, payload: unknown): void
  /** Show an OS notification. */
  notify(title: string, body: string): void
  /** Open a URL in the user's default browser. */
  openExternal(url: string): Promise<void>
  /** Reveal a folder in the OS file manager. */
  openPath(path: string): Promise<void>
  devMode: boolean
  /** Ask the user where to save a file. Returns null if they cancel. */
  saveDialog(opts: {
    title: string
    defaultPath: string
    filters?: { name: string; extensions: string[] }[]
  }): Promise<string | null>
  /** Ask the user to pick files or a folder. Returns [] if they cancel. */
  openDialog(opts: {
    title: string
    filters?: { name: string; extensions: string[] }[]
    folder?: boolean
    multiple?: boolean
  }): Promise<string[]>
  /** Quit the app (used to hand over to an update installer). Optional outside Electron. */
  quit?(): void
}

let current: Runtime | null = null

export function setRuntime(r: Runtime): void {
  current = r
}

export function rt(): Runtime {
  if (!current) throw new Error('Runtime not initialised')
  return current
}
