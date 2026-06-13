import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

const CONFIG_FILE = join(app.getPath('userData'), 'bridge-config.json')

export interface BridgeMethod {
  name: string
  acceptParams: boolean
  code: boolean
  returnValue: string
}

export interface BridgeConfig {
  enabled: boolean
  globalName: string
  methods: BridgeMethod[]
}

const DEFAULTS: BridgeConfig = {
  enabled: false,
  globalName: 'bridge',
  methods: []
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

function read(): BridgeConfig {
  if (cache) return cache
  ensureFile()
  try {
    const raw = readFileSync(CONFIG_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    // Merge with defaults so new fields always exist
    cache = { ...DEFAULTS, ...parsed, methods: parsed.methods ?? [] }
    return cache!
  } catch {
    cache = { ...DEFAULTS }
    return cache!
  }
}

function write(data: BridgeConfig): void {
  cache = data
  ensureFile()
  writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

export function getConfig(): BridgeConfig {
  return { ...read() }
}

export function setConfig(config: BridgeConfig): void {
  write({ ...config })
}

export function exportConfig(): string {
  return JSON.stringify(read(), null, 2)
}

export function importConfig(json: string): BridgeConfig {
  const parsed = JSON.parse(json) as Partial<BridgeConfig>
  const merged: BridgeConfig = {
    ...DEFAULTS,
    ...parsed,
    methods: Array.isArray(parsed.methods) ? parsed.methods : []
  }
  write(merged)
  return { ...merged }
}

/** For internal use by main process — returns the raw cached object for IPC. */
export function getRaw(): BridgeConfig {
  return read()
}
