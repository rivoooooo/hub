import { ipcMain, app } from 'electron'
import * as cheerio from 'cheerio'
import { fetchText } from './fetcher'
import * as settings from './settings-store'
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SeoResult {
  url: string
  fetchTimeMs: number
  contentLength: number

  title: string | null
  metaDescription: string | null
  metaKeywords: string | null
  metaRobots: string | null
  canonical: string | null
  htmlLang: string | null
  favicon: string | null
  iconHref: string | null

  og: Record<string, string>
  twitter: Record<string, string>
  fb: Record<string, string>

  headings: { level: number; text: string }[]

  issues: string[]
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export function registerSeoHandlers(): void {
  ipcMain.handle('seo:analyze', async (_event, url: string): Promise<SeoResult> => {
    const result = await analyzeSeo(url)
    // Auto-save to history (fire-and-forget)
    try {
      saveHistoryEntry(result)
    } catch (err) {
      console.error('SEO history save failed:', err)
    }
    return result
  })

  ipcMain.handle('seo:get-history', async (): Promise<HistoryEntry[]> => {
    return readHistory()
  })

  ipcMain.handle('seo:clear-history', async (): Promise<void> => {
    clearHistory()
  })
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

async function analyzeSeo(url: string): Promise<SeoResult> {
  const issues: string[] = []

  // 1. Normalise URL
  let targetUrl = url.trim()
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'https://' + targetUrl
  }

  let parsed: URL
  try {
    parsed = new URL(targetUrl)
  } catch {
    return {
      url,
      fetchTimeMs: 0,
      contentLength: 0,
      title: null,
      metaDescription: null,
      metaKeywords: null,
      metaRobots: null,
      canonical: null,
      htmlLang: null,
      favicon: null,
      iconHref: null,
      og: {},
      twitter: {},
      fb: {},
      headings: [],
      issues: ['Invalid URL — could not parse']
    }
  }

  // 2. Fetch HTML from Node runtime (avoids CORS errors)
  const start = performance.now()
  let html: string
  let contentLength = 0

  try {
    const result = await fetchText(targetUrl, {
      timeout: 15_000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DevBrowser-SEO/1.0)',
        Accept: 'text/html,application/xhtml+xml'
      }
    })

    if (result.status < 200 || result.status >= 300) {
      issues.push(`HTTP ${result.status} ${result.statusText}`)
    }

    html = result.text
    contentLength = new TextEncoder().encode(html).length

    // Check content type
    const contentType = result.contentType
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      issues.push(`Unexpected content-type: "${contentType}" — page may not be HTML`)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    issues.push(`Fetch error: ${msg}`)
    return {
      url,
      fetchTimeMs: Math.round(performance.now() - start),
      contentLength: 0,
      title: null,
      metaDescription: null,
      metaKeywords: null,
      metaRobots: null,
      canonical: null,
      htmlLang: null,
      favicon: null,
      iconHref: null,
      og: {},
      twitter: {},
      fb: {},
      headings: [],
      issues
    }
  }

  const fetchTimeMs = Math.round(performance.now() - start)

  // 3. Parse HTML with cheerio
  const $ = cheerio.load(html)

  // --- Basic meta ---
  const title = $('title').first().text().trim() || null
  const metaDescription = $('meta[name="description"]').attr('content')?.trim() ?? null
  const metaKeywords = $('meta[name="keywords"]').attr('content')?.trim() ?? null
  const metaRobots = $('meta[name="robots"]').attr('content')?.trim() ?? null
  const canonical = $('link[rel="canonical"]').attr('href')?.trim() ?? null
  const htmlLang = $('html').attr('lang')?.trim() ?? null

  if (!title) issues.push('Missing <title> tag')
  if (!metaDescription) issues.push('Missing meta description')
  if (!htmlLang) issues.push('<html> is missing the lang attribute')

  // --- Open Graph ---
  const og: Record<string, string> = {}
  $('meta[property^="og:"]').each((_, el) => {
    const prop = $(el).attr('property')?.slice(3) // "og:title" → "title"
    const content = $(el).attr('content')?.trim()
    if (prop && content) og[prop] = content
  })

  // --- Twitter Card ---
  const twitter: Record<string, string> = {}
  $('meta[name^="twitter:"]').each((_, el) => {
    const name = $(el).attr('name')?.slice(8)
    const content = $(el).attr('content')?.trim()
    if (name && content) twitter[name] = content
  })

  // --- Facebook ---
  const fb: Record<string, string> = {}
  $('meta[property^="fb:"]').each((_, el) => {
    const prop = $(el).attr('property')?.slice(3) // "fb:app_id" → "app_id"
    const content = $(el).attr('content')?.trim()
    if (prop && content) fb[prop] = content
  })
  // Also try name="fb:..." variant
  $('meta[name^="fb:"]').each((_, el) => {
    const name = $(el).attr('name')?.slice(3)
    const content = $(el).attr('content')?.trim()
    if (name && content && !fb[name]) fb[name] = content
  })

  // --- Favicon ---
  let favicon: string | null = null
  let iconHref: string | null = null
  const iconLink =
    $('link[rel="icon"]').first().attr('href') ??
    $('link[rel="shortcut icon"]').first().attr('href') ??
    $('link[rel="apple-touch-icon"]').first().attr('href')
  if (iconLink) {
    iconHref = iconLink
    try {
      favicon = new URL(iconLink, parsed.origin).href
    } catch {
      favicon = null
    }
  }
  if (!favicon) {
    favicon = `${parsed.origin}/favicon.ico`
  }

  // --- Headings h1-h6 ---
  const headings: { level: number; text: string }[] = []
  for (let level = 1; level <= 6; level++) {
    $(`h${level}`).each((_, el) => {
      const text = $(el).text().trim()
      if (text) headings.push({ level, text })
    })
  }

  return {
    url,
    fetchTimeMs,
    contentLength,
    title,
    metaDescription,
    metaKeywords,
    metaRobots,
    canonical,
    htmlLang,
    favicon,
    iconHref,
    og,
    twitter,
    fb,
    headings,
    issues
  }
}

