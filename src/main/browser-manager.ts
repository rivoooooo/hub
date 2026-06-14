import { BrowserWindow, WebContentsView } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import * as settings from './settings-store'
import * as bridgeStore from './bridge-store'
import { ensureBridgeListener, injectBridge } from './bridge-injector'

export interface BrowserState {
  open: boolean
  url: string
  width: number
  height: number
  locked: boolean
  userAgent: string
}

const DEFAULT_STATE: BrowserState = {
  open: false,
  url: 'https://example.com',
  width: 1024,
  height: 768,
  locked: false,
  userAgent: ''
}

const TOOLBAR_WIDTH = 64

export class BrowserManager {
  private window: BrowserWindow | null = null
  private contentView: WebContentsView | null = null
  private toolbarMode = false
  private state: BrowserState = { ...DEFAULT_STATE }

  open(): BrowserState {
    if (this.window && !this.window.isDestroyed()) {
      this.window.focus()
      return this.state
    }

    this.state.open = true

    const mode = settings.get('browserTitleBarMode')
    this.toolbarMode = settings.get('toolbarVisible')
    this.state.userAgent = settings.get('browserUserAgent')

    const windowOpts: Electron.BrowserWindowConstructorOptions = {
      width: this.state.width,
      height: this.state.height,
      autoHideMenuBar: true
    }

    // Toolbar mode: always frameless, toolbar page + WebContentsView
    if (this.toolbarMode) {
      windowOpts.frame = false
      windowOpts.webPreferences = {
        sandbox: false,
        preload: join(__dirname, '../preload/index.js')
      }
    } else if (mode === 'transparent') {
      windowOpts.frame = false
      windowOpts.webPreferences = {
        sandbox: true,
        preload: join(__dirname, '../preload/browser-preload.js')
      }
    } else {
      windowOpts.titleBarStyle = mode === 'hidden' ? 'hidden' : 'default'
      windowOpts.webPreferences = {
        sandbox: true,
        preload: join(__dirname, '../preload/browser-preload.js')
      }
    }

    this.window = new BrowserWindow(windowOpts)

    // Apply custom User-Agent if configured
    if (this.state.userAgent) {
      this.applyUserAgent()
    }

    const bridgeConfig = bridgeStore.getRaw()
    const bridgeEnabled = bridgeConfig.enabled

    if (this.toolbarMode) {
      // Load toolbar page (left 64px)
      if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        void this.window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/toolbar.html`)
      } else {
        void this.window.loadFile(join(__dirname, '../renderer/toolbar.html'))
      }

      // Create WebContentsView for the target URL (right side)
      this.contentView = new WebContentsView({
        webPreferences: {
          sandbox: true,
          preload: join(__dirname, '../preload/browser-preload.js')
        }
      })

      this.window.contentView.addChildView(this.contentView)
      this.layoutContentView()

      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      void this.contentView.webContents.loadURL(this.state.url)

      // Inject bridge after page loads (only if enabled)
      if (bridgeEnabled) {
        ensureBridgeListener(this.contentView!.webContents)
      }
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      void this.window.loadURL(this.state.url)

      // Inject bridge after page loads (only if enabled)
      if (bridgeEnabled) {
        ensureBridgeListener(this.window!.webContents)
      }
    }

    if (this.state.locked) {
      this.applyLock()
    }

    this.window.on('resized', () => {
      if (!this.window || this.window.isDestroyed()) return
      const [w, h] = this.window.getSize()
      this.state.width = w
      this.state.height = h
      if (this.toolbarMode) this.layoutContentView()
      this.notifyRenderers()
    })

    this.window.on('closed', () => {
      this.state.open = false
      this.contentView = null
      this.window = null
      this.notifyRenderers()
    })

    this.notifyRenderers()
    return this.state
  }

  close(): BrowserState {
    if (this.window && !this.window.isDestroyed()) {
      this.window.close()
    }
    this.state.open = false
    this.contentView = null
    this.window = null
    this.notifyRenderers()
    return this.state
  }

  navigate(url: string): BrowserState {
    this.state.url = url
    // Apply custom UA before navigating
    if (this.state.userAgent) {
      this.applyUserAgent()
    }
    if (this.toolbarMode && this.contentView) {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      void this.contentView.webContents.loadURL(url)
    } else if (this.window && !this.window.isDestroyed()) {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      void this.window.loadURL(url)
    }
    this.notifyRenderers()
    return this.state
  }

  resize(width: number, height: number): BrowserState {
    this.state.width = width
    this.state.height = height
    if (this.window && !this.window.isDestroyed()) {
      this.removeLock()
      this.window.setSize(width, height)
      if (this.state.locked) {
        this.applyLock()
      }
    }
    this.notifyRenderers()
    return this.state
  }

  setLock(locked: boolean): BrowserState {
    this.state.locked = locked
    if (this.window && !this.window.isDestroyed()) {
      if (locked) {
        this.applyLock()
      } else {
        this.removeLock()
        this.window.setResizable(true)
      }
    }
    this.notifyRenderers()
    return this.state
  }

  getState(): BrowserState {
    return { ...this.state }
  }

  minimize(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.minimize()
    }
  }

  toggleMaximize(): void {
    if (!this.window || this.window.isDestroyed()) return
    if (this.window.isMaximized()) {
      this.window.unmaximize()
    } else {
      this.window.maximize()
    }
  }

  openDevTools(): void {
    if (this.contentView) {
      this.contentView.webContents.openDevTools({ mode: 'detach' })
    } else if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.openDevTools({ mode: 'detach' })
    }
  }

  setUserAgent(ua: string): BrowserState {
    this.state.userAgent = ua
    settings.set('browserUserAgent', ua)
    if (this.state.userAgent) {
      this.applyUserAgent()
    }
    this.notifyRenderers()
    return { ...this.state }
  }

  /**
   * Re-inject the bridge object into the target page with the latest config.
   * Also ensures the did-finish-load listener is registered so future
   * navigations also get the bridge injected.
   */
  refreshBridge(): void {
    const config = bridgeStore.getRaw()
    if (!config.enabled) return

    const wc = this.toolbarMode ? this.contentView?.webContents : this.window?.webContents
    if (wc && !wc.isDestroyed()) {
      injectBridge(wc)
      ensureBridgeListener(wc)
    }
  }

  private layoutContentView(): void {
    if (!this.window || this.window.isDestroyed() || !this.contentView) return
    const bounds = this.window.getBounds()
    this.contentView.setBounds({
      x: TOOLBAR_WIDTH,
      y: 0,
      width: bounds.width - TOOLBAR_WIDTH,
      height: bounds.height
    })
  }

  private applyLock(): void {
    if (!this.window || this.window.isDestroyed()) return
    const w = this.state.width
    const h = this.state.height
    this.window.setMinimumSize(w, h)
    this.window.setMaximumSize(w, h)
  }

  private removeLock(): void {
    if (!this.window || this.window.isDestroyed()) return
    this.window.setMinimumSize(0, 0)
    this.window.setMaximumSize(0, 0)
  }

  private applyUserAgent(): void {
    const ua = this.state.userAgent
    if (!ua) return
    if (this.toolbarMode && this.contentView && !this.contentView.webContents.isDestroyed()) {
      this.contentView.webContents.userAgent = ua
    } else if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.userAgent = ua
    }
  }

  private notifyRenderers(): void {
    const state = { ...this.state }
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue
      win.webContents.send('browser:state-changed', state)
    }
  }
}
