import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// ---------------------------------------------------------------------------
// Logger utility — sends structured logs to the main process via IPC
// ---------------------------------------------------------------------------

function logToMain(level: string, message: string, ...args: unknown[]): void {
  try {
    ipcRenderer.send('logger:log', level, message, ...args)
  } catch {
    // Fallback if IPC isn't available yet
    console.error(`[renderer] ${level}: ${message}`, ...args)
  }
}

// ---------------------------------------------------------------------------
// Shared bridge types — kept in sync with main/bridge-store.ts
// ---------------------------------------------------------------------------

export interface ParamDef {
  name: string
  optional?: boolean
}

export interface MatchCondition {
  paramName: string
  matchValue?: string
}

export interface MatchEntry {
  conditions: MatchCondition[]
  returnValue?: string
}

export interface BridgeFunctionConfig {
  acceptParams?: boolean
  mode?: 'static' | 'declarative' | 'custom'
  returnValue?: string
  matchValue?: string
  mockReturnValue?: string
  codeString?: string
  params?: ParamDef[]
  matchEntries?: MatchEntry[]
  fallbackReturnValue?: string
  responseMode?: 'async' | 'sync'
}

export interface BridgeObjectConfig {
  returnValue?: string
}

export interface BridgeNode {
  name: string
  type: 'object' | 'function'
  children?: BridgeNode[]
  functionConfig?: BridgeFunctionConfig
  objectConfig?: BridgeObjectConfig
}

export interface BridgeFullConfig {
  enabled: boolean
  globalName: string
  tree: BridgeNode[]
}

// ---------------------------------------------------------------------------
// Custom APIs for the renderer (control panel)
// ---------------------------------------------------------------------------

const api = {
  openRoute: (route: string): void => ipcRenderer.send('open-route', route),
  getConfigDir: (): Promise<string> => ipcRenderer.invoke('config-dir:get')
}

const browserApi = {
  open: (): Promise<BrowserState> => ipcRenderer.invoke('browser:open'),
  close: (): Promise<BrowserState> => ipcRenderer.invoke('browser:close'),
  navigate: (url: string): Promise<BrowserState> => ipcRenderer.invoke('browser:navigate', url),
  resize: (width: number, height: number): Promise<BrowserState> =>
    ipcRenderer.invoke('browser:resize', width, height),
  setLock: (locked: boolean): Promise<BrowserState> => ipcRenderer.invoke('browser:lock', locked),
  setUserAgent: (userAgent: string): Promise<BrowserState> =>
    ipcRenderer.invoke('browser:set-user-agent', userAgent),
  getState: (): Promise<BrowserState> => ipcRenderer.invoke('browser:get-state'),
  onStateChange: (callback: (state: BrowserState) => void): (() => void) => {
    const handler = (_event: unknown, state: BrowserState): void => callback(state)
    ipcRenderer.on('browser:state-changed', handler)
    return () => ipcRenderer.removeListener('browser:state-changed', handler)
  }
}

const settingsApi = {
  get: (): Promise<SettingsData> => ipcRenderer.invoke('settings:get'),
  set: (key: string, value: unknown): Promise<void> =>
    ipcRenderer.invoke('settings:set', key, value)
}

interface BridgeApi {
  getConfig: () => Promise<BridgeFullConfig>
  setConfig: (config: BridgeFullConfig) => Promise<void>
  exportConfig: () => Promise<string>
  importConfig: (json: string) => Promise<BridgeFullConfig>
}

const bridgeApi: BridgeApi = {
  getConfig: (): Promise<BridgeFullConfig> => ipcRenderer.invoke('bridge:get-config'),
  setConfig: (config: BridgeFullConfig): Promise<void> =>
    ipcRenderer.invoke('bridge:set-config', config),
  exportConfig: (): Promise<string> => ipcRenderer.invoke('bridge:export-config'),
  importConfig: (json: string): Promise<BridgeFullConfig> =>
    ipcRenderer.invoke('bridge:import-config', json)
}

const browserControls = {
  minimize: (): Promise<void> => ipcRenderer.invoke('browser:minimize'),
  toggleMaximize: (): Promise<void> => ipcRenderer.invoke('browser:maximize-toggle'),
  close: (): Promise<void> => ipcRenderer.invoke('browser:close-window'),
  openDevTools: (): Promise<void> => ipcRenderer.invoke('browser:open-devtools')
}

