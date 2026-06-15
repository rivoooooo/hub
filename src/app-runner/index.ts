/**
 * App Runner — a lightweight Electron entry point that creates a single
 * window for a dock app.  This process is spawned by the main process
 * so that each dock app gets its own OS-level dock / taskbar entry.
 *
 * Each app runner sets the OS-level app name (`app.setName`), taskbar/dock
 * icon (`windowOpts.icon` / `app.dock.setIcon`), and window title to the
 * dock app's configured name, giving every app an independent identity.
 *
 * Usage:  --app-runner --app-id <uuid> --app-name <name> --user-data-path <path> --config-dir <path>
 *
 * The app config is read from the shared apps.json (written by apps-store.ts).
 */

import { app, BrowserWindow, nativeImage } from 'electron'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { get as httpsGet } from 'https'
import { get as httpGet } from 'http'
import { getLogger } from './logger'

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------

const appIdIndex = process.argv.indexOf('--app-id')
const APP_ID = appIdIndex !== -1 ? process.argv[appIdIndex + 1] : null

if (!APP_ID) {
  getLogger().error('Missing --app-id argument')
  process.exit(1)
}

// Read the parent app name so the OS-level name (e.g. Dock, taskbar) reflects
// the dock app's name rather than 'Electron' or 'rivo-hub'.
const appNameIndex = process.argv.indexOf('--app-name')
const APP_NAME = appNameIndex !== -1 ? process.argv[appNameIndex + 1] : undefined

getLogger().info('app-runner starting', { appId: APP_ID, appName: APP_NAME ?? '(none)' })

if (APP_NAME) {
  app.setName(APP_NAME)
}

// Read the parent's userData path so we can find apps.json in the right place
// (app.setName above changes getPath('userData'), so we use the explicit path)
const userDataIndex = process.argv.indexOf('--user-data-path')
const USER_DATA_PATH = userDataIndex !== -1 ? process.argv[userDataIndex + 1] : undefined

// Read the config directory from the parent process (where apps.json lives)
const configDirIndex = process.argv.indexOf('--config-dir')
const CONFIG_DIR = configDirIndex !== -1 ? process.argv[configDirIndex + 1] : undefined

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

function readAppConfig(id: string, configDir: string): DockApp | null {
  getLogger().info('Reading app config', { configDir, appId: id })
  const appsFile = join(configDir, 'apps.json')
  if (!existsSync(appsFile)) {
    getLogger().error(`Apps.json not found at ${appsFile}`)
    return null
  }
  try {
    const raw = readFileSync(appsFile, 'utf-8')
    const apps: DockApp[] = JSON.parse(raw)
    const found = apps.find((a) => a.id === id) ?? null
    if (found) {
      getLogger().info('App config found', { appId: id, name: found.name, url: found.url })
    } else {
      getLogger().error(`App ${id} not found in apps.json (${apps.length} apps total)`)
    }
    return found
  } catch (err) {
    getLogger().error('Failed to read apps.json', err)
    return null
  }
}

// ---------------------------------------------------------------------------
// Icon resolution: configured icon → origin favicon → link rel icon → default app icon
// ---------------------------------------------------------------------------

