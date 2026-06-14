import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { m } from '../../paraglide/messages.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SeoResult {
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

interface SeoSearchParams {
  url?: string
}

interface HistoryEntry {
  id: string
  url: string
  timestamp: number
  title: string | null
  favicon: string | null
  result: SeoResult
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/_main/seo')({
  validateSearch: (input: Record<string, unknown>): SeoSearchParams => ({
    url: typeof input.url === 'string' ? input.url : undefined
  }),
  component: SeoPage
})

// ---------------------------------------------------------------------------
// Styles (RawBlock design system — matches browser.tsx)
// ---------------------------------------------------------------------------

const inputCls =
  'font-mono text-[15px] leading-[1.5] py-[10px] px-[12px] border-[3px] border-black bg-surface-sunken text-black outline-none transition-colors duration-[50ms] hover:bg-[#e8e8e8] focus:border-[5px] focus:bg-white flex-1'

const btnPrimary =
  'font-body text-[14px] font-semibold uppercase tracking-[2px] py-[10px] px-[24px] border-[3px] border-black bg-black text-white cursor-pointer transition-colors duration-[50ms] hover:bg-white hover:text-black active:border-[5px] active:bg-black active:text-white shrink-0'

const sectionTitle =
  'font-headline text-[12px] uppercase tracking-[3px] text-black pb-[8px] border-b-[3px] border-black mb-[12px]'

const valueCls = 'font-mono text-[14px] leading-[1.5] text-black break-all'

const tagCls =
  'font-mono text-[12px] px-[6px] py-[2px] border-[2px] border-black inline-block mr-[4px] mb-[4px]'

