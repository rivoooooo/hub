/**
 * Sandbox execution for Bridge `custom` mode functions.
 *
 * Uses Node.js built-in `vm` module to run user-supplied code strings
 * in an isolated context with limited globals and a timeout guard.
 *
 * The sandbox deliberately omits:
 *  - `process`, `require`, `module`, `exports`, `import()`
 *  - `electron` / Node.js built-in modules
 *  - `setTimeout` / `setInterval` / `setImmediate`
 *  - `fetch` (unless injected explicitly)
 *  - `Buffer`, `TextEncoder`, `TextDecoder`
 *
 * Only plain JavaScript primitives and safe built-in objects are exposed.
 */

import vm from 'node:vm'
import { push as pushConsoleEntry } from './sandbox-console-store'

// ---------------------------------------------------------------------------
// Restricted global allowlist
// ---------------------------------------------------------------------------
// These are safe built-in constructors / functions that don't grant access
// to the host environment.  The list is kept minimal — add only when there
// is a proven need from custom bridge functions.
// ---------------------------------------------------------------------------

function fmtConsoleArgs(...args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a
      if (a === null) return 'null'
      if (a === undefined) return 'undefined'
      try {
        return JSON.stringify(a)
      } catch {
        return String(a)
      }
    })
    .join(' ')
}

/**
 * Build a console stub object that forwards entries to the shared store.
 * The `label` is baked in so each sandbox invocation gets its own closure.
 */
interface SandboxConsole {
  log: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

function createSandboxConsole(label: string): SandboxConsole {
  return {
    log: (...args: unknown[]) => {
      pushConsoleEntry('log', fmtConsoleArgs(...args), label)
    },
    warn: (...args: unknown[]) => {
      pushConsoleEntry('warn', fmtConsoleArgs(...args), label)
    },
    error: (...args: unknown[]) => {
      pushConsoleEntry('error', fmtConsoleArgs(...args), label)
    }
  }
}

/** Shared globals that do NOT depend on the current invocation label. */
const SHARED_GLOBALS: Record<string, unknown> = {
  // --- Primitives & constructors ---
  // NOTE: `Function` is deliberately omitted.  The `Function` constructor
  // is a classic vm sandbox escape vector (via prototype chain traversal).
  // If user code needs to create functions it should use arrow / function
  // declaration syntax instead.
  Array,
  BigInt,
  Boolean,
  Date,
  Error,
  EvalError,
  Infinity,
  Map,
  NaN,
  Number,
  Object,
  Promise,
  RangeError,
  ReferenceError,
  RegExp,
  Set,
  String,
  Symbol,
  SyntaxError,
  TypeError,
  URIError,
  WeakMap,
  WeakSet,

  // --- Utility functions ---
  decodeURI,
  decodeURIComponent,
  encodeURI,
  encodeURIComponent,
  isFinite,
  isNaN,
  JSON,
  Math,
  parseFloat,
  parseInt,

  // --- Typed arrays (data processing) ---
  ArrayBuffer,
  DataView,
  Float32Array,
  Float64Array,
  Int8Array,
  Int16Array,
  Int32Array,
  Uint8Array,
  Uint8ClampedArray,
  Uint16Array,
  Uint32Array,
  BigInt64Array,
  BigUint64Array
}

// ---------------------------------------------------------------------------
// Context factory — create a fresh context per invocation
// ---------------------------------------------------------------------------

function createSandboxContext(args: unknown[], label: string): Record<string, unknown> {
  return {
    ...SHARED_GLOBALS,
    console: createSandboxConsole(label),
    // The function body receives `args` as its sole parameter
    args
  }
}

// ---------------------------------------------------------------------------
// Execution timeout (milliseconds)
// ---------------------------------------------------------------------------
const EXECUTION_TIMEOUT_MS = 5_000

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Execute a user-supplied function body inside a sandboxed VM context.
 *
 * The `code` string should be an expression that evaluates to a function,
 * matching the Bridge UI placeholder: `(args) => { ... }`.
 *
 * @param code   - Anonymous function body string, e.g. `(args) => { const [k,v] = args; return k; }`
 * @param args   - Array of arguments passed from the caller (via bridge Proxy)
 * @param label  - Optional identifier shown in console output (typically the bridge path)
 * @returns      - Return value of the function
 * @throws       - On compilation / execution / timeout errors
 */
export function runInSandbox(code: string, args: unknown[], label?: string): unknown {
  if (!code || code.trim().length === 0) {
    throw new Error('custom function has no code')
  }

  const wrappedCode = `(function(){ return (${code})(args) })()`
  const context = createSandboxContext(args, label ?? 'bridge')

  vm.createContext(context, {
    // Prevent the sandbox from leaking back to the host context
    microtaskMode: 'afterEvaluate'
  })

  const script = new vm.Script(wrappedCode, {
    filename: 'bridge:sandbox',
    lineOffset: 0
  })

  const result = script.runInContext(context, {
    timeout: EXECUTION_TIMEOUT_MS,
    breakOnSigint: true // allow Ctrl+C to break infinite loops in dev
  })

  return result
}

/**
 * Timeout duration used by the sandbox (exposed for testing / diagnostics).
 */
export const SANDBOX_TIMEOUT_MS = EXECUTION_TIMEOUT_MS
