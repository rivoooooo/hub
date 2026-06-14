import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

// ---------------------------------------------------------------------------
// New recursive tree type
// ---------------------------------------------------------------------------

/** Describes a function parameter (signature, no match condition) */
export interface ParamDef {
  /** Parameter name (e.g. "name", "value") */
  name: string
  /** Whether this parameter may be omitted by the caller */
  optional?: boolean
}

/** A single condition within a MatchEntry: one param must equal a value */
export interface MatchCondition {
  /** References a ParamDef name declared in the same function's params[] */
  paramName: string
  /** JSON string to compare against the actual argument value */
  matchValue?: string
}

/** A complete match scenario: when every condition is satisfied, returnValue is used */
export interface MatchEntry {
  conditions: MatchCondition[]
  /** JSON string returned when this entry matches */
  returnValue?: string
}

export interface BridgeFunctionConfig {
  acceptParams?: boolean
  /** Mode for function-type nodes */
  mode?: 'static' | 'declarative' | 'custom'
  /** static mode – literal JSON string to return */
  returnValue?: string
  /** declarative mode – optional value to match against params[1] (legacy) */
  matchValue?: string
  /** declarative mode – JSON string returned when matched */
  mockReturnValue?: string
  /** custom mode – anonymous function body string */
  codeString?: string
  /** Declarative: parameter signature (positional order matches args) */
  params?: ParamDef[]
  /** Declarative: named condition entries (overrides legacy per-param matchValue) */
  matchEntries?: MatchEntry[]
  /** Declarative: return value when no match entry applies (JSON string) */
  fallbackReturnValue?: string
  /**
   * Response delivery mode.
   * - 'async': (default) routes call via IPC, returns a Promise.
   * - 'sync':   inlines the return value at injection time, no IPC round‑trip.
   *             Only meaningful when mode === 'static'.
   */
  responseMode?: 'async' | 'sync'
}

export interface BridgeObjectConfig {
  /** Whether a plain value is mocked for this object node */
  returnValue?: string
}

export interface BridgeNode {
  name: string
  type: 'object' | 'function'
  /** Nested children (only meaningful when type === 'object') */
  children?: BridgeNode[]
  /** Function-specific config */
  functionConfig?: BridgeFunctionConfig
  /** Object-specific config */
  objectConfig?: BridgeObjectConfig
}

export interface BridgeConfig {
  enabled: boolean
  globalName: string
  tree: BridgeNode[]
}

// ---------------------------------------------------------------------------
// Defaults & persistence
// ---------------------------------------------------------------------------

const CONFIG_FILE = join(app.getPath('userData'), 'bridge-config.json')

const DEFAULTS: BridgeConfig = {
  enabled: false,
  globalName: 'bridge',
  tree: []
}

let cache: BridgeConfig | null = null

function ensureFile(): void {
  const dir = dirname(CONFIG_FILE)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  if (!existsSync(CONFIG_FILE)) {
    writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULTS, null, 2), 'utf-8')
  }
}

function write(data: BridgeConfig): void {
  cache = data
  ensureFile()
  writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

// ---------------------------------------------------------------------------
// Migration from old flat-array format → new tree format
// ---------------------------------------------------------------------------

function migrateFromOld(parsed: Record<string, unknown>): BridgeConfig | null {
  const methods = parsed.methods
  if (!Array.isArray(methods) || !methods.length) return null
  // Already has a tree field — skip
  if (Array.isArray(parsed.tree)) return null

  const tree: BridgeNode[] = methods.map((m: Record<string, unknown>) => {
    const name = String(m.name ?? '')
    const acceptParams = Boolean(m.acceptParams)
    const isCode = Boolean(m.code)
    const returnValue = String(m.returnValue ?? '')

    const node: BridgeNode = {
      name,
      type: 'function',
      functionConfig: {
        acceptParams,
        mode: isCode ? 'custom' : 'static'
      }
    }

    if (isCode) {
      node.functionConfig!.codeString = returnValue
    } else {
      node.functionConfig!.returnValue = returnValue
    }

    return node
  })

  return {
    enabled: Boolean(parsed.enabled),
    globalName: String(parsed.globalName ?? 'bridge'),
    tree
  }
}

/**
 * Migrate per-param matchValue (old ParamRule) → new ParamDef + MatchEntry.
 * Should be called after the tree is assembled from any source.
 */
function migrateNodeParams(node: BridgeNode): void {
  const fc = node.functionConfig
  if (!fc) return
  const params = fc.params as
    | { name: string; optional?: boolean; matchValue?: string }[]
    | undefined
  if (!params || params.length === 0) return

  // Check if any param has matchValue → old format
  const hasOldMatchValues = params.some((p) => p.matchValue !== undefined && p.matchValue !== '')
  if (!hasOldMatchValues) {
    // Already new format or no match values — just drop matchValue field if present
    fc.params = params.map((p) => ({ name: p.name, optional: p.optional }))
    return
  }

  // Migrate: strip matchValue from params, create one MatchEntry
  fc.params = params.map((p) => ({ name: p.name, optional: p.optional }))
  const conditions = params
    .filter((p) => p.matchValue !== undefined && p.matchValue !== '')
    .map((p) => ({ paramName: p.name, matchValue: p.matchValue }))
  if (conditions.length > 0) {
    fc.matchEntries = [
      {
        conditions,
        returnValue: fc.mockReturnValue
      }
    ]
  }
  // Recurse into children
  if (node.children) {
    node.children.forEach(migrateNodeParams)
  }
}

function migrateTreeParams(tree: BridgeNode[]): void {
  tree.forEach(migrateNodeParams)
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

function read(): BridgeConfig {
  if (cache) return cache
  ensureFile()
  try {
    const raw = readFileSync(CONFIG_FILE, 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, unknown>

    // Attempt migration from old format
    const migrated = migrateFromOld(parsed)
    if (migrated) {
      write(migrated)
      cache = { ...migrated }
      return cache
    }

    const tree = Array.isArray(parsed.tree) ? (parsed.tree as BridgeNode[]) : []

    // Migrate old per-param matchValue → new MatchEntry format
    migrateTreeParams(tree)

    cache = {
      enabled: Boolean(parsed.enabled),
      globalName: String(parsed.globalName ?? 'bridge'),
      tree
    }
    return cache!
  } catch {
    cache = { ...DEFAULTS }
    return cache!
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getConfig(): BridgeConfig {
  return JSON.parse(JSON.stringify(read())) as BridgeConfig
}

export function setConfig(config: BridgeConfig): void {
  write(JSON.parse(JSON.stringify(config)) as BridgeConfig)
}

export function exportConfig(): string {
  return JSON.stringify(read(), null, 2)
}

export function importConfig(json: string): BridgeConfig {
  const parsed = JSON.parse(json) as Record<string, unknown>

  // Also migrate old format on import
  const migrated = migrateFromOld(parsed)
  if (migrated) {
    write(migrated)
    return JSON.parse(JSON.stringify(migrated)) as BridgeConfig
  }

  const tree = Array.isArray(parsed.tree) ? (parsed.tree as BridgeNode[]) : []

  // Migrate old per-param matchValue → new MatchEntry format
  migrateTreeParams(tree)

  const config: BridgeConfig = {
    enabled: Boolean(parsed.enabled),
    globalName: String(parsed.globalName ?? 'bridge'),
    tree
  }
  write(config)
  return JSON.parse(JSON.stringify(config)) as BridgeConfig
}

/** For internal use by main process — returns the raw cached object for IPC. */
export function getRaw(): BridgeConfig {
  return read()
}