const issueCls =
  'font-mono text-[13px] leading-[1.5] py-[4px] px-[8px] mb-[4px] border-l-[4px] border-error bg-error/5 text-black'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function SeoPage(): React.JSX.Element {
  const { url: searchUrl } = Route.useSearch()
  const navigate = useNavigate()
  const [inputUrl, setInputUrl] = useState(searchUrl ?? '')
  const [result, setResult] = useState<SeoResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [showHistorySidebar, setShowHistorySidebar] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const entries = await window.seoApi.getHistory()
      setHistory(entries)
    } catch {
      // silently fail
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  // Load history on mount
  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  // Auto-analyze when url search param is present
  useEffect(() => {
    if (searchUrl && searchUrl !== result?.url) {
      setInputUrl(searchUrl)
      analyzeUrl(searchUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchUrl])

  const analyzeUrl = useCallback(
    async (url: string) => {
      if (!url.trim()) return
      setLoading(true)
      setError(null)
      setResult(null)

      try {
        const res = await window.seoApi.analyze(url)
        setResult(res)
        // Refresh history after new analysis
        loadHistory()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
      } finally {
        setLoading(false)
      }
    },
    [loadHistory]
  )

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      // Sync search param — the useEffect on searchUrl will trigger analysis
      navigate({ to: '/seo', search: { url: inputUrl.trim() || undefined } })
    },
    [inputUrl, navigate]
  )

  const handleHistoryClick = useCallback(
    (entry: HistoryEntry) => {
      setInputUrl(entry.url)
      navigate({ to: '/seo', search: { url: entry.url || undefined } })
      // Show the saved result directly without re-fetching
      setResult(entry.result)
      setError(null)
    },
    [navigate]
  )

  const handleClearHistory = useCallback(async () => {
    try {
      await window.seoApi.clearHistory()
      setHistory([])
    } catch {
      // silently fail
    }
  }, [])

  return (
    <div className="flex min-h-screen">
      {/* Main content */}
      <div className="flex-1 pt-[120px] pb-[80px] overflow-y-auto transition-all duration-[200ms]">
        <div className="mx-auto max-w-[960px] px-[24px]">
          <div className="flex items-center justify-between pb-[8px]">
            <div>
              <h1 className="font-headline text-[64px] leading-none text-black">{m.seo_title()}</h1>
              <p className="font-mono text-[15px] leading-[1.5] text-black pt-[4px]">
                {m.seo_subtitle()}
              </p>
            </div>
            <button
              className="font-body text-[14px] font-semibold uppercase tracking-[2px] py-[10px] px-[24px] border-[3px] border-black cursor-pointer transition-colors duration-[50ms] active:border-[5px] bg-black text-white hover:bg-white hover:text-black"
              onClick={() => setShowHistorySidebar(true)}
            >
              {m.seo_history()}
            </button>
          </div>

          {/* URL Input */}
          <form onSubmit={handleSubmit} className="flex gap-[8px] pb-[40px] pt-[24px]">
            <input
              ref={inputRef}
              type="text"
              className={inputCls}
              placeholder={m.seo_url_placeholder()}
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
            />
            <button type="submit" className={btnPrimary} disabled={loading}>
              {loading ? m.seo_analyzing_btn() : m.seo_analyze_btn()}
            </button>
          </form>

          {/* Error */}
          {error && (
            <div className="font-mono text-[14px] text-black border-[3px] border-error p-[16px] mb-[32px] bg-error/5">
              {error}
            </div>
          )}

          {/* Results */}
          {result && !loading && <SeoResults result={result} />}
        </div>
      </div>

      {/* Right sidebar — history */}
      <div
        className={`transition-all duration-[200ms] overflow-hidden h-screen bg-white border-l-[3px] border-black sticky top-0 ${
          showHistorySidebar ? 'w-[480px] max-w-[92vw]' : 'w-0 border-l-0'
        }`}
      >
        <div className="w-[480px] max-w-[92vw] h-full overflow-y-auto">
          <div className="px-[24px] pt-16">
            {/* Header */}
            <div className="flex items-center justify-between pb-[16px]">
              <span className="font-headline text-[14px] uppercase tracking-wider text-black">
                {m.seo_history()}
              </span>
              <div className="flex items-center gap-[8px]">
                {history.length > 0 && (
                  <button
                    type="button"
                    className="font-mono text-[11px] underline text-black hover:text-error"
                    onClick={handleClearHistory}
                  >
                    {m.seo_history_clear()}
                  </button>
                )}
                <button
                  className="font-body text-[20px] leading-none border-[3px] border-black w-[32px] h-[32px] flex items-center justify-center cursor-pointer hover:bg-black hover:text-white transition-colors duration-[50ms]"
                  onClick={() => setShowHistorySidebar(false)}
                  title="Close"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Content */}
            {historyLoading ? (
              <p className="font-mono text-[14px] text-black/50 italic">Loading…</p>
            ) : history.length === 0 ? (
              <p className="font-mono text-[14px] text-black/50 italic">{m.seo_history_empty()}</p>
            ) : (
              <div className="space-y-[8px]">
                {history.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-[12px] py-[8px] px-[12px] border-[2px] border-black/20 cursor-pointer transition-colors duration-[50ms] hover:bg-[#e8e8e8] hover:border-black"
                    onClick={() => {
                      handleHistoryClick(entry)
                      setShowHistorySidebar(false)
                    }}
                  >
                    {/* Favicon */}
                    <FaviconIcon url={entry.favicon ?? ''} />
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-[14px] leading-[1.4] text-black truncate">
                        {entry.title ?? entry.url}
                      </div>
                      <div className="font-mono text-[11px] leading-[1.4] text-black/50 truncate">
                        {entry.url}
                      </div>
                    </div>
                    {/* Timestamp */}
                    <span className="font-mono text-[11px] text-black/40 shrink-0">
                      {formatTimestamp(entry.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Results panel
// ---------------------------------------------------------------------------

function SeoResults({ result }: { result: SeoResult }): React.JSX.Element {
  return (
    <div className="space-y-[32px]">
      {/* Summary bar */}
      <div className="flex gap-[16px] flex-wrap pb-[8px]">
        <span className={tagCls}>{result.fetchTimeMs}ms</span>
        <span className={tagCls}>{(result.contentLength / 1024).toFixed(1)} KB</span>
        {result.issues.length === 0 ? (
          <span className={`${tagCls} border-green-600 bg-green-100`}>{m.seo_no_issues()}</span>
        ) : (
          <span className={`${tagCls} border-error bg-error/10`}>
            {result.issues.length} issue{result.issues.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Issues */}
      {result.issues.length > 0 && (
        <section>
          <h2 className={sectionTitle}>{m.seo_issues()}</h2>
          {result.issues.map((issue, i) => (
            <div key={i} className={issueCls}>
              {issue}
            </div>
          ))}
        </section>
      )}

      {/* Basic Meta */}
      <section>
        <h2 className={sectionTitle}>{m.seo_meta()}</h2>
        <MetaRow label="Title" value={result.title} />
        <MetaRow label="Description" value={result.metaDescription} />
        <MetaRow label="Keywords" value={result.metaKeywords} />
        <MetaRow label="Robots" value={result.metaRobots} />
        <MetaRow label="Canonical" value={result.canonical} />
        <MetaRow label="HTML Lang" value={result.htmlLang} />
        {/* Favicon — icon image with black square fallback */}
        <div className="flex gap-[12px] py-[6px] border-b-[1px] border-black/10 items-center">
          <span className="font-headline text-[11px] uppercase tracking-[1px] text-black/50 w-[140px] shrink-0 leading-[1.6]">
            Favicon
          </span>
          {result.favicon ? (
            <>
              <FaviconIcon url={result.favicon} />
              <span className={`${valueCls}`}>{result.favicon}</span>
            </>
          ) : (
            <span className={`${valueCls} text-black/30 italic`}>—</span>
          )}
        </div>
        <MetaRow label="Icon Href" value={result.iconHref} />
      </section>

      {/* Headings */}
      <section>
        <h2 className={sectionTitle}>
          {m.seo_headings()} ({result.headings.length})
        </h2>
        {result.headings.length === 0 ? (
          <p className="font-mono text-[14px] text-black/50 italic">{m.seo_no_headings()}</p>
        ) : (
          <div className="space-y-[4px]">
            {result.headings.map((h, i) => (
              <div
                key={i}
                className="font-mono text-[14px] leading-[1.5] text-black"
                style={{ paddingLeft: `${(h.level - 1) * 20}px` }}
              >
                <span className="text-black/40 font-bold mr-[8px]">H{h.level}</span>
                {h.text}
              </div>
            ))}
          </div>
        )}
        {result.headings.filter((h) => h.level === 1).length > 1 && (
          <p className="font-mono text-[12px] text-error mt-[8px]">⚠ Multiple H1 tags detected</p>
        )}
      </section>

      {/* Open Graph */}
      {Object.keys(result.og).length > 0 && (
        <section>
          <h2 className={sectionTitle}>{m.seo_og()}</h2>
          <MetaList title={m.seo_og_standard()} items={ogStandardItems(result.og)} />
          <MetaList title={m.seo_og_image()} items={ogPrefixedItems(result.og, 'image')} />
          <MetaList title={m.seo_og_audio()} items={ogPrefixedItems(result.og, 'audio')} />
          <MetaList title={m.seo_og_video()} items={ogPrefixedItems(result.og, 'video')} />
          {(() => {
            const other = ogOtherItems(result.og)
            return other.length > 0 ? <MetaList title={m.seo_og_other()} items={other} /> : null
          })()}
        </section>
      )}

      {/* Facebook */}
      {Object.keys(result.fb).length > 0 && (
        <section>
          <h2 className={sectionTitle}>{m.seo_fb()}</h2>
          {Object.entries(result.fb).map(([key, val]) => (
            <MetaRow key={key} label={key} value={val} />
          ))}
        </section>
      )}

      {/* Twitter Card */}
      {Object.keys(result.twitter).length > 0 && (
        <section>
          <h2 className={sectionTitle}>{m.seo_twitter()}</h2>
          <MetaList title={m.seo_twitter_core()} items={twitterCoreItems(result.twitter)} />
          <MetaList title={m.seo_twitter_override()} items={twitterOverrideItems(result.twitter)} />
          <MetaList
            title={m.seo_twitter_app()}
            items={twitterPrefixedItems(result.twitter, 'app')}
          />
          <MetaList
            title={m.seo_twitter_player()}
            items={twitterPrefixedItems(result.twitter, 'player')}
          />
          {(() => {
            const other = twitterOtherItems(result.twitter)
            return other.length > 0 ? <MetaList title={m.seo_og_other()} items={other} /> : null
          })()}
        </section>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function MetaRow({ label, value }: { label: string; value: string | null }): React.JSX.Element {
  return (
    <div className="flex gap-[12px] py-[6px] border-b-[1px] border-black/10">
      <span className="font-headline text-[11px] uppercase tracking-[1px] text-black/50 w-[140px] shrink-0 leading-[1.6]">
        {label}
      </span>
      <span className={`${valueCls} ${value ? '' : 'text-black/30 italic'}`}>{value ?? '—'}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Categorized display helpers
// ---------------------------------------------------------------------------

const OG_STANDARD_KEYS = new Set([
  'title',
  'type',
  'url',
  'image',
  'description',
  'site_name',
  'locale',
  'locale:alternate',
  'determiner'
])

const TWITTER_CORE_KEYS = new Set(['card', 'site', 'creator'])
const TWITTER_OVERRIDE_KEYS = new Set(['title', 'description', 'image', 'image:alt'])

function ogStandardItems(og: Record<string, string>): [string, string][] {
  return Object.entries(og).filter(([k]) => OG_STANDARD_KEYS.has(k))
}

function ogPrefixedItems(og: Record<string, string>, prefix: string): [string, string][] {
  return Object.entries(og).filter(([k]) => k.startsWith(prefix + ':'))
}

function ogOtherItems(og: Record<string, string>): [string, string][] {
  const excluded = new Set<string>()
  for (const k of OG_STANDARD_KEYS) excluded.add(k)
  for (const k of Object.keys(og)) {
    if (k.startsWith('image:') || k.startsWith('audio:') || k.startsWith('video:')) {
      excluded.add(k)
    }
  }
  return Object.entries(og).filter(([k]) => !excluded.has(k))
}

function twitterCoreItems(tw: Record<string, string>): [string, string][] {
  return Object.entries(tw).filter(([k]) => TWITTER_CORE_KEYS.has(k))
}

function twitterOverrideItems(tw: Record<string, string>): [string, string][] {
  return Object.entries(tw).filter(([k]) => TWITTER_OVERRIDE_KEYS.has(k))
}

function twitterPrefixedItems(tw: Record<string, string>, prefix: string): [string, string][] {
  return Object.entries(tw).filter(([k]) => k.startsWith(prefix + ':'))
}

function twitterOtherItems(tw: Record<string, string>): [string, string][] {
  const excluded = new Set<string>()
  for (const k of TWITTER_CORE_KEYS) excluded.add(k)
  for (const k of TWITTER_OVERRIDE_KEYS) excluded.add(k)
  for (const k of Object.keys(tw)) {
    if (k.startsWith('app:') || k.startsWith('player:')) excluded.add(k)
  }
  return Object.entries(tw).filter(([k]) => !excluded.has(k))
}

function MetaList({
  title,
  items
}: {
  title: string
  items: [string, string][]
}): React.JSX.Element | null {
  if (items.length === 0) return null
  return (
    <div className="mb-[16px]">
      <h3 className="font-mono text-[11px] uppercase tracking-[2px] text-black/50 pb-[6px] border-b-[1px] border-black/10 mb-[4px]">
        {title}
      </h3>
      {items.map(([key, val]) => (
        <MetaRow key={key} label={key} value={val} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// FaviconIcon — shows the favicon image, falls back to a black square on error
// ---------------------------------------------------------------------------

function FaviconIcon({ url }: { url: string }): React.JSX.Element {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <span
        className="w-[20px] h-[20px] border-[2px] border-black bg-black shrink-0"
        title={`Favicon failed to load from ${url}`}
      />
    )
  }

  return (
    <img
      src={url}
      alt=""
      className="w-[20px] h-[20px] border-[2px] border-black shrink-0"
      onError={() => setFailed(true)}
    />
  )
}

// ---------------------------------------------------------------------------
// Timestamp formatting
// ---------------------------------------------------------------------------

function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
