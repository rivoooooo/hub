import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { m } from '../paraglide/messages.js'

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
  headings: { level: number; text: string }[]
  issues: string[]
}

interface SeoSearchParams {
  url?: string
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/seo')({
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
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-analyze when url search param is present
  useEffect(() => {
    if (searchUrl && searchUrl !== result?.url) {
      setInputUrl(searchUrl)
      analyzeUrl(searchUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchUrl])

  const analyzeUrl = useCallback(async (url: string) => {
    if (!url.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await window.seoApi.analyze(url)
      setResult(res)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      // Sync search param
      navigate({ to: '/seo', search: { url: inputUrl.trim() || undefined } })
      analyzeUrl(inputUrl)
    },
    [inputUrl, navigate, analyzeUrl]
  )

  return (
    <div className="pt-[120px] px-[24px] pb-[80px] max-w-[960px]">
      <h1 className="font-headline text-[64px] leading-none text-black pb-[8px]">
        {m.seo_title()}
      </h1>
      <p className="font-mono text-[15px] leading-[1.5] text-black pb-[32px]">{m.seo_subtitle()}</p>

      {/* URL Input */}
      <form onSubmit={handleSubmit} className="flex gap-[8px] pb-[40px]">
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
          {Object.entries(result.og).map(([key, val]) => (
            <MetaRow key={key} label={key} value={val} />
          ))}
        </section>
      )}

      {/* Twitter Card */}
      {Object.keys(result.twitter).length > 0 && (
        <section>
          <h2 className={sectionTitle}>{m.seo_twitter()}</h2>
          {Object.entries(result.twitter).map(([key, val]) => (
            <MetaRow key={key} label={key} value={val} />
          ))}
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
