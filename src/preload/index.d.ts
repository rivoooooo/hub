import { ElectronAPI } from '@electron-toolkit/preload'

interface BrowserState {
  open: boolean
  url: string
  width: number
  height: number
  locked: boolean
  userAgent: string
}

interface BrowserApi {
  open: () => Promise<BrowserState>
  close: () => Promise<BrowserState>
  navigate: (url: string) => Promise<BrowserState>
  resize: (width: number, height: number) => Promise<BrowserState>
  setLock: (locked: boolean) => Promise<BrowserState>
  setUserAgent: (userAgent: string) => Promise<BrowserState>
  getState: () => Promise<BrowserState>
  onStateChange: (callback: (state: BrowserState) => void) => () => void
}

interface SettingsData {
  browserTitleBarMode: 'default' | 'hidden' | 'transparent'
  toolbarVisible: boolean
  proxyEnabled: boolean
  proxyUrl: string
  seoHistoryDir: string
  browserUserAgent: string
  defaultUserAgent: string
}

interface SettingsApi {
  get: () => Promise<SettingsData>
  set: (key: string, value: unknown) => Promise<void>
}

// --- New tree-based bridge types ---

interface ParamDef {
  name: string
  optional?: boolean
}

interface MatchCondition {
  paramName: string
  matchValue?: string
}

interface MatchEntry {
  conditions: MatchCondition[]
  returnValue?: string
}

interface BridgeFunctionConfig {
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

interface BridgeObjectConfig {
  returnValue?: string
}

interface BridgeNode {
  name: string
  type: 'object' | 'function'
  children?: BridgeNode[]
  functionConfig?: BridgeFunctionConfig
  objectConfig?: BridgeObjectConfig
}

interface BridgeFullConfig {
  enabled: boolean
  globalName: string
  tree: BridgeNode[]
}

interface BridgeApi {
  getConfig: () => Promise<BridgeFullConfig>
  setConfig: (config: BridgeFullConfig) => Promise<void>
  exportConfig: () => Promise<string>
  importConfig: (json: string) => Promise<BridgeFullConfig>
}

interface BridgeCallChannel {
  call: (path: string[], ...args: unknown[]) => Promise<unknown>
}

interface BrowserControls {
  minimize: () => Promise<void>
  toggleMaximize: () => Promise<void>
  close: () => Promise<void>
  openDevTools: () => Promise<void>
}

// --- SEO types ---

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

interface HistoryEntry {
  id: string
  url: string
  timestamp: number
  title: string | null
  favicon: string | null
  result: SeoResult
}

interface SeoApi {
  analyze: (url: string) => Promise<SeoResult>
  getHistory: () => Promise<HistoryEntry[]>
  clearHistory: () => Promise<void>
}

// --- Dock types ---

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

interface DockApi {
  getAll: () => Promise<DockApp[]>
  install: (appData: Omit<DockApp, 'id' | 'createdAt'>) => Promise<DockApp>
  remove: (id: string) => Promise<boolean>
  update: (id: string, patch: Partial<DockApp>) => Promise<DockApp>
  launch: (id: string) => Promise<void>
  getRunning: () => Promise<string[]>
  closeApp: (id: string) => Promise<void>
  onRunningStateChange: (callback: (ids: string[]) => void) => () => void
}

// --- Logs types ---

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

interface LogsApi {
  readFile: (filepath: string, offset?: number, limit?: number) => Promise<FileReadResult>
  listDirectory: (dirpath: string) => Promise<DirEntry[]>
  getDataDir: () => Promise<string>
  getLogsDir: () => Promise<string>
  pathExists: (filepath: string) => Promise<boolean>
  isDirectory: (filepath: string) => Promise<boolean>
  getRecents: () => Promise<LogRecentEntry[]>
  addRecent: (filepath: string) => Promise<LogRecentEntry[]>
  removeRecent: (filepath: string) => Promise<LogRecentEntry[]>
  clearRecents: () => Promise<void>
  getFavorites: () => Promise<LogFavoriteEntry[]>
  addFavorite: (filepath: string, label?: string) => Promise<LogFavoriteEntry[]>
  removeFavorite: (filepath: string) => Promise<LogFavoriteEntry[]>
  isFavorite: (filepath: string) => Promise<boolean>
  watchStart: (filepath: string) => Promise<void>
  watchStop: (filepath: string) => Promise<void>
  inferType: (filepath: string) => Promise<'txt' | 'json'>
  openPath: (filepath: string) => Promise<void>
  onFileChanged: (callback: (filepath: string, content: string) => void) => () => void
}

interface LoggerApi {
  log: (level: string, message: string, ...args: unknown[]) => void
  debug: (message: string, ...args: unknown[]) => void
  info: (message: string, ...args: unknown[]) => void
  warn: (message: string, ...args: unknown[]) => void
  error: (message: string, ...args: unknown[]) => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      openRoute: (route: string) => void
    }
    browserApi: BrowserApi
    bridgeApi: BridgeApi
    settingsApi: SettingsApi
    browserControls: BrowserControls
    seoApi: SeoApi
    dockApi: DockApi
    logsApi: LogsApi
    /** Bridge IPC channel — used by injected Proxy bridge on target pages */
    __bridgeCall: BridgeCallChannel
    /** Logger API — sends structured logs to the main process */
    loggerApi: LoggerApi
  }
}
