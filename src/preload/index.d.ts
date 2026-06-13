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

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      openRoute: (route: string) => void
    }
    browserApi: BrowserApi
  }
}
