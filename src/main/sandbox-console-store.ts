/**
 * In-memory store for sandbox console.log/warn/error output.
 *
 * Each entry captures the level, formatted arguments, a timestamp,
 * and the bridge function path that produced it.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SandboxConsoleEntry {
  id: number
  timestamp: number
  level: 'log' | 'warn' | 'error'
  message: string
  /** Bridge function path, e.g. "myFunc" or "obj.nested.func" */
  path: string
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const MAX_ENTRIES = 500
let nextId = 1
const entries: SandboxConsoleEntry[] = []

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Append a new console entry.
 */
export function push(level: SandboxConsoleEntry['level'], message: string, path: string): void {
  entries.push({
    id: nextId++,
    timestamp: Date.now(),
    level,
    message,
    path
  })
  // Trim from the front when over capacity
  while (entries.length > MAX_ENTRIES) {
    entries.shift()
  }
}

/**
 * Return a copy of all stored entries (newest first).
 */
export function getAll(): SandboxConsoleEntry[] {
  return entries.slice().reverse()
}

/**
 * Clear all stored entries.
 */
export function clear(): void {
  entries.length = 0
}
