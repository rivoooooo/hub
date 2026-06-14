/**
 * Lightweight preload for target web pages (embedded browser tabs).
 *
 * Only exposes a single IPC channel (`__bridgeCall`) so that the injected
 * Proxy bridge can route calls to the main process while maintaining
 * context isolation / sandbox.
 */
import { contextBridge, ipcRenderer } from 'electron'

const bridgeCallChannel = {
  call: (path: string[], ...args: unknown[]): Promise<unknown> =>
    ipcRenderer.invoke('bridge:call', path, ...args)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('__bridgeCall', bridgeCallChannel)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error (global assignment)
  window.__bridgeCall = bridgeCallChannel
}
