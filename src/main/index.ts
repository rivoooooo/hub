import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { BrowserManager } from './browser-manager'
import * as settings from './settings-store'
import * as bridgeStore from './bridge-store'
import { registerSeoHandlers } from './seo'
import { DockWindowManager } from './dock-window-manager'
import * as appsStore from './apps-store'
import * as logStore from './log-store'
import { getLogger } from './logger'

// If this is an app-runner child process, exit immediately —
// the app-runner entry point handles that case separately.
if (process.argv.includes('--app-runner')) {
  process.exit(0)
}

// Single instance lock — prevent multiple app instances.
// On Windows/Linux, clicking the taskbar icon will trigger 'second-instance'
// instead of launching a duplicate process.
const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      // Main window exists — restore and focus it
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    } else if (isReady) {
      // Main window was closed — re-create it
      createWindow()
    }
    // If not ready yet, the normal startup flow in app.whenReady() will create
    // the window, so there's nothing to do here.
  })
}

let browserManager: BrowserManager | null = null
let dockWindowManager: DockWindowManager | null = null
let mainWindow: BrowserWindow | null = null
let isReady = false

function titleBarOptions(): {
  titleBarStyle?: 'hidden' | 'default'
  titleBarOverlay?: { height: number }
} {
  return {
    titleBarStyle: 'hidden',
    titleBarOverlay: process.platform === 'darwin' ? { height: 47 } : undefined
  }
}

