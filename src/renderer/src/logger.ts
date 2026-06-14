/**
 * Renderer process structured logger.
 *
 * Sends log messages to the main process via the preload-exposed loggerApi
 * (which uses IPC under the hood).  Falls back to plain console when the
 * preload bridge isn't available (e.g. in test environments).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RendererLogger {
  debug(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

function getBridge(): RendererLogger | null {
  try {
    if (typeof window !== 'undefined' && window.loggerApi) {
      return window.loggerApi
    }
  } catch {
    // window may not be defined in SSR / test environments
  }
  return null
}

/**
 * Returns a logger for the renderer process.
 * In the Electron renderer, this sends logs to the main process via IPC.
 * Falls back to a no-op logger when the bridge is unavailable (prevents
 * crashes if the preload didn't load for some reason).
 */
export function getLogger(): RendererLogger {
  const bridge = getBridge()
  if (!bridge) {
    // No preload bridge — fall back to console so errors are still visible
    return {
      debug: (message: string, ...args: unknown[]) =>
        console.debug(`[renderer] ${message}`, ...args),
      info: (message: string, ...args: unknown[]) => console.info(`[renderer] ${message}`, ...args),
      warn: (message: string, ...args: unknown[]) => console.warn(`[renderer] ${message}`, ...args),
      error: (message: string, ...args: unknown[]) =>
        console.error(`[renderer] ${message}`, ...args)
    }
  }
  return bridge
}
