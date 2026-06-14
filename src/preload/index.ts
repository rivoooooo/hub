import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

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
  openRoute: (route: string): void => ipcRenderer.send('open-route', route)
}

const browserApi = {
  open: (): Promise<BrowserState> => ipcRenderer.invoke('browser:open'),
  close: (): Promise<BrowserState> => ipcRenderer.invoke('browser:close'),
  navigate: (url: string): Promise<BrowserState> => ipcRenderer.invoke('browser:navigate', url),
  resize: (width: number, height: number): Promise<BrowserState> =>
    ipcRenderer.invoke('browser:resize', width, height),
  setLock: (locked: boolean): Promise<BrowserState> => ipcRenderer.invoke('browser:lock', locked),
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
// SEO API (types live in index.d.ts)
// ---------------------------------------------------------------------------

const seoApi = {
  analyze: (url: string): Promise<SeoResult> => ipcRenderer.invoke('seo:analyze', url)
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
  og: Record<string, string>
  twitter: Record<string, string>
  headings: { level: number; text: string }[]
  issues: string[]
}

type BrowserTitleBarMode = 'default' | 'hidden' | 'transparent'

interface SettingsData {
  browserTitleBarMode: BrowserTitleBarMode
  toolbarVisible: boolean
  proxyEnabled: boolean
  proxyUrl: string
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

    // Bridge IPC channel — used by injected Proxy bridge on target pages
    contextBridge.exposeInMainWorld('__bridgeCall', {
      call: (path: string[], ...args: unknown[]): Promise<unknown> =>
        ipcRenderer.invoke('bridge:call', path, ...args)
    })
  } catch (error) {
    console.error(error)
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
  window.__bridgeCall = {
    call: (path: string[], ...args: unknown[]): Promise<unknown> =>
      ipcRenderer.invoke('bridge:call', path, ...args)
  }
}