// ---------------------------------------------------------------------------
// Logs API
// ---------------------------------------------------------------------------

interface FileReadResult {
  content: string
  totalLines: number
  size: number
}

interface DirEntry {
  name: string
  path: string
  isDirectory: boolean
  size: number
  mtimeMs: number
}

interface LogRecentEntry {
  filepath: string
  filename: string
  lastOpened: number
}

interface LogFavoriteEntry {
  filepath: string
  filename: string
  label?: string
  addedAt: number
}

const logsApi = {
  readFile: (filepath: string, offset?: number, limit?: number): Promise<FileReadResult> =>
    ipcRenderer.invoke('logs:read-file', filepath, offset, limit),
  listDirectory: (dirpath: string): Promise<DirEntry[]> =>
    ipcRenderer.invoke('logs:list-directory', dirpath),
  getDataDir: (): Promise<string> => ipcRenderer.invoke('logs:get-data-dir'),
  getLogsDir: (): Promise<string> => ipcRenderer.invoke('logs:get-logs-dir'),
  pathExists: (filepath: string): Promise<boolean> =>
    ipcRenderer.invoke('logs:path-exists', filepath),
  isDirectory: (filepath: string): Promise<boolean> =>
    ipcRenderer.invoke('logs:is-directory', filepath),
  getRecents: (): Promise<LogRecentEntry[]> => ipcRenderer.invoke('logs:get-recents'),
  addRecent: (filepath: string): Promise<LogRecentEntry[]> =>
    ipcRenderer.invoke('logs:add-recent', filepath),
  removeRecent: (filepath: string): Promise<LogRecentEntry[]> =>
    ipcRenderer.invoke('logs:remove-recent', filepath),
  clearRecents: (): Promise<void> => ipcRenderer.invoke('logs:clear-recents'),
  getFavorites: (): Promise<LogFavoriteEntry[]> => ipcRenderer.invoke('logs:get-favorites'),
  addFavorite: (filepath: string, label?: string): Promise<LogFavoriteEntry[]> =>
    ipcRenderer.invoke('logs:add-favorite', filepath, label),
  removeFavorite: (filepath: string): Promise<LogFavoriteEntry[]> =>
    ipcRenderer.invoke('logs:remove-favorite', filepath),
  isFavorite: (filepath: string): Promise<boolean> =>
    ipcRenderer.invoke('logs:is-favorite', filepath),
  watchStart: (filepath: string): Promise<void> => ipcRenderer.invoke('logs:watch-start', filepath),
  watchStop: (filepath: string): Promise<void> => ipcRenderer.invoke('logs:watch-stop', filepath),
  inferType: (filepath: string): Promise<'txt' | 'json'> =>
    ipcRenderer.invoke('logs:infer-type', filepath),
  openPath: (filepath: string): Promise<void> => ipcRenderer.invoke('logs:open-path', filepath),
  onFileChanged: (callback: (filepath: string, content: string) => void): (() => void) => {
    const handler = (_event: unknown, fp: string, content: string): void => callback(fp, content)
    ipcRenderer.on('logs:file-changed', handler)
    return () => ipcRenderer.removeListener('logs:file-changed', handler)
  }
}

// ---------------------------------------------------------------------------
// SEO API (types live in index.d.ts)
// ---------------------------------------------------------------------------

const seoApi = {
  analyze: (url: string): Promise<SeoResult> => ipcRenderer.invoke('seo:analyze', url),
  getHistory: (): Promise<HistoryEntry[]> => ipcRenderer.invoke('seo:get-history'),
  clearHistory: (): Promise<void> => ipcRenderer.invoke('seo:clear-history'),
  getDataDir: (): Promise<string> => ipcRenderer.invoke('seo:get-data-dir')
}

// ---------------------------------------------------------------------------
// Dock API
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
  customCss?: string
  createdAt: number
}

