import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { BrowserManager } from './browser-manager'
import * as settings from './settings-store'

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
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

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

  // Settings
  ipcMain.handle('settings:get', () => settings.getAll())
  ipcMain.handle('settings:set', (_event, key: string, value: unknown) => {
    settings.set(key as keyof settings.SettingsData, value as never)
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

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
