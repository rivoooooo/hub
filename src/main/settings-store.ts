import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

const SETTINGS_FILE = join(app.getPath('userData'), 'settings.json')

export type BrowserTitleBarMode = 'default' | 'hidden' | 'transparent'

export interface SettingsData {
  browserTitleBarMode: BrowserTitleBarMode
  toolbarVisible: boolean
  proxyEnabled: boolean
  proxyUrl: string
  seoHistoryDir: string
}

const DEFAULTS: SettingsData = {
  browserTitleBarMode: 'hidden',
  toolbarVisible: false,
  proxyEnabled: false,
  proxyUrl: '',
  seoHistoryDir: ''
}

let cache: SettingsData | null = null

function ensureFile(): void {
  const dir = dirname(SETTINGS_FILE)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  if (!existsSync(SETTINGS_FILE)) {
    writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULTS, null, 2), 'utf-8')
  }
}

function read(): SettingsData {
  if (cache) return cache
  ensureFile()
  try {
    const raw = readFileSync(SETTINGS_FILE, 'utf-8')
    cache = { ...DEFAULTS, ...JSON.parse(raw) }
    return cache!
  } catch {
    cache = { ...DEFAULTS }
    return cache!
  }
}

export function get<K extends keyof SettingsData>(key: K): SettingsData[K] {
  return read()[key]
}

export function set<K extends keyof SettingsData>(key: K, value: SettingsData[K]): void {
  const data = read()
  data[key] = value
  cache = data
  ensureFile()
  writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

export function getAll(): SettingsData {
  return { ...read() }
}
