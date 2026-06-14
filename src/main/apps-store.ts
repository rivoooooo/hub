import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DockTitleBarStyle = 'default' | 'hidden' | 'none'

export interface DockWindowConfig {
  width: number
  height: number
  titleBarStyle: DockTitleBarStyle
  frame: boolean
}

export interface DockApp {
  id: string
  name: string
  url: string
  iconDataUrl: string
  windowConfig: DockWindowConfig
  userAgent?: string
  /** JSON with keys: common, isMacos, isWindows, isLinux — or undefined for none */
  customCss?: string
  createdAt: number
}

// ---------------------------------------------------------------------------
// Defaults & persistence
// ---------------------------------------------------------------------------

const APPS_FILE = join(app.getPath('userData'), 'apps.json')

const DEFAULT_WINDOW_CONFIG: DockWindowConfig = {
  width: 1024,
  height: 768,
  titleBarStyle: 'hidden',
  frame: true
}

let cache: DockApp[] | null = null

function ensureFile(): void {
  const dir = dirname(APPS_FILE)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  if (!existsSync(APPS_FILE)) {
    writeFileSync(APPS_FILE, JSON.stringify([], null, 2), 'utf-8')
  }
}

function read(): DockApp[] {
  if (cache) return cache
  ensureFile()
  try {
    const raw = readFileSync(APPS_FILE, 'utf-8')
    cache = JSON.parse(raw) as DockApp[]
    return cache!
  } catch {
    cache = []
    return cache!
  }
}

function write(data: DockApp[]): void {
  cache = data
  ensureFile()
  writeFileSync(APPS_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getAll(): DockApp[] {
  return JSON.parse(JSON.stringify(read())) as DockApp[]
}

export function get(id: string): DockApp | undefined {
  const apps = read()
  return apps.find((a) => a.id === id)
}

export function add(appData: Omit<DockApp, 'id' | 'createdAt'>): DockApp {
  const apps = read()
  const newApp: DockApp = {
    ...appData,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    windowConfig: {
      ...DEFAULT_WINDOW_CONFIG,
      ...appData.windowConfig
    }
  }
  apps.push(newApp)
  write(apps)
  return JSON.parse(JSON.stringify(newApp)) as DockApp
}

export function update(id: string, patch: Partial<DockApp>): DockApp | undefined {
  const apps = read()
  const index = apps.findIndex((a) => a.id === id)
  if (index === -1) return undefined
  apps[index] = { ...apps[index], ...patch, id } // prevent id overwrite
  write(apps)
  return JSON.parse(JSON.stringify(apps[index])) as DockApp
}

export function remove(id: string): boolean {
  const apps = read()
  const index = apps.findIndex((a) => a.id === id)
  if (index === -1) return false
  apps.splice(index, 1)
  write(apps)
  return true
}

export function exportConfig(): string {
  return JSON.stringify(read(), null, 2)
}

export function importConfig(json: string): DockApp[] {
  const parsed = JSON.parse(json) as DockApp[]
  if (!Array.isArray(parsed)) throw new Error('Invalid apps config format')
  write(parsed)
  return getAll()
}
