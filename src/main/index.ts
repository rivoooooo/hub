import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { existsSync, copyFileSync, mkdirSync } from 'fs'
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
import { getConfigDir } from './config-dir'
import { runInSandbox } from './sandbox'
import * as bridgeCallStore from './bridge-call-store'
import type { ConsoleOutputEntry } from './bridge-call-store'

/** Safe JSON.stringify — returns a string even for circular/referenceError cases. */
function safeJsonStringify(val: unknown): string {
  try {
    return JSON.stringify(val)
  } catch {
    return String(val)
  }
}

/** Generate a short unique trace ID. */
function makeTraceId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/**
 * Strip injector-internal frames from a stack trace.
 * Also removes anonymous (<anonymous>:…) frames which carry no useful
 * file-path information (e.g. calls from DevTools console).
 * Returns undefined when no meaningful frames remain.
 */
function cleanStack(stack: string | undefined): string | undefined {
  if (!stack) return undefined
  const lines = stack.split('\n')
  const kept = lines.filter(
    (line) => !line.includes('__bridge-injector__') && !line.includes('<anonymous>')
  )
  // Nothing useful left — don't store a stack at all
  if (kept.length <= 1) return undefined
  return kept.join('\n')
}

// Whether this process was spawned as an app-runner child (dock app window).
// In dev mode Electron loads app-runner.js directly from the CLI; in packaged
// mode the binary always loads index.js so we must delegate here.
const IS_APP_RUNNER = process.argv.includes('--app-runner')

if (IS_APP_RUNNER) {
  // Load the standalone app-runner entry (compiled by build-app-runner.mjs).
  // The app-runner registers its own app.whenReady() handler and manages its
  // own window lifecycle.  Use a computed require to prevent the bundler from
  // trying to inline the CJS module at build time.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(join(__dirname, 'app-runner.js'))
}