const dockApi = {
  getAll: (): Promise<DockApp[]> => ipcRenderer.invoke('dock:get-apps'),
  install: (appData: Omit<DockApp, 'id' | 'createdAt'>): Promise<DockApp> =>
    ipcRenderer.invoke('dock:install-app', appData),
  remove: (id: string): Promise<boolean> => ipcRenderer.invoke('dock:uninstall-app', id),
  update: (id: string, patch: Partial<DockApp>): Promise<DockApp> =>
    ipcRenderer.invoke('dock:update-app', id, patch),
  launch: (id: string): Promise<void> => ipcRenderer.invoke('dock:launch-app', id),
  getRunning: (): Promise<string[]> => ipcRenderer.invoke('dock:get-running-apps'),
  closeApp: (id: string): Promise<void> => ipcRenderer.invoke('dock:close-app', id),
  onRunningStateChange: (callback: (ids: string[]) => void): (() => void) => {
    const handler = (_event: unknown, ids: string[]): void => callback(ids)
    ipcRenderer.on('dock:running-state-changed', handler)
    return () => ipcRenderer.removeListener('dock:running-state-changed', handler)
  }
}

// Inline copy of HistoryEntry
interface HistoryEntry {
  id: string
  url: string
  timestamp: number
  title: string | null
  favicon: string | null
  result: SeoResult
}

interface BrowserState {
  open: boolean
  url: string
  width: number
  height: number
  locked: boolean
}

// Inline copy of SeoResult (type also defined in index.d.ts for the renderer)
interface SeoResult {
  url: string
  fetchTimeMs: number
  contentLength: number
  title: string | null
  metaDescription: string | null
  metaKeywords: string | null
  metaRobots: string | null
  canonical: string | null
  htmlLang: string | null
  favicon: string | null
  iconHref: string | null
  og: Record<string, string>
  twitter: Record<string, string>
  fb: Record<string, string>
  headings: { level: number; text: string }[]
  issues: string[]
}

type BrowserTitleBarMode = 'default' | 'hidden' | 'transparent'

interface SettingsData {
  browserTitleBarMode: BrowserTitleBarMode
  toolbarVisible: boolean
  proxyEnabled: boolean
  proxyUrl: string
  defaultUserAgent: string
}

// ---------------------------------------------------------------------------
// Logger API — structured logging from the renderer
// ---------------------------------------------------------------------------

const loggerApi = {
  log: (level: string, message: string, ...args: unknown[]): void =>
    logToMain(level, message, ...args),
  debug: (message: string, ...args: unknown[]): void => logToMain('debug', message, ...args),
  info: (message: string, ...args: unknown[]): void => logToMain('info', message, ...args),
  warn: (message: string, ...args: unknown[]): void => logToMain('warn', message, ...args),
  error: (message: string, ...args: unknown[]): void => logToMain('error', message, ...args)
}

// ---------------------------------------------------------------------------
// Context bridge exposure
// ---------------------------------------------------------------------------

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('browserApi', browserApi)
    contextBridge.exposeInMainWorld('bridgeApi', bridgeApi)
    contextBridge.exposeInMainWorld('settingsApi', settingsApi)
    contextBridge.exposeInMainWorld('browserControls', browserControls)
    contextBridge.exposeInMainWorld('seoApi', seoApi)
    contextBridge.exposeInMainWorld('dockApi', dockApi)
    contextBridge.exposeInMainWorld('logsApi', logsApi)

    // Bridge IPC channel — used by injected Proxy bridge on target pages
    contextBridge.exposeInMainWorld('__bridgeCall', {
      call: (path: string[], ...args: unknown[]): Promise<unknown> =>
        ipcRenderer.invoke('bridge:call', path, ...args)
    })

    contextBridge.exposeInMainWorld('loggerApi', loggerApi)
  } catch (error) {
    logToMain('error', 'contextBridge.exposeInMainWorld failed', error)
  }
} else {
  // @ts-expect-error (define in dts)
  window.electron = electronAPI
  // @ts-expect-error (define in dts)
  window.api = api
  // @ts-expect-error (define in dts)
  window.browserApi = browserApi
  // @ts-expect-error (define in dts)
  window.bridgeApi = bridgeApi
  // @ts-expect-error (define in dts)
  window.settingsApi = settingsApi
  // @ts-expect-error (define in dts)
  window.browserControls = browserControls
  // @ts-expect-error (define in dts)
  window.seoApi = seoApi
  // @ts-expect-error (define in dts)
  window.dockApi = dockApi
  // @ts-expect-error (define in dts)
  window.logsApi = logsApi
  // @ts-expect-error (define in dts)
  window.__bridgeCall = {
    call: (path: string[], ...args: unknown[]): Promise<unknown> =>
      ipcRenderer.invoke('bridge:call', path, ...args)
  }
  // @ts-expect-error (define in dts)
  window.loggerApi = loggerApi
}
