import { ElectronAPI } from '@electron-toolkit/preload'

interface BrowserState {
  open: boolean
  url: string
  width: number
  height: number
  locked: boolean
}

interface BrowserApi {
  open: () => Promise<BrowserState>
  close: () => Promise<BrowserState>
  navigate: (url: string) => Promise<BrowserState>
  resize: (width: number, height: number) => Promise<BrowserState>
  setLock: (locked: boolean) => Promise<BrowserState>
  getState: () => Promise<BrowserState>
  onStateChange: (callback: (state: BrowserState) => void) => () => void
}

interface SettingsData {
  browserTitleBarMode: 'default' | 'hidden' | 'transparent'
  toolbarVisible: boolean
  proxyEnabled: boolean
  proxyUrl: string
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
  og: Record<string, string>
  twitter: Record<string, string>
  headings: { level: number; text: string }[]
  linkStats: { total: number; internal: number; external: number; hashOnly: number }
  imagesMissingAlt: number
  hreflangs: { hreflang: string; href: string }[]
  issues: string[]
}

interface SeoApi {
  analyze: (url: string) => Promise<SeoResult>
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
    /** Bridge IPC channel — used by injected Proxy bridge on target pages */
    __bridgeCall: BridgeCallChannel
  }
}
