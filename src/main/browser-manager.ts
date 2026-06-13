import { BrowserWindow } from 'electron'

export interface BrowserState {
  open: boolean
  url: string
  width: number
  height: number
  locked: boolean
}

const DEFAULT_STATE: BrowserState = {
  open: false,
  url: 'https://example.com',
  width: 1024,
  height: 768,
  locked: false
}

export class BrowserManager {
  private window: BrowserWindow | null = null
  private state: BrowserState = { ...DEFAULT_STATE }

  open(): BrowserState {
    if (this.window && !this.window.isDestroyed()) {
      this.window.focus()
      return this.state
    }

    this.state.open = true

    this.window = new BrowserWindow({
      width: this.state.width,
      height: this.state.height,
      autoHideMenuBar: true,
      webPreferences: {
        sandbox: true,
        preload: undefined as unknown as string
      }
    })

    if (this.state.locked) {
      this.applyLock()
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    void this.window.loadURL(this.state.url)

    this.window.on('resized', () => {
      if (!this.window || this.window.isDestroyed()) return
      const [w, h] = this.window.getSize()
      this.state.width = w
      this.state.height = h
      this.notifyRenderers()
    })

    this.window.on('closed', () => {
      this.state.open = false
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
    this.window = null
    this.notifyRenderers()
    return this.state
  }

  navigate(url: string): BrowserState {
    this.state.url = url
    if (this.window && !this.window.isDestroyed()) {
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
      this.window.setSize(width, height)
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
      }
    }
    this.notifyRenderers()
    return this.state
  }

  getState(): BrowserState {
    return { ...this.state }
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

  private notifyRenderers(): void {
    const state = { ...this.state }
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue
      win.webContents.send('browser:state-changed', state)
    }
  }
}
