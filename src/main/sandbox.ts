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
import type { ConsoleOutputEntry } from './bridge-call-store'

// ---------------------------------------------------------------------------
// Restricted global allowlist
// ---------------------------------------------------------------------------
// These are safe built-in constructors / functions that don't grant access
// to the host environment.  The list is kept minimal — add only when there
// is a proven need from custom bridge functions.
// ---------------------------------------------------------------------------

/** Format arguments similar to console.log's joining behaviour. */
function fmtConsoleArgs(...args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a
      if (a === null) return 'null'
      if (a === undefined) return 'undefined'
      try {
        return JSON.stringify(a, null, 2)
      } catch {
        return String(a)
      }
    })
    .join(' ')
}

/**
 * Build a console stub object that pushes entries into a mutable buffer
 * so that console output inside the sandbox is captured per-invocation.
 */
interface SandboxConsole {
  log: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

function createSandboxConsole(output: ConsoleOutputEntry[]): SandboxConsole {
  return {
    log: (...args: unknown[]) => {
      output.push({ level: 'log', message: fmtConsoleArgs(...args) })
    },
    warn: (...args: unknown[]) => {
      output.push({ level: 'warn', message: fmtConsoleArgs(...args) })
    },
    error: (...args: unknown[]) => {
      output.push({ level: 'error', message: fmtConsoleArgs(...args) })
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

function createSandboxContext(
  args: unknown[],
  _label: string,
  consoleOutput: ConsoleOutputEntry[]
): Record<string, unknown> {
  return {
    ...SHARED_GLOBALS,
    console: createSandboxConsole(consoleOutput),
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
 * @returns      - `{ result, consoleOutput }` — the return value plus any console output captured
 * @throws       - On compilation / execution / timeout errors
 */
export function runInSandbox(
  code: string,
  args: unknown[],
  label?: string
): { result: unknown; consoleOutput: ConsoleOutputEntry[] } {
  if (!code || code.trim().length === 0) {
    throw new Error('custom function has no code')
  }

  const wrappedCode = `(function(){ return (${code})(args) })()`
  const consoleOutput: ConsoleOutputEntry[] = []
  const context = createSandboxContext(args, label ?? 'bridge', consoleOutput)

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

  return { result, consoleOutput }
}

/**
 * Timeout duration used by the sandbox (exposed for testing / diagnostics).
 */
export const SANDBOX_TIMEOUT_MS = EXECUTION_TIMEOUT_MS
