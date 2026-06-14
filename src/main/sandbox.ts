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

// ---------------------------------------------------------------------------
// Restricted global allowlist
// ---------------------------------------------------------------------------
// These are safe built-in constructors / functions that don't grant access
// to the host environment.  The list is kept minimal — add only when there
// is a proven need from custom bridge functions.
// ---------------------------------------------------------------------------

const SAFE_GLOBALS: Record<string, unknown> = {
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
  BigUint64Array,

  // --- Control flow ---
  // (Promise already listed above)
  console: {
    // Limited console — only safe methods, no `console.profile` etc.
    log: (..._args: unknown[]) => {
      // In the future these could be forwarded to log-store
    },
    warn: (..._args: unknown[]) => {
      // Forward to log-store in future
    },
    error: (..._args: unknown[]) => {
      // Forward to log-store in future
    }
  }
}

// ---------------------------------------------------------------------------
// Context factory — create a fresh context per invocation
// ---------------------------------------------------------------------------

function createSandboxContext(args: unknown[]): Record<string, unknown> {
  const ctx = { ...SAFE_GLOBALS }
  // The function body receives `args` as its sole parameter
  ctx.args = args
  return ctx
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
 * @returns      - Return value of the function
 * @throws       - On compilation / execution / timeout errors
 */
export function runInSandbox(code: string, args: unknown[]): unknown {
  if (!code || code.trim().length === 0) {
    throw new Error('custom function has no code')
  }

  const wrappedCode = `(function(){ return (${code})(args) })()`
  const context = createSandboxContext(args)
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
