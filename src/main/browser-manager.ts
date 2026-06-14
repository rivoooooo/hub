import { BrowserWindow, WebContentsView } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import * as settings from './settings-store'
import * as bridgeStore from './bridge-store'

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

const TOOLBAR_WIDTH = 64

export class BrowserManager {
  private window: BrowserWindow | null = null
  private contentView: WebContentsView | null = null
  private toolbarMode = false
  private state: BrowserState = { ...DEFAULT_STATE }
  /** Set of webContents ids that already have a bridge did-finish-load listener attached. */
  private bridgeListeners = new Set<number>()

  open(): BrowserState {
    if (this.window && !this.window.isDestroyed()) {
      this.window.focus()
      return this.state
    }

    this.state.open = true

    const mode = settings.get('browserTitleBarMode')
    this.toolbarMode = settings.get('toolbarVisible')

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
        this.ensureBridgeListener(this.contentView!.webContents)
      }
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      void this.window.loadURL(this.state.url)

      // Inject bridge after page loads (only if enabled)
      if (bridgeEnabled) {
        this.ensureBridgeListener(this.window!.webContents)
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
      this.injectBridge(wc)
      this.ensureBridgeListener(wc)
    }
  }

  /**
   * Register a did-finish-load listener for bridge injection if not already
   * registered, so that page navigations always re-inject the bridge.
   */
  private ensureBridgeListener(webContents: Electron.WebContents): void {
    // Avoid duplicate listeners by tracking webContents ids
    const id = webContents.id
    if (this.bridgeListeners.has(id)) return
    this.bridgeListeners.add(id)

    webContents.on('did-finish-load', () => {
      this.injectBridge(webContents)
    })

    // Clean up the set entry when the webContents is destroyed
    webContents.on('destroyed', () => {
      this.bridgeListeners.delete(id)
    })
  }

  /**
   * Inject the bridge object into a WebContents using executeJavaScript.
   *
   * Creates a Proxy-based recursive tree that mirrors the user-defined
   * BridgeNode tree config.  Leaf (function) nodes route calls to the
   * main process via `window.__bridgeCall`.  Object nodes return nested
   * Proxy sub‑trees for further access (e.g. `bridge.user.profile(id)`).
   */
  private injectBridge(webContents: Electron.WebContents): void {
    if (webContents.isDestroyed()) return

    const config = bridgeStore.getRaw()
    if (!config.enabled || !config.globalName) return

    const treeJson = JSON.stringify(config.tree)
    const globalName = config.globalName

    const js = `
(function(){
  if (window['${globalName}']) return; // already injected

  var tree = ${treeJson};

  function deepEqual(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== typeof b) return false;
    if (typeof a === 'object') {
      var aKeys = Object.keys(a);
      var bKeys = Object.keys(b);
      if (aKeys.length !== bKeys.length) return false;
      for (var i = 0; i < aKeys.length; i++) {
        if (!deepEqual(a[aKeys[i]], b[aKeys[i]])) return false;
      }
      return true;
    }
    return a === b;
  }

  function buildProxy(path, node) {
    if (node.type === 'function') {
      var fc = node.functionConfig;
      if (fc && fc.responseMode === 'sync') {
        // declarative sync — inline matching logic, no IPC
        if (fc.mode === 'declarative') {
          var _params = fc.params || [];
          var _entries = fc.matchEntries || [];
          var _fallback = fc.fallbackReturnValue;
          // Pre-parse return values
          for (var _i = 0; _i < _entries.length; _i++) {
            var _entry = _entries[_i];
            if (_entry.returnValue) {
              try { _entry._parsed = JSON.parse(_entry.returnValue); } catch(e) { _entry._parsed = _entry.returnValue; }
            } else {
              _entry._parsed = null;
            }
          }
          var _parsedFallback;
          if (_fallback !== undefined) {
            try { _parsedFallback = JSON.parse(_fallback); } catch(e) { _parsedFallback = _fallback; }
          }
          return function() {
            var args = Array.prototype.slice.call(arguments);
            for (var i = 0; i < _entries.length; i++) {
              var entry = _entries[i];
              var allMatch = true;
              for (var j = 0; j < entry.conditions.length; j++) {
                var cond = entry.conditions[j];
                var paramIdx = -1;
                for (var k = 0; k < _params.length; k++) {
                  if (_params[k].name === cond.paramName) { paramIdx = k; break; }
                }
                if (paramIdx === -1) { allMatch = false; break; }
                var arg = args[paramIdx];
                if (arg === undefined) {
                  if (_params[paramIdx].optional) continue;
                  allMatch = false; break;
                }
                if (cond.matchValue) {
                  try {
                    var matchObj = JSON.parse(cond.matchValue);
                    if (!deepEqual(arg, matchObj)) { allMatch = false; break; }
                  } catch(e) {
                    if (String(arg) !== cond.matchValue) { allMatch = false; break; }
                  }
                }
              }
              if (allMatch) return entry._parsed;
            }
            if (_parsedFallback !== undefined) return _parsedFallback;
            return { error: 'declarative: no matching entry and no fallback' };
          };
        }
        // static sync — inline the parsed value directly
        var _val;
        try { _val = JSON.parse(fc.returnValue); } catch(e) { _val = fc.returnValue; }
        return function() { return _val; };
      }
      // Default async mode — route via IPC
      return function() {
        var args = Array.prototype.slice.call(arguments);
        var ch = window.__bridgeCall;
        if (!ch || !ch.call) return Promise.resolve({ error: 'bridge:call not available' });
        return ch.call(path, args);
      };
    }
    // object type — return a Proxy that lazily resolves children
    var handler = {
      get: function(target, prop) {
        if (prop === 'then') return undefined;
        if (prop === '__isBridgeProxy') return true;
        /* istanbul ignore next */
        if (!node.children) return undefined;
        var child = node.children.find(function(c) { return c.name === prop; });
        if (!child) return undefined;
        return buildProxy(path.concat([prop]), child);
      },
      apply: function(target, thisArg, args) {
        // called as a function — route to main process
        var ch = window.__bridgeCall;
        if (!ch || !ch.call) return Promise.resolve({ error: 'bridge:call not available' });
        return ch.call(path, Array.prototype.slice.call(args));
      }
    };
    return new Proxy(function(){}, handler);
  }

  var root = {};
  tree.forEach(function(node) {
    root[node.name] = buildProxy([node.name], node);
  });

  Object.defineProperty(window, '${globalName}', {
    value: root,
    writable: false,
    configurable: false
  });
})();
`

    webContents.executeJavaScript(js).catch(() => {
      // Inject may fail if page isn't ready — that's fine
    })
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

  private notifyRenderers(): void {
    const state = { ...this.state }
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue
      win.webContents.send('browser:state-changed', state)
    }
  }
}
