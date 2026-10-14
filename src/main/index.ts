import {
  app,
  BrowserWindow,
  ipcMain,
  safeStorage,
  shell,
  protocol,
  net,
  Notification,
  dialog,
  nativeTheme
} from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mkdirSync } from 'node:fs'
import { setRuntime } from './runtime'
import { openDb, closeDb } from './db'
import { primeSecretRedaction } from './secrets'
import { log } from './logger'
import { dispatch } from './ipc'
import { registerAllHandlers } from './jobs/handlers'
import { resumeAfterRestart, kick } from './jobs/queue'
import { startScheduler, stopScheduler } from './jobs/scheduler'
import { getImage } from './pipeline/images'
import { getSetting } from './settings'
import { APP_NAME, APP_ID } from '@shared/constants'

const devMode = process.env.AUTBOT_DEV === '1'
if (process.env.AUTBOT_USER_DATA) app.setPath('userData', process.env.AUTBOT_USER_DATA)
app.setName(APP_NAME)
if (process.platform === 'win32') app.setAppUserModelId(APP_ID)

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'autbot-media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 680,
    show: false,
    title: APP_NAME,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b1220' : '#ffffff',
    autoHideMenuBar: true,
    icon: join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  })
  mainWindow.on('ready-to-show', () => mainWindow?.show())
  // Links open in the user's browser, never inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('file://')) {
      e.preventDefault()
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    }
  })
  if (process.env.ELECTRON_RENDERER_URL) void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

function initRuntime(): void {
  const dataDir = app.getPath('userData')
  mkdirSync(dataDir, { recursive: true })
  setRuntime({
    dataDir,
    appVersion: app.getVersion(),
    devMode,
    cipher: {
      available: () => safeStorage.isEncryptionAvailable(),
      encrypt: (s) => safeStorage.encryptString(s),
      decrypt: (b) => safeStorage.decryptString(b)
    },
    broadcast: (channel, payload) => {
      for (const w of BrowserWindow.getAllWindows())
        if (!w.isDestroyed()) w.webContents.send(channel, payload)
    },
    notify: (title, body) => {
      if (Notification.isSupported()) new Notification({ title, body }).show()
    },
    openExternal: (url) => shell.openExternal(url),
    openPath: async (p) => {
      await shell.openPath(p)
    },
    saveDialog: async (opts) => {
      const r = await dialog.showSaveDialog(mainWindow ?? undefined!, {
        title: opts.title,
        defaultPath: join(app.getPath('downloads'), opts.defaultPath),
        filters: opts.filters
      })
      return r.canceled || !r.filePath ? null : r.filePath
    },
    openDialog: async (opts) => {
      const r = await dialog.showOpenDialog(mainWindow ?? undefined!, {
        title: opts.title,
        filters: opts.filters,
        properties: [
          opts.folder ? 'openDirectory' : 'openFile',
          ...(opts.multiple ? (['multiSelections'] as const) : []),
          'createDirectory'
        ]
      })
      return r.canceled ? [] : r.filePaths
    }
  })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()
else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    initRuntime()
    log.info(`${APP_NAME} ${app.getVersion()} starting${devMode ? ' (developer mode)' : ''}`)
    openDb()
    primeSecretRedaction()
    nativeTheme.themeSource = getSetting('theme')

    protocol.handle('autbot-media', (req) => {
      const m = new URL(req.url).pathname.match(/(\d+)/)
      try {
        const im = getImage(Number(m?.[1]))
        return net.fetch(pathToFileURL(im.filePath).toString())
      } catch {
        return new Response('Not found', { status: 404 })
      }
    })

    ipcMain.handle('api', async (_e, name: string, input: unknown) => {
      const r = await dispatch(name, input)
      if (name === 'settings.set' && (input as { key?: string })?.key === 'theme')
        nativeTheme.themeSource = getSetting('theme')
      return r
    })

    registerAllHandlers()
    const resumed = resumeAfterRestart()
    if (resumed) log.info(`Resumed ${resumed} job(s) after restart`)
    startScheduler()
    createWindow()
    kick()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    stopScheduler()
    closeDb()
  })

  process.on('uncaughtException', (e) => log.error('Uncaught exception', e))
  process.on('unhandledRejection', (e) => log.error('Unhandled rejection', e))
}
