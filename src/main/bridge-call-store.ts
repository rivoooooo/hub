/**
 * In-memory store for bridge call logs.
 *
 * Each entry captures a single bridge function invocation:
 * path, arguments, result/error, execution duration, and mode.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConsoleOutputEntry {
  level: 'log' | 'warn' | 'error'
  message: string
}

export interface BridgeCallEntry {
  id: number
  timestamp: number
  /** Bridge function path, e.g. "call" or "obj.nested.func" */
  path: string
  /** Arguments passed to the function */
  args: unknown[]
  /** Return value (on success) */
  result: unknown
  /** Error message (on failure) */
  error: string | null
  /** Execution duration in milliseconds */
  durationMs: number
  /** Function mode: custom / static / declarative */
  mode: 'custom' | 'static' | 'declarative'
  /** True when responseMode === 'sync' (ran in-page via new Function) */
  sync: boolean
  /** Call stack trace captured at the invocation point (page-side for sync, main-process for async) */
  stack?: string
  /** Console output captured during execution */
  consoleOutput?: ConsoleOutputEntry[]
  /** URL of the page that made the call */
  sourceUrl?: string
  /** Unique trace ID for correlating related calls */
  traceId?: string
  /** Serialized arguments size in bytes (approximate) */
  argsSize?: number
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const MAX_ENTRIES = 2000
let nextId = 1
const entries: BridgeCallEntry[] = []

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Append a new bridge call entry.
 */
export function push(entry: Omit<BridgeCallEntry, 'id'>): void {
  entries.push({
    id: nextId++,
    ...entry
  })
  // Trim from the front when over capacity
  while (entries.length > MAX_ENTRIES) {
    entries.shift()
  }
}

/**
 * Return a copy of all stored entries (newest first).
 */
export function getAll(): BridgeCallEntry[] {
  return entries.slice().reverse()
}

/**
 * Retrieve a single entry by id.
 */
export function getById(id: number): BridgeCallEntry | undefined {
  return entries.find((e) => e.id === id)
}

/**
 * Paginated query — returns a slice (newest first) plus total count.
 */
export function getPage(
  page: number,
  pageSize: number
): { entries: BridgeCallEntry[]; total: number } {
  const total = entries.length
  const start = Math.max(0, total - page * pageSize - pageSize)
  const end = Math.max(0, total - page * pageSize)
  const slice = entries.slice(start, end).reverse()
  return { entries: slice, total }
}

/**
 * Delete a single entry by id. Returns true if found and removed.
 */
export function remove(id: number): boolean {
  const idx = entries.findIndex((e) => e.id === id)
  if (idx === -1) return false
  entries.splice(idx, 1)
  return true
}

/**
 * Clear all stored entries.
 */
export function clear(): void {
  entries.length = 0
}
