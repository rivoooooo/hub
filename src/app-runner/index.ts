/**
 * App Runner — a lightweight Electron entry point that creates a single
 * window for a dock app.  This process is spawned by the main process
 * so that each dock app gets its own OS-level dock / taskbar entry.
 *
 * Usage:  --app-runner --app-id <uuid>
 *
 * The app config is read from the shared apps.json (written by apps-store.ts).
 */

import { app, BrowserWindow, nativeImage } from 'electron'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------

const appIdIndex = process.argv.indexOf('--app-id')
const APP_ID = appIdIndex !== -1 ? process.argv[appIdIndex + 1] : null

if (!APP_ID) {
  console.error('app-runner: missing --app-id argument')
  process.exit(1)
}

// Read the parent app name so userData path matches
const appNameIndex = process.argv.indexOf('--app-name')
const APP_NAME = appNameIndex !== -1 ? process.argv[appNameIndex + 1] : undefined

if (APP_NAME) {
  app.setName(APP_NAME)
}

// ---------------------------------------------------------------------------
// Read app config from the shared apps.json
// ---------------------------------------------------------------------------

interface DockWindowConfig {
  width: number
  height: number
  titleBarStyle: 'default' | 'hidden' | 'none'
  frame: boolean
}

interface DockApp {
  id: string
  name: string
  url: string
  iconDataUrl: string
  windowConfig: DockWindowConfig
  userAgent?: string
  /** JSON with keys: common, isMacos, isWindows, isLinux */
  customCss?: string
  createdAt: number
}

function readAppConfig(id: string): DockApp | null {
  const appsFile = join(app.getPath('userData'), 'apps.json')
  if (!existsSync(appsFile)) {
    console.error(`app-runner: apps.json not found at ${appsFile}`)
    return null
  }
  try {
    const raw = readFileSync(appsFile, 'utf-8')
    const apps: DockApp[] = JSON.parse(raw)
    return apps.find((a) => a.id === id) ?? null
  } catch (err) {
    console.error('app-runner: failed to read apps.json', err)
    return null
  }
}

// ---------------------------------------------------------------------------
// Drag-support CSS (injected into <body>)
// ---------------------------------------------------------------------------

const DRAG_CSS = `
  body {
    -webkit-app-region: drag !important;
    margin: 0;
    padding: 0;
    cursor: default;
    user-select: none;
  }
  input, textarea, button, select, a, [contenteditable], [tabindex],
  label, [role="button"], [role="link"], [role="checkbox"], [role="radio"],
  [role="switch"], [draggable="true"], audio, video, iframe, embed, object {
    -webkit-app-region: no-drag !important;
    user-select: auto;
  }
`

// ---------------------------------------------------------------------------
// Window creation logic (mirrors the original DockWindowManager.launch)
// ---------------------------------------------------------------------------

function createAppWindow(appCfg: DockApp): void {
  const { width, height, titleBarStyle, frame } = appCfg.windowConfig

  const windowOpts: Electron.BrowserWindowConstructorOptions = {
    width,
    height,
    autoHideMenuBar: true,
    title: appCfg.name
  }

  // Apply frame / titleBarStyle
  if (!frame) {
    windowOpts.frame = false
  } else if (titleBarStyle === 'hidden') {
    windowOpts.titleBarStyle = 'hidden'
    windowOpts.titleBarOverlay = process.platform === 'darwin' ? { height: 38 } : undefined
  } else if (titleBarStyle === 'none') {
    windowOpts.frame = false
  }

  // Set app icon for OS taskbar/dock
  if (appCfg.iconDataUrl) {
    try {
      const img = nativeImage.createFromDataURL(appCfg.iconDataUrl)
      if (!img.isEmpty()) {
        windowOpts.icon = img
      }
    } catch {
      // best-effort
    }
  }

  const win = new BrowserWindow(windowOpts)

  // Resolve effective User-Agent
  if (appCfg.userAgent) {
    win.webContents.userAgent = appCfg.userAgent
  }

  // Inject drag-support CSS
  const injectDragCSS = (): void => {
    win.webContents.insertCSS(DRAG_CSS).catch(() => {})
  }

  // Inject user-defined custom CSS
  const injectCustomCSS = (): void => {
    const platformClass =
      process.platform === 'darwin'
        ? 'is-macos'
        : process.platform === 'win32'
          ? 'is-windows'
          : 'is-linux'

    win.webContents
      .executeJavaScript(`document.documentElement.classList.add('${platformClass}')`)
      .catch(() => {})

    if (!appCfg.customCss) return

    let parts: Record<string, string>
    try {
      parts = JSON.parse(appCfg.customCss)
    } catch {
      return
    }

    if (parts.common) {
      win.webContents.insertCSS(parts.common).catch(() => {})
    }

    const platformKey =
      platformClass === 'is-macos'
        ? 'isMacos'
        : platformClass === 'is-windows'
          ? 'isWindows'
          : 'isLinux'

    const platformCss = parts[platformKey]
    if (platformCss) {
      win.webContents.insertCSS(`.${platformClass} {\n${platformCss}\n}`).catch(() => {})
    }
  }

  win.webContents.on('did-finish-load', () => {
    injectDragCSS()
    injectCustomCSS()
  })

  // Notify parent process that we're ready
  console.log(JSON.stringify({ type: 'ready', appId: APP_ID }))

  // Load the target URL
  void win.loadURL(appCfg.url)

  // When the window is closed, quit this process
  win.on('closed', () => {
    console.log(JSON.stringify({ type: 'closed', appId: APP_ID }))
    app.quit()
  })
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  // OS-specific optimisations for taskbar / dock separation
  if (process.platform === 'win32') {
    // Set a unique AppUserModelId so the taskbar entry is fully independent
    app.setAppUserModelId(`com.electron.dev-browser.app-runner.${APP_ID}`)
  }
  const appCfg = readAppConfig(APP_ID!)
  if (!appCfg) {
    console.error(`app-runner: app ${APP_ID} not found in apps.json`)
    app.quit()
    return
  }

  // macOS: set dock icon for the app
  if (process.platform === 'darwin' && appCfg.iconDataUrl && app.dock) {
    try {
      const img = nativeImage.createFromDataURL(appCfg.iconDataUrl)
      if (!img.isEmpty()) {
        app.dock.setIcon(img)
      }
    } catch {
      // best-effort
    }
  }

  createAppWindow(appCfg)
})

// Prevent the default Electron app quit on all-windows-closed — we manage it
// ourselves via win.on('closed') above.
app.on('window-all-closed', () => {
  // no-op (the window 'closed' handler calls app.quit())
})
