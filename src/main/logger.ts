/**
 * Main process structured logger.
 *
 * Uses LogLayer with electron-log transport to write structured logs
 * to both console and file (electron-log auto-rotates files under
 * app.getPath('userData')/logs/).
 */

import log from 'electron-log/main'
import { LogLayer } from 'loglayer'
import { ElectronLogTransport } from '@loglayer/transport-electron-log'

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _logLayer: LogLayer | null = null

function getLogLayer(): LogLayer {
  if (!_logLayer) {
    _logLayer = new LogLayer({
      transport: new ElectronLogTransport({
        logger: log
      })
    })
  }
  return _logLayer
}

// ---------------------------------------------------------------------------
// Public API — stable interface for the rest of the codebase
// ---------------------------------------------------------------------------

export interface Logger {
  trace(msg: string, ...args: unknown[]): void
  debug(msg: string, ...args: unknown[]): void
  info(msg: string, ...args: unknown[]): void
  warn(msg: string, ...args: unknown[]): void
  error(msg: string, ...args: unknown[]): void
  fatal(msg: string, ...args: unknown[]): void

  /** Create a child logger with persistent context fields */
  withContext(ctx: Record<string, unknown>): Logger

  /** Add single-use metadata to the next log call */
  withMetadata(meta: Record<string, unknown>): Logger

  /** Create a child logger (copies config + context) */
  child(): Logger
}

/**
 * Returns the process-wide logger instance.
 *
 * Usage:
 *   getLogger().info('Hello')
 *   getLogger().withContext({ module: 'fetcher' }).warn('Timeout')
 *   getLogger().withMetadata({ url }).error('Failed', err)
 */
export function getLogger(): Logger {
  return wrap(getLogLayer())
}

// ---------------------------------------------------------------------------
// Internal — wraps LogLayer behind our Logger interface
// ---------------------------------------------------------------------------

function wrap(layer: LogLayer): Logger {
  return {
    trace: (msg: string, ...args: unknown[]) => {
      if (args.length > 0) {
        layer.withMetadata({ args }).trace(msg)
      } else {
        layer.trace(msg)
      }
    },
    debug: (msg: string, ...args: unknown[]) => {
      if (args.length > 0) {
        layer.withMetadata({ args }).debug(msg)
      } else {
        layer.debug(msg)
      }
    },
    info: (msg: string, ...args: unknown[]) => {
      if (args.length > 0) {
        layer.withMetadata({ args }).info(msg)
      } else {
        layer.info(msg)
      }
    },
    warn: (msg: string, ...args: unknown[]) => {
      if (args.length > 0) {
        layer.withMetadata({ args }).warn(msg)
      } else {
        layer.warn(msg)
      }
    },
    error: (msg: string, ...args: unknown[]) => {
      if (args.length > 0) {
        layer.withMetadata({ args }).error(msg)
      } else {
        layer.error(msg)
      }
    },
    fatal: (msg: string, ...args: unknown[]) => {
      if (args.length > 0) {
        layer.withMetadata({ args }).fatal(msg)
      } else {
        layer.fatal(msg)
      }
    },

    withContext: (ctx: Record<string, unknown>) => wrap(layer.child().withContext(ctx)),

    withMetadata: (meta: Record<string, unknown>) => {
      const builder = layer.withMetadata(meta)
      // Return a partial Logger that delegates the next call
      return {
        trace: (msg: string, ...args: unknown[]) => {
          if (args.length > 0) builder.withMetadata({ args }).trace(msg)
          else builder.trace(msg)
        },
        debug: (msg: string, ...args: unknown[]) => {
          if (args.length > 0) builder.withMetadata({ args }).debug(msg)
          else builder.debug(msg)
        },
        info: (msg: string, ...args: unknown[]) => {
          if (args.length > 0) builder.withMetadata({ args }).info(msg)
          else builder.info(msg)
        },
        warn: (msg: string, ...args: unknown[]) => {
          if (args.length > 0) builder.withMetadata({ args }).warn(msg)
          else builder.warn(msg)
        },
        error: (msg: string, ...args: unknown[]) => {
          if (args.length > 0) builder.withMetadata({ args }).error(msg)
          else builder.error(msg)
        },
        fatal: (msg: string, ...args: unknown[]) => {
          if (args.length > 0) builder.withMetadata({ args }).fatal(msg)
          else builder.fatal(msg)
        },
        // Chain further context/metadata/child
        withContext: (ctx: Record<string, unknown>) => wrap(layer.child().withContext(ctx)),
        withMetadata: (meta: Record<string, unknown>) => {
          const next = layer.withMetadata(meta)
          return wrap(next as unknown as LogLayer)
        },
        child: () => wrap(layer.child())
      } as Logger
    },

    child: () => wrap(layer.child())
  }
}
