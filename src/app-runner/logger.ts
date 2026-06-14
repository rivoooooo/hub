/**
 * App-runner logger.
 *
 * The app-runner is a separate Electron child process. It uses electron-log
 * directly (without LogLayer) to keep the dependency footprint minimal while
 * still writing structured logs to the app-runner's own log directory.
 *
 * ⚠️ IMPORTANT: stdout is reserved for JSON IPC messages to the parent process
 * (e.g. { type: 'ready', appId }). NEVER write log output to stdout — always
 * use the logger methods below, which write to stderr and/or the electron-log
 * file transport.
 */

import log from 'electron-log/main'

// Configure electron-log for the app-runner process:
// - Write to stderr (not stdout, which is the IPC channel)
// - Write to a log file in app-runner's userData directory
log.transports.console.useStyles = true
log.transports.console.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface AppRunnerLogger {
  debug(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}

export function getLogger(): AppRunnerLogger {
  return loggerImpl
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const loggerImpl: AppRunnerLogger = {
  debug: (message: string, ...args: unknown[]) => {
    log.debug(message, ...args)
  },
  info: (message: string, ...args: unknown[]) => {
    log.info(message, ...args)
  },
  warn: (message: string, ...args: unknown[]) => {
    log.warn(message, ...args)
  },
  error: (message: string, ...args: unknown[]) => {
    log.error(message, ...args)
  }
}
