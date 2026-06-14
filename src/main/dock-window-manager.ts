import { BrowserWindow } from 'electron'
import { join } from 'path'
import type { DockApp } from './apps-store'
import * as settings from './settings-store'
import { getRaw as getBridgeConfig } from './bridge-store'
import { ensureBridgeListener } from './bridge-injector'

// ---------------------------------------------------------------------------
// Drag-support CSS (injected into every dock app window's <body>)
// Allows dragging frameless windows by the page background, while keeping
// interactive elements clickable.
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

/**
 * Manages lifecycle of independent dock app windows.
 * Each app window is created as a separate BrowserWindow with the user's
 * configured preferences and inherits all bridge capabilities.
 */
export class DockWindowManager {
  /** Map of app id → BrowserWindow for all open dock windows */
  private windows = new Map<string, BrowserWindow>()

  /**
   * Launch (or focus) an independent window for the given dock app.
   */
  launch(app: DockApp): BrowserWindow {
    // If already open, focus it
    const existing = this.windows.get(app.id)
    if (existing && !existing.isDestroyed()) {
      if (existing.isMinimized()) existing.restore()
      existing.focus()
      return existing
    }

    const { width, height, titleBarStyle, frame } = app.windowConfig

    const windowOpts: Electron.BrowserWindowConstructorOptions = {
      width,
      height,
      autoHideMenuBar: true,
      title: app.name,
      webPreferences: {
        preload: join(__dirname, '../preload/browser-preload.js'),
        sandbox: true
      }
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
    // 'default' → leave default frame

    const win = new BrowserWindow(windowOpts)

    // Resolve effective User-Agent: per-app override → default → leave untouched
    const effectiveUA = app.userAgent || settings.get('defaultUserAgent')
    if (effectiveUA) {
      win.webContents.userAgent = effectiveUA
    }

    // Track the window
    this.windows.set(app.id, win)

    win.on('closed', () => {
      this.windows.delete(app.id)
    })

    // Inject drag-support CSS on every page load
    const injectDragCSS = (): void => {
      win.webContents.insertCSS(DRAG_CSS).catch(() => {
        // Silently ignore — CSS insertion is best-effort
      })
    }
    win.webContents.on('did-finish-load', injectDragCSS)

    // Load the target URL
    void win.loadURL(app.url)

    // Inject bridge after page loads (only if bridge is enabled)
    const bridgeConfig = getBridgeConfig()
    if (bridgeConfig.enabled && bridgeConfig.globalName) {
      // We use a small helper that's imported from bridge-injector
      ensureBridgeListener(win.webContents)
    }

    return win
  }

  /**
   * Close a specific dock app window.
   */
  close(id: string): void {
    const win = this.windows.get(id)
    if (win && !win.isDestroyed()) {
      win.close()
    }
    this.windows.delete(id)
  }

  /**
   * Close all open dock app windows.
   */
  closeAll(): void {
    for (const [, win] of this.windows) {
      if (!win.isDestroyed()) {
        win.close()
      }
    }
    this.windows.clear()
  }

  /**
   * Get the number of open dock app windows.
   */
  get openCount(): number {
    return this.windows.size
  }
}