function createWindow(): void {
  // If a main window already exists, just restore and focus it.
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
    return
  }

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...titleBarOptions(),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Initialize the logger — write a startup message to ensure
  // electron-log creates its directory and log file on disk.
  getLogger().info('App started')

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => getLogger().debug('pong'))

  // Logger — receive log messages from the renderer via IPC
  ipcMain.on('logger:log', (_event, level: string, message: string, ...args: unknown[]) => {
    const logger = getLogger().withContext({ source: 'renderer' })
    switch (level) {
      case 'debug':
        logger.debug(message, ...args)
        break
      case 'info':
        logger.info(message, ...args)
        break
      case 'warn':
        logger.warn(message, ...args)
        break
      case 'error':
        logger.error(message, ...args)
        break
      default:
        logger.info(message, ...args)
    }
  })

  // Open a route in a new window
  ipcMain.on('open-route', (_event, route: string) => {
    const childWindow = new BrowserWindow({
      width: 700,
      height: 500,
      autoHideMenuBar: true,
      ...titleBarOptions(),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      childWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#${route}`)
    } else {
      childWindow.loadFile(join(__dirname, '../renderer/index.html'), {
        hash: route
      })
    }
  })

  // Browser control
  browserManager = new BrowserManager()

  ipcMain.handle('browser:open', () => browserManager!.open())
  ipcMain.handle('browser:close', () => browserManager!.close())
  ipcMain.handle('browser:navigate', (_event, url: string) => browserManager!.navigate(url))
  ipcMain.handle('browser:resize', (_event, width: number, height: number) =>
    browserManager!.resize(width, height)
  )
  ipcMain.handle('browser:lock', (_event, locked: boolean) => browserManager!.setLock(locked))
  ipcMain.handle('browser:get-state', () => browserManager!.getState())

  // Window controls for the browser wrapper toolbar
  ipcMain.handle('browser:minimize', () => browserManager!.minimize())
  ipcMain.handle('browser:maximize-toggle', () => browserManager!.toggleMaximize())
  ipcMain.handle('browser:close-window', () => browserManager!.close())
  ipcMain.handle('browser:open-devtools', () => browserManager!.openDevTools())
  ipcMain.handle('browser:set-user-agent', (_event, ua: string) => browserManager!.setUserAgent(ua))

  // Settings
  ipcMain.handle('settings:get', () => settings.getAll())
  ipcMain.handle('settings:set', (_event, key: string, value: unknown) => {
    settings.set(key as keyof settings.SettingsData, value as never)
  })

  // Bridge (async — used by renderer settings UI)
  ipcMain.handle('bridge:get-config', () => bridgeStore.getConfig())
  ipcMain.handle('bridge:set-config', (_event, config: bridgeStore.BridgeConfig) => {
    bridgeStore.setConfig(config)
    // Notify all browser WebContentsViews to refresh bridge
    browserManager?.refreshBridge()
  })
  ipcMain.handle('bridge:export-config', () => bridgeStore.exportConfig())
  ipcMain.handle('bridge:import-config', (_event, json: string) => {
    const config = bridgeStore.importConfig(json)
    browserManager?.refreshBridge()
    return config
  })

  // Bridge IPC call — routes calls from injected Proxy on target pages
  ipcMain.handle('bridge:call', (_event, path: string[], args: unknown[]) => {
    const config = bridgeStore.getRaw()
    if (!config.enabled) {
      return { error: 'bridge is disabled' }
    }

    // Walk the tree following the path segments
    let node: bridgeStore.BridgeNode | undefined
    let level: bridgeStore.BridgeNode[] = config.tree

    for (const segment of path) {
      node = level.find((n) => n.name === segment)
      if (!node) {
        return { error: `path '${path.join('.')}' not found` }
      }
      level = node.children ?? []
    }

    if (!node) {
      return { error: `path '${path.join('.')}' not found` }
    }

    // --- Object type — return mock value if configured ---
    if (node.type === 'object') {
      if (node.objectConfig?.returnValue) {
        try {
          return JSON.parse(node.objectConfig.returnValue)
        } catch {
          return node.objectConfig.returnValue
        }
      }
      return { error: `'${path.join('.')}' is an object and cannot be called` }
    }

    // --- Function type — apply mode routing ---
    const fnConfig = node.functionConfig
    if (!fnConfig) {
      return { error: `function '${path.join('.')}' has no config` }
    }

    const mode = fnConfig.mode ?? 'static'

    switch (mode) {
      case 'static': {
        const val = fnConfig.returnValue ?? ''
        try {
          return JSON.parse(val)
        } catch {
          return val
        }
      }

      case 'declarative': {
        // --- New: matchEntries (named conditions) ---
        if (fnConfig.matchEntries && fnConfig.matchEntries.length > 0) {
          const params = fnConfig.params ?? []
          for (const entry of fnConfig.matchEntries) {
            const allMatch = entry.conditions.every((cond) => {
              // Find the parameter index by name
              const paramIdx = params.findIndex((p) => p.name === cond.paramName)
              if (paramIdx === -1) return false // unknown param → entry fails
              const arg = args[paramIdx]
              // If arg is undefined and param is optional, condition passes
              if (arg === undefined) {
                const param = params[paramIdx]
                if (param.optional) return true
                return false
              }
              // No matchValue → accept any value
              if (!cond.matchValue) return true
              try {
                const matchObj = JSON.parse(cond.matchValue)
                return deepEqual(arg, matchObj)
              } catch {
                return String(arg) === cond.matchValue
              }
            })
            if (allMatch) {
              if (entry.returnValue) {
                try {
                  return JSON.parse(entry.returnValue)
                } catch {
                  return entry.returnValue
                }
              }
              return null
            }
          }
          // No entry matched
          if (fnConfig.fallbackReturnValue) {
            try {
              return JSON.parse(fnConfig.fallbackReturnValue)
            } catch {
              return fnConfig.fallbackReturnValue
            }
          }
          return { error: 'declarative: no matching entry and no fallback' }
        }

        // --- Legacy: per-param positional matching (backward compat) ---
        // Note: by this point migrateTreeParams has converted old ParamRule[]
        // into ParamDef[] + MatchEntry[], so this path only runs when params
        // are defined without matchEntries — simply return mockReturnValue.
        if (fnConfig.params && fnConfig.params.length > 0) {
          if (fnConfig.mockReturnValue) {
            try {
              return JSON.parse(fnConfig.mockReturnValue)
            } catch {
              return fnConfig.mockReturnValue
            }
          }
          // No mockReturnValue but params exist: try fallback
          if (fnConfig.fallbackReturnValue) {
            try {
              return JSON.parse(fnConfig.fallbackReturnValue)
            } catch {
              return fnConfig.fallbackReturnValue
            }
          }
          return null
        }

        // Legacy path — single matchValue against args[0]
        if (fnConfig.matchValue) {
          const value = args.length > 0 ? args[0] : undefined
          let matched = false
          try {
            const matchObj = JSON.parse(fnConfig.matchValue)
            matched = deepEqual(value, matchObj)
          } catch {
            matched = String(value) === fnConfig.matchValue
          }
          if (!matched) {
            return { error: 'declarative value mismatch' }
          }
        }
        if (fnConfig.mockReturnValue) {
          try {
            return JSON.parse(fnConfig.mockReturnValue)
          } catch {
            return fnConfig.mockReturnValue
          }
        }
        return null
      }

      case 'custom': {
        const codeStr = fnConfig.codeString
        if (!codeStr) {
          return { error: 'custom function has no code' }
        }
        try {
          const fn = new Function('args', `return (${codeStr})(args)`)
          return fn(args)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          return { error: `custom function error: ${msg}` }
        }
      }

      default:
        return { error: `unknown mode: ${mode}` }
    }
  })

  // SEO analysis
  registerSeoHandlers()

  // --------------------------------------------------
  // Dock (App Center)
  // --------------------------------------------------
  dockWindowManager = new DockWindowManager()

  ipcMain.handle('dock:get-apps', () => appsStore.getAll())

  ipcMain.handle(
    'dock:install-app',
    (_event, appData: Omit<appsStore.DockApp, 'id' | 'createdAt'>) => appsStore.add(appData)
  )

  ipcMain.handle('dock:uninstall-app', (_event, id: string) => appsStore.remove(id))

  ipcMain.handle('dock:update-app', (_event, id: string, patch: Partial<appsStore.DockApp>) => {
    const updated = appsStore.update(id, patch)
    if (!updated) throw new Error(`App ${id} not found`)
    return updated
  })

  ipcMain.handle('dock:launch-app', (_event, id: string) => {
    const app = appsStore.get(id)
    if (!app) throw new Error(`App ${id} not found`)
    dockWindowManager!.launch(app)
  })

  // Dock running-state queries
  ipcMain.handle('dock:get-running-apps', () => dockWindowManager!.getRunningIds())

  ipcMain.handle('dock:close-app', (_event, id: string) => {
    dockWindowManager!.close(id)
  })

  // Forward running-state changes to all renderer windows
  dockWindowManager.onStateChange((runningIds) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue
      win.webContents.send('dock:running-state-changed', runningIds)
    }
  })

  // --------------------------------------------------
  // Logs
  // --------------------------------------------------

  ipcMain.handle('logs:read-file', (_event, filepath: string, offset?: number, limit?: number) => {
    return logStore.readFile(filepath, offset, limit)
  })

  ipcMain.handle('logs:list-directory', (_event, dirpath: string) => {
    return logStore.listDirectory(dirpath)
  })

  ipcMain.handle('logs:get-data-dir', () => {
    return logStore.getDataDir()
  })

  ipcMain.handle('logs:get-logs-dir', () => {
    return logStore.getLogsDir()
  })

  ipcMain.handle('logs:open-path', async (_event, filepath: string) => {
    return shell.openPath(filepath)
  })

  ipcMain.handle('logs:path-exists', (_event, filepath: string) => {
    return logStore.pathExists(filepath)
  })

  ipcMain.handle('logs:is-directory', (_event, filepath: string) => {
    return logStore.isDirectory(filepath)
  })

  // Recents
  ipcMain.handle('logs:get-recents', () => logStore.getRecents())
  ipcMain.handle('logs:add-recent', (_event, filepath: string) => logStore.addRecent(filepath))
  ipcMain.handle('logs:remove-recent', (_event, filepath: string) =>
    logStore.removeRecent(filepath)
  )
  ipcMain.handle('logs:clear-recents', () => logStore.clearRecents())

  // Favorites
  ipcMain.handle('logs:get-favorites', () => logStore.getFavorites())
  ipcMain.handle('logs:add-favorite', (_event, filepath: string, label?: string) =>
    logStore.addFavorite(filepath, label)
  )
  ipcMain.handle('logs:remove-favorite', (_event, filepath: string) =>
    logStore.removeFavorite(filepath)
  )
  ipcMain.handle('logs:is-favorite', (_event, filepath: string) => logStore.isFavorite(filepath))

  // Watch — start watching a file and push updates to all renderers
  ipcMain.handle('logs:watch-start', (_event, filepath: string) => {
    logStore.startWatching(filepath, (content) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (win.isDestroyed()) continue
        win.webContents.send('logs:file-changed', filepath, content)
      }
    })
  })

  ipcMain.handle('logs:watch-stop', (_event, filepath: string) => {
    logStore.stopWatching(filepath)
  })

  // Resolve log type
  ipcMain.handle('logs:infer-type', (_event, filepath: string) => {
    return logStore.inferType(filepath)
  })

  createWindow()
  isReady = true

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (!mainWindow) createWindow()
  })
})

// Keep the app alive when all windows are closed (like a tray/background app).
// On all platforms, closing the main window hides it but the app continues
// running.  The user can re-open it via the Dock / taskbar / launcher icon.
app.on('window-all-closed', () => {
  if (browserManager) {
    browserManager.close()
  }
  // Don't quit — stay alive so clicking the launcher can re-create the window.
})

// Clean up dock windows when the app is about to quit
app.on('will-quit', () => {
  logStore.stopAllWatching()
  if (dockWindowManager) {
    dockWindowManager.closeAll()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursive deep-equal for declarative value matching. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null || b == null) return false
  if (typeof a !== typeof b) return false
  if (typeof a === 'object') {
    const aObj = a as Record<string, unknown>
    const bObj = b as Record<string, unknown>
    const aKeys = Object.keys(aObj)
    const bKeys = Object.keys(bObj)
    if (aKeys.length !== bKeys.length) return false
    return aKeys.every((key) => deepEqual(aObj[key], bObj[key]))
  }
  return a === b
}