if (!IS_APP_RUNNER) {
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
    frame?: boolean
  } {
    return {
      titleBarStyle: 'hidden',
      titleBarOverlay: process.platform === 'darwin' ? { height: 47 } : undefined,
      frame: process.platform === 'linux' ? false : undefined
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
      minWidth: 900,
      minHeight: 600,
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
  app
    .whenReady()
    .then(() => {
      // Initialize the logger — write a startup message to ensure
      // electron-log creates its directory and log file on disk.
      getLogger().info('App started')

      // --------------------------------------------------
      // Migrate config files from the old userData directory
      // to ~/.rivo (the dedicated config directory).
      // Only copies when the source exists and the destination
      // does not (one-time migration per file).
      // --------------------------------------------------
      migrateConfigFile('settings.json')
      migrateConfigFile('apps.json')
      migrateConfigFile('bridge-config.json')

      // Set app user model id for windows
      electronApp.setAppUserModelId('com.rivo.hub')

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
          width: 950,
          height: 600,
          minWidth: 950,
          minHeight: 400,
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
      ipcMain.handle('browser:set-user-agent', (_event, ua: string) =>
        browserManager!.setUserAgent(ua)
      )

      // Window controls for main/toolbar windows (used with custom title bars on Linux)
      ipcMain.handle('win:minimize', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        if (win) win.minimize()
      })
      ipcMain.handle('win:maximize-toggle', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        if (win) {
          if (win.isMaximized()) win.unmaximize()
          else win.maximize()
        }
      })
      ipcMain.handle('win:close', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        if (win) win.close()
      })
      ipcMain.handle('win:is-maximized', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        return win ? win.isMaximized() : false
      })

      // Settings
      ipcMain.handle('settings:get', () => settings.getAll())
      ipcMain.handle('settings:set', (_event, key: string, value: unknown) => {
        settings.set(key as keyof settings.SettingsData, value as never)
      })

      // Config directory
      ipcMain.handle('config-dir:get', () => getConfigDir())

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
      ipcMain.handle(
        'bridge:call',
        (_event, path: string[], args: unknown[], meta?: { stack?: string }) => {
          const config = bridgeStore.getRaw()
          const sourceUrl = _event.senderFrame?.url ?? ''

          // -----------------------------------------------------------------------
          // Reserved: __bridgeCallLog — sync+custom call log forwarding
          // -----------------------------------------------------------------------
          if (path[0] === '__bridgeCallLog') {
            const entry = args as unknown as {
              path: string
              args: unknown[]
              result: unknown
              error: string | null
              durationMs: number
              mode: 'custom' | 'static' | 'declarative'
              stack?: string
              consoleOutput?: ConsoleOutputEntry[]
              sourceUrl?: string
            }
            bridgeCallStore.push({
              ...entry,
              stack: cleanStack(entry.stack),
              sync: true,
              timestamp: Date.now()
            })
            return undefined
          }

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
          const label = path.join('.')
          const startTime = performance.now()
          let result: unknown
          let error: string | null = null
          let sandboxConsoleOutput: ConsoleOutputEntry[] | undefined

          try {
            switch (mode) {
              case 'static': {
                const val = fnConfig.returnValue ?? ''
                try {
                  result = JSON.parse(val)
                } catch {
                  result = val
                }
                break
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
                          result = JSON.parse(entry.returnValue)
                        } catch {
                          result = entry.returnValue
                        }
                      } else {
                        result = null
                      }
                      break
                    }
                  }
                  if (result === undefined) {
                    // No entry matched
                    if (fnConfig.fallbackReturnValue) {
                      try {
                        result = JSON.parse(fnConfig.fallbackReturnValue)
                      } catch {
                        result = fnConfig.fallbackReturnValue
                      }
                    } else {
                      error = 'declarative: no matching entry and no fallback'
                    }
                  }
                  break
                }

                // --- Legacy: per-param positional matching (backward compat) ---
                // Note: by this point migrateTreeParams has converted old ParamRule[]
                // into ParamDef[] + MatchEntry[], so this path only runs when params
                // are defined without matchEntries — simply return mockReturnValue.
                if (fnConfig.params && fnConfig.params.length > 0) {
                  if (fnConfig.mockReturnValue) {
                    try {
                      result = JSON.parse(fnConfig.mockReturnValue)
                    } catch {
                      result = fnConfig.mockReturnValue
                    }
                  } else if (fnConfig.fallbackReturnValue) {
                    try {
                      result = JSON.parse(fnConfig.fallbackReturnValue)
                    } catch {
                      result = fnConfig.fallbackReturnValue
                    }
                  } else {
                    result = null
                  }
                  break
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
                    error = 'declarative value mismatch'
                    break
                  }
                }
                if (fnConfig.mockReturnValue) {
                  try {
                    result = JSON.parse(fnConfig.mockReturnValue)
                  } catch {
                    result = fnConfig.mockReturnValue
                  }
                } else {
                  result = null
                }
                break
              }

              case 'custom': {
                const sr = runInSandbox(fnConfig.codeString ?? '', args, label)
                result = sr.result
                if (sr.consoleOutput.length > 0) {
                  sandboxConsoleOutput = sr.consoleOutput
                }
                break
              }

              default:
                error = `unknown mode: ${mode}`
            }
          } catch (err) {
            error = err instanceof Error ? err.message : String(err)
            if (mode === 'custom') {
              error = `custom function error: ${error}`
            }
          }

          const durationMs = Math.round(performance.now() - startTime)

          // Log the call
          bridgeCallStore.push({
            timestamp: Date.now(),
            path: label,
            args,
            result: error ? undefined : result,
            error,
            durationMs,
            mode: mode as 'custom' | 'static' | 'declarative',
            sync: false,
            stack: cleanStack(meta?.stack),
            consoleOutput: sandboxConsoleOutput,
            sourceUrl,
            traceId: makeTraceId(),
            argsSize: safeJsonStringify(args).length
          })

          if (error) {
            return { error }
          }
          return result
        }
      )

      // Bridge call log — read / clear / delete stored call entries
      ipcMain.handle('bridge-call-log:get', () => bridgeCallStore.getAll())
      ipcMain.handle('bridge-call-log:get-page', (_event, page: number, pageSize: number) =>
        bridgeCallStore.getPage(page, pageSize)
      )
      ipcMain.handle('bridge-call-log:get-by-id', (_event, id: number) =>
        bridgeCallStore.getById(id)
      )
      ipcMain.handle('bridge-call-log:delete', (_event, id: number) => bridgeCallStore.remove(id))
      ipcMain.handle('bridge-call-log:clear', () => {
        bridgeCallStore.clear()
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

      ipcMain.handle(
        'logs:read-file',
        (_event, filepath: string, offset?: number, limit?: number) => {
          return logStore.readFile(filepath, offset, limit)
        }
      )

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
      ipcMain.handle('logs:is-favorite', (_event, filepath: string) =>
        logStore.isFavorite(filepath)
      )

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
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err)
      getLogger().error(`Fatal startup error: ${message}`, {
        error: message,
        stack: err instanceof Error ? err.stack : undefined
      })
      dialog.showErrorBox('Startup Error', message)
      app.quit()
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
} // end if (!IS_APP_RUNNER)

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Copy a config file from the old userData location to the new config
 * directory (~/.rivo) if the source exists and the destination does not.
 * This is a one-time migration per file, triggered at app startup.
 */
function migrateConfigFile(filename: string): void {
  const src = join(app.getPath('userData'), filename)
  const dst = join(getConfigDir(), filename)

  if (existsSync(src) && !existsSync(dst)) {
    try {
      mkdirSync(getConfigDir(), { recursive: true })
      copyFileSync(src, dst)
      getLogger().info(`Migrated config: ${filename} → ${dst}`)
    } catch (err) {
      getLogger().error(`Failed to migrate ${filename}:`, err)
    }
  }
}

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
