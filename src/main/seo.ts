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

  headings: {
    level: number
    text: string
  }[]

  linkStats: {
    total: number
    internal: number
    external: number
    hashOnly: number
  }

  imagesMissingAlt: number
  hreflangs: { hreflang: string; href: string }[]

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
      og: {},
      twitter: {},
      headings: [],
      linkStats: { total: 0, internal: 0, external: 0, hashOnly: 0 },
      imagesMissingAlt: 0,
      hreflangs: [],
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
      headings: [],
      linkStats: { total: 0, internal: 0, external: 0, hashOnly: 0 },
      imagesMissingAlt: 0,
      hreflangs: [],
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

  // --- Headings ---
  const headings: { level: number; text: string }[] = []
  for (let level = 1; level <= 6; level++) {
    $(`h${level}`).each((_, el) => {
      const text = $(el).text().trim()
      if (text) headings.push({ level, text })
    })
  }

  const h1Count = headings.filter((h) => h.level === 1).length
  if (h1Count === 0) issues.push('No <h1> tag found')
  if (h1Count > 1) issues.push(`Multiple <h1> tags (${h1Count})`)

  // --- Links ---
  const origin = parsed.origin
  let linkTotal = 0
  let linkInternal = 0
  let linkExternal = 0
  let linkHashOnly = 0

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')?.trim() ?? ''
    if (!href) return
    linkTotal++
    if (href.startsWith('#')) {
      linkHashOnly++
    } else if (href.startsWith('/') || href.startsWith(origin)) {
      linkInternal++
    } else if (/^https?:\/\//i.test(href)) {
      linkExternal++
    } else {
      linkInternal++ // relative path
    }
  })

  // --- Images missing alt ---
  let imagesMissingAlt = 0
  $('img').each((_, el) => {
    const alt = $(el).attr('alt')
    if (alt === undefined || alt.trim() === '') {
      imagesMissingAlt++
    }
  })

  if (imagesMissingAlt > 0) {
    issues.push(`${imagesMissingAlt} image(s) missing alt text`)
  }

  // --- Hreflang ---
  const hreflangs: { hreflang: string; href: string }[] = []
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    const hreflang = $(el).attr('hreflang')?.trim()
    const href = $(el).attr('href')?.trim()
    if (hreflang && href) {
      hreflangs.push({ hreflang, href })
    }
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
    headings,
    linkStats: {
      total: linkTotal,
      internal: linkInternal,
      external: linkExternal,
      hashOnly: linkHashOnly
    },
    imagesMissingAlt,
    hreflangs,
    issues
  }
}
