import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
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

interface BrowserState {
  open: boolean
  url: string
  width: number
  height: number
  locked: boolean
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('browserApi', browserApi)
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
}
