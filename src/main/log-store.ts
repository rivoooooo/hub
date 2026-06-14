import { app } from 'electron'
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  watch,
  FSWatcher
} from 'fs'
import { join, dirname, basename } from 'path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LogRecentEntry {
  filepath: string
  filename: string
  lastOpened: number
}

export interface LogFavoriteEntry {
  filepath: string
  filename: string
  label?: string
  addedAt: number
}

interface LogsMeta {
  recents: LogRecentEntry[]
  favorites: LogFavoriteEntry[]
}

// ---------------------------------------------------------------------------
// Persistence — recents & favorites
// ---------------------------------------------------------------------------

const META_FILE = join(app.getPath('userData'), 'logs-meta.json')

const DEFAULT_META: LogsMeta = {
  recents: [],
  favorites: []
}

let metaCache: LogsMeta | null = null

function ensureFile(): void {
  const dir = dirname(META_FILE)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  if (!existsSync(META_FILE)) {
    writeFileSync(META_FILE, JSON.stringify(DEFAULT_META, null, 2), 'utf-8')
  }
}

function readMeta(): LogsMeta {
  if (metaCache) return metaCache
  ensureFile()
  try {
    const raw = readFileSync(META_FILE, 'utf-8')
    metaCache = { ...DEFAULT_META, ...JSON.parse(raw) }
    return metaCache!
  } catch {
    metaCache = { ...DEFAULT_META }
    return metaCache!
  }
}

function writeMeta(data: LogsMeta): void {
  metaCache = data
  ensureFile()
  writeFileSync(META_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

// ---------------------------------------------------------------------------
// Recents API
// ---------------------------------------------------------------------------

const MAX_RECENTS = 50

export function getRecents(): LogRecentEntry[] {
  return readMeta().recents
}

export function addRecent(filepath: string): LogRecentEntry[] {
  const meta = readMeta()
  const filename = basename(filepath)
  // Remove duplicate if exists
  const filtered = meta.recents.filter((r) => r.filepath !== filepath)
  filtered.unshift({ filepath, filename, lastOpened: Date.now() })
  meta.recents = filtered.slice(0, MAX_RECENTS)
  writeMeta(meta)
  return meta.recents
}

export function clearRecents(): void {
  const meta = readMeta()
  meta.recents = []
  writeMeta(meta)
}

export function removeRecent(filepath: string): LogRecentEntry[] {
  const meta = readMeta()
  meta.recents = meta.recents.filter((r) => r.filepath !== filepath)
  writeMeta(meta)
  return meta.recents
}

// ---------------------------------------------------------------------------
// Favorites API
// ---------------------------------------------------------------------------

export function getFavorites(): LogFavoriteEntry[] {
  return readMeta().favorites
}

export function addFavorite(filepath: string, label?: string): LogFavoriteEntry[] {
  const meta = readMeta()
  const filename = basename(filepath)
  // Don't add duplicate
  if (meta.favorites.some((f) => f.filepath === filepath)) {
    return meta.favorites
  }
  const entry: LogFavoriteEntry = {
    filepath,
    filename,
    label,
    addedAt: Date.now()
  }
  meta.favorites.push(entry)
  writeMeta(meta)
  return meta.favorites
}

export function removeFavorite(filepath: string): LogFavoriteEntry[] {
  const meta = readMeta()
  meta.favorites = meta.favorites.filter((f) => f.filepath !== filepath)
  writeMeta(meta)
  return meta.favorites
}

export function isFavorite(filepath: string): boolean {
  return readMeta().favorites.some((f) => f.filepath === filepath)
}

// ---------------------------------------------------------------------------
// File reading
// ---------------------------------------------------------------------------

export interface FileReadResult {
  content: string
  totalLines: number
  size: number
}

export function readFile(filepath: string, offset = 0, limit = 2000): FileReadResult {
  const stat = statSync(filepath)
  const fullContent = readFileSync(filepath, 'utf-8')
  const lines = fullContent.split('\n')
  const totalLines = lines.length
  const sliced = lines.slice(offset, offset + limit)
  return {
    content: sliced.join('\n'),
    totalLines,
    size: stat.size
  }
}

// ---------------------------------------------------------------------------
// Directory listing
// ---------------------------------------------------------------------------

export interface DirEntry {
  name: string
  path: string
  isDirectory: boolean
  size: number
  mtimeMs: number
}

export function listDirectory(dirpath: string): DirEntry[] {
  const entries = readdirSync(dirpath)
  const result: DirEntry[] = []
  for (const name of entries) {
    // Skip hidden files
    if (name.startsWith('.')) continue
    try {
      const fullPath = join(dirpath, name)
      const stat = statSync(fullPath)
      result.push({
        name,
        path: fullPath,
        isDirectory: stat.isDirectory(),
        size: stat.size,
        mtimeMs: stat.mtimeMs
      })
    } catch {
      // skip entries we can't stat
    }
  }
  // Directories first, then by name
  result.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return result
}

// ---------------------------------------------------------------------------
// File watching
// ---------------------------------------------------------------------------

const watchers = new Map<string, FSWatcher>()

export function startWatching(filepath: string, onChanged: (content: string) => void): void {
  stopWatching(filepath)
  try {
    const watcher = watch(filepath, (eventType) => {
      if (eventType === 'change') {
        try {
          const content = readFileSync(filepath, 'utf-8')
          onChanged(content)
        } catch {
          // file may be temporarily inaccessible
        }
      }
    })
    watchers.set(filepath, watcher)
  } catch {
    // watch may fail (e.g. file doesn't exist yet)
  }
}

export function stopWatching(filepath: string): void {
  const existing = watchers.get(filepath)
  if (existing) {
    existing.close()
    watchers.delete(filepath)
  }
}

export function stopAllWatching(): void {
  for (const [path, watcher] of watchers.entries()) {
    watcher.close()
    watchers.delete(path)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getDataDir(): string {
  return app.getPath('userData')
}

/** Infer log type from filepath extension */
export function inferType(filepath: string): 'txt' | 'json' {
  const ext = filepath.toLowerCase()
  if (ext.endsWith('.json') || ext.endsWith('.jsonl')) return 'json'
  return 'txt'
}

export function pathExists(filepath: string): boolean {
  return existsSync(filepath)
}

export function isDirectory(filepath: string): boolean {
  try {
    return statSync(filepath).isDirectory()
  } catch {
    return false
  }
}