/** Extract origin (protocol + host) from a URL */
function getOrigin(url: string): string | null {
  try {
    const u = new URL(url)
    return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}`
  } catch {
    return null
  }
}

/**
 * Fetch a URL and return its content as a data URL.
 * Follows up to maxRedirects redirects; times out after 5 seconds.
 */
function fetchDataUrl(url: string, maxRedirects = 3): Promise<string | null> {
  if (maxRedirects <= 0) return Promise.resolve(null)
  return new Promise((resolve) => {
    const mod = url.startsWith('https:') ? httpsGet : httpGet
    const req = mod(url, (res) => {
      // Follow redirects
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        req.destroy()
        const redirectUrl = new URL(res.headers.location, url).href
        resolve(fetchDataUrl(redirectUrl, maxRedirects - 1))
        return
      }
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          const buffer = Buffer.concat(chunks)
          const contentType = res.headers['content-type'] || 'image/x-icon'
          const base64 = buffer.toString('base64')
          resolve(`data:${contentType};base64,${base64}`)
        })
      } else {
        resolve(null)
      }
    })
    req.on('error', () => resolve(null))
    req.setTimeout(5000, () => {
      req.destroy()
      resolve(null)
    })
  })
}

/** Try to fetch /favicon.ico from the target URL's origin */
async function fetchFavicon(targetUrl: string): Promise<Electron.NativeImage | null> {
  const origin = getOrigin(targetUrl)
  if (!origin) return null
  const dataUrl = await fetchDataUrl(`${origin}/favicon.ico`)
  if (!dataUrl) return null
  try {
    const img = nativeImage.createFromDataURL(dataUrl)
    return img.isEmpty() ? null : img
  } catch {
    return null
  }
}

/** Load the bundled default app icon (resources/icon.png) */
function loadDefaultAppIcon(): Electron.NativeImage | null {
  const candidates = [
    join(__dirname, '..', '..', 'resources', 'icon.png'), // dev
    join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'icon.png'), // packaged
    join(process.resourcesPath, 'resources', 'icon.png') // alt packaged
  ]
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        const img = nativeImage.createFromPath(p)
        if (!img.isEmpty()) return img
      } catch {
        continue
      }
    }
  }
  return null
}

/**
 * Resolve the best available window / dock icon for the app:
 *   1. User-configured iconDataUrl
 *   2. /favicon.ico from the target origin
 *   3. Bundled default app icon
 */
async function getWindowIcon(appCfg: DockApp): Promise<Electron.NativeImage | undefined> {
  // 1. User-configured icon
  if (appCfg.iconDataUrl) {
    try {
      const img = nativeImage.createFromDataURL(appCfg.iconDataUrl)
      if (!img.isEmpty()) return img
    } catch {
      // fall through
    }
  }

  // 2. Favicon from origin
  const favicon = await fetchFavicon(appCfg.url)
  if (favicon) return favicon

  // 3. Default app icon
  return loadDefaultAppIcon() ?? undefined
}

/**
 * After the page loads, scan for <link rel="icon"> or
 * <link rel="apple-touch-icon"> elements and use the best one.
 * This catches pages that use a non-standard favicon path.
 */
async function tryDetectLinkIcon(win: BrowserWindow): Promise<void> {
  try {
    const iconUrl: string | null = await win.webContents.executeJavaScript(`
      (function() {
        var links = document.querySelectorAll(
          'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'
        );
        if (links.length === 0) return null;
        var best = null, bestSize = 0;
        for (var i = 0; i < links.length; i++) {
          var href = links[i].href;
          if (!href) continue;
          var sizes = links[i].getAttribute('sizes');
          var size = sizes ? parseInt(sizes.split('x')[0]) : 0;
          if (size > bestSize || !best) {
            best = href;
            bestSize = size;
          }
        }
        return best;
      })()
    `)
    if (!iconUrl) return

    const dataUrl = await fetchDataUrl(iconUrl)
    if (!dataUrl) return

    const img = nativeImage.createFromDataURL(dataUrl)
    if (img.isEmpty()) return

    win.setIcon(img)
    // Also update macOS dock icon if we got a better one
    if (process.platform === 'darwin' && app.dock) {
      app.dock.setIcon(img)
    }
  } catch {
    // best-effort
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

async function createAppWindow(appCfg: DockApp): Promise<void> {
  getLogger().info('Creating app window', {
    name: appCfg.name,
    url: appCfg.url,
    width: appCfg.windowConfig.width,
    height: appCfg.windowConfig.height
  })

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
    if (process.platform === 'darwin') {
      // macOS: hidden title bar with native traffic lights
      windowOpts.titleBarStyle = 'hidden'
      windowOpts.titleBarOverlay = { height: 38 }
    } else if (process.platform === 'linux') {
      // Linux: frameless + styled overlay for brutalist-themed window controls
      windowOpts.frame = false
      windowOpts.titleBarOverlay = { height: 38, color: '#000000', symbolColor: '#ffffff' }
    } else {
      // Windows: styled overlay on frameless window
      windowOpts.frame = false
      windowOpts.titleBarOverlay = { height: 38, color: '#000000', symbolColor: '#ffffff' }
    }
  } else if (titleBarStyle === 'none') {
    windowOpts.frame = false
  }

  // Resolve window + dock icon (configured → favicon → default app icon)
  const icon = await getWindowIcon(appCfg)
  if (icon) {
    windowOpts.icon = icon
  }

  const win = new BrowserWindow(windowOpts)

  // macOS: set dock icon if we have one
  if (process.platform === 'darwin' && icon && app.dock) {
    app.dock.setIcon(icon)
  }

  // Keep the window title set to the app name — prevent the loaded page's
  // <title> from overriding it
  win.on('page-title-updated', (event) => {
    event.preventDefault()
  })

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
    // Try to find a higher-quality icon from <link rel="icon"> elements
    tryDetectLinkIcon(win).catch(() => {})

    injectDragCSS()
    injectCustomCSS()
  })

  // Notify parent process that we're ready
  console.log(JSON.stringify({ type: 'ready', appId: APP_ID }))

  // Load the target URL
  getLogger().info('Loading URL', { url: appCfg.url })
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

app
  .whenReady()
  .then(async () => {
    // OS-specific optimisations for taskbar / dock separation
    if (process.platform === 'win32') {
      // Set a unique AppUserModelId so the taskbar entry is fully independent
      app.setAppUserModelId(`com.rivo.hub.app-runner.${APP_ID}`)
    }
    const configDir = CONFIG_DIR ?? USER_DATA_PATH ?? app.getPath('userData')
    getLogger().info('App ready, reading config', { configDir, appId: APP_ID })

    const appCfg = readAppConfig(APP_ID!, configDir)
    if (!appCfg) {
      getLogger().error(`App ${APP_ID} not found in apps.json`)
      app.quit()
      return
    }

    try {
      await createAppWindow(appCfg)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      getLogger().error('Failed to create app window', {
        appId: APP_ID,
        error: message,
        stack: err instanceof Error ? err.stack : undefined
      })
      app.quit()
    }
  })
  .catch((err) => {
    const message = err instanceof Error ? err.message : String(err)
    getLogger().error('Fatal app-runner error', {
      appId: APP_ID,
      error: message,
      stack: err instanceof Error ? err.stack : undefined
    })
    app.quit()
  })

// Prevent the default Electron app quit on all-windows-closed — we manage it
// ourselves via win.on('closed') above.
app.on('window-all-closed', () => {
  // no-op (the window 'closed' handler calls app.quit())
})
