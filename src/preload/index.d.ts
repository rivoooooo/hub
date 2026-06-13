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
}

interface SettingsApi {
  get: () => Promise<SettingsData>
  set: (key: string, value: unknown) => Promise<void>
}

interface BrowserControls {
  minimize: () => Promise<void>
  toggleMaximize: () => Promise<void>
  close: () => Promise<void>
  openDevTools: () => Promise<void>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      openRoute: (route: string) => void
    }
    browserApi: BrowserApi
    settingsApi: SettingsApi
    browserControls: BrowserControls
  }
}