// ---------------------------------------------------------------------------
// History persistence
// ---------------------------------------------------------------------------

export interface HistoryEntry {
  id: string
  url: string
  timestamp: number
  title: string | null
  favicon: string | null
  result: SeoResult
}

/** Resolve the data directory from settings (expands ~, falls back to ~/.rivo). */
function resolveDataDir(): string {
  const configured = settings.get('seoHistoryDir')
  if (configured) {
    const trimmed = configured.trim()
    if (trimmed) {
      // Expand leading ~ to home directory
      let resolved = trimmed
      if (resolved.startsWith('~')) {
        resolved = resolved.replace('~', app.getPath('home'))
      }
      // Reject paths that are still empty or relative-only after expansion
      if (resolved) {
        return resolved
      }
    }
  }
  return join(app.getPath('home'), '.rivo')
}

/** Ensure the seo history subdirectory exists and return its path. */
function ensureHistoryDir(): string {
  const dataDir = resolveDataDir()
  const dir = join(dataDir, 'seo-history')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/** Save a single history entry to disk as a JSON file. */
function saveHistoryEntry(result: SeoResult): string {
  const dir = ensureHistoryDir()
  const timestamp = Date.now()
  const slug = slugifyUrl(result.url)
  const id = `${timestamp}-${slug}`
  const entry: HistoryEntry = {
    id,
    url: result.url,
    timestamp,
    title: result.title,
    favicon: result.favicon,
    result
  }
  writeFileSync(join(dir, `${id}.json`), JSON.stringify(entry, null, 2), 'utf-8')
  return id
}

/** Read all history entries, sorted newest-first. */
function readHistory(): HistoryEntry[] {
  const dir = ensureHistoryDir()
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
  const entries: HistoryEntry[] = []
  for (const file of files) {
    try {
      const raw = readFileSync(join(dir, file), 'utf-8')
      const entry = JSON.parse(raw) as HistoryEntry
      entries.push(entry)
    } catch {
      // skip corrupt files
    }
  }
  entries.sort((a, b) => b.timestamp - a.timestamp)
  return entries
}

/** Delete all history entries. */
function clearHistory(): void {
  const dir = ensureHistoryDir()
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
  for (const file of files) {
    unlinkSync(join(dir, file))
  }
}

/** Create a safe filesystem slug from a URL. */
function slugifyUrl(url: string): string {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 64)
}
