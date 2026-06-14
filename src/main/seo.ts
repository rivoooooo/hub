import { ipcMain } from 'electron'
import * as cheerio from 'cheerio'
import { fetchText } from './fetcher'

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

  og: Record<string, string>
  twitter: Record<string, string>

  issues: string[]
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export function registerSeoHandlers(): void {
  ipcMain.handle('seo:analyze', async (_event, url: string): Promise<SeoResult> => {
    return analyzeSeo(url)
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

  try {
    new URL(targetUrl)
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
      og: {},
      twitter: {},
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
      og: {},
      twitter: {},
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
    og,
    twitter,
    issues
  }
}
