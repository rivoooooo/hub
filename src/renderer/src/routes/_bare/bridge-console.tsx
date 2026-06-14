import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConsoleOutputEntry {
  level: 'log' | 'warn' | 'error'
  message: string
}

interface CallEntry {
  id: number
  timestamp: number
  path: string
  args: unknown[]
  result: unknown
  error: string | null
  durationMs: number
  mode: 'custom' | 'static' | 'declarative'
  sync: boolean
  stack?: string
  consoleOutput?: ConsoleOutputEntry[]
  sourceUrl?: string
  traceId?: string
  argsSize?: number
}

interface CallPage {
  entries: CallEntry[]
  total: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50
const isMac = /mac/i.test(navigator.platform ?? '')

type SortKey =
  | 'time-desc'
  | 'time-asc'
  | 'duration-desc'
  | 'duration-asc'
  | 'path-asc'
  | 'path-desc'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtTime(t: number): string {
  const d = new Date(t)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

function fmtDate(t: number): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function shortJson(val: unknown, max = 60): string {
  if (val === undefined) return 'undefined'
  if (val === null) return 'null'
  let s: string
  try {
    s = JSON.stringify(val)
  } catch {
    s = String(val)
  }
  if (s.length > max) return s.slice(0, max) + '…'
  return s
}

function prettyJson(val: unknown): string {
  if (val === undefined) return 'undefined'
  if (val === null) return 'null'
  try {
    return JSON.stringify(val, null, 2)
  } catch {
    return String(val)
  }
}

function truncateUrl(url: string, max = 50): string {
  if (url.length <= max) return url
  return url.slice(0, max - 3) + '…'
}

// ---------------------------------------------------------------------------
// RawBlock Design — colours
// ---------------------------------------------------------------------------

const RB = {
  black: '#000000',
  white: '#FFFFFF',
  red: '#FF0000',
  green: '#008000',
  orange: '#FFA500',
  blue: '#0000FF',
  greyLight: '#F0F0F0',
  greyBorder: '#CCCCCC'
} as const

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/_bare/bridge-console')({
  component: function BridgeCallLog(): React.JSX.Element {
    // --- State ---
    const [entries, setEntries] = useState<CallEntry[]>([])
    const [total, setTotal] = useState(0)
    const [loadedPage, setLoadedPage] = useState(0)
    const [loading, setLoading] = useState(false)
    const [hasMore, setHasMore] = useState(true)
    const [liveSync, setLiveSync] = useState(false)

    const [expanded, setExpanded] = useState<Set<number>>(new Set())
    const [selectedIdx, setSelectedIdx] = useState<number | null>(null)

    const [search, setSearch] = useState('')
    const [sort, setSort] = useState<SortKey>('time-desc')
    const [modeFilter, setModeFilter] = useState('all')

    const listRef = useRef<HTMLDivElement>(null)
    const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map())
    const loadingRef = useRef(false)

    // -----------------------------------------------------------------------
    // Data fetching
    // -----------------------------------------------------------------------

    const fetchPage = useCallback(async (page: number, replace = false) => {
      if (loadingRef.current) return
      loadingRef.current = true
      setLoading(true)
      try {
        const result: CallPage = await window.bridgeCallApi.getPage(page, PAGE_SIZE)
        if (replace) {
          setEntries(result.entries)
        } else {
          setEntries((prev) => {
            const existingIds = new Set(prev.map((e) => e.id))
            const newOnes = result.entries.filter((e) => !existingIds.has(e.id))
            return [...prev, ...newOnes]
          })
        }
        setTotal(result.total)
        setLoadedPage(page)
        setHasMore(page * PAGE_SIZE + PAGE_SIZE < result.total)
      } catch {
        // silent
      } finally {
        loadingRef.current = false
        setLoading(false)
      }
    }, [])

    // Initial load
    useEffect(() => {
      fetchPage(0, true)
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // -----------------------------------------------------------------------
    // Live sync — auto-poll page 0 when enabled
    // -----------------------------------------------------------------------

    useEffect(() => {
      if (!liveSync) return
      const timer = setInterval(() => {
        fetchPage(0, true)
      }, 1200)
      return () => clearInterval(timer)
    }, [liveSync, fetchPage])

    // -----------------------------------------------------------------------
    // Scroll-based pagination
    // -----------------------------------------------------------------------

    const handleScroll = useCallback(() => {
      if (!listRef.current || loading || !hasMore || liveSync) return
      const { scrollTop, scrollHeight, clientHeight } = listRef.current
      if (scrollHeight - scrollTop - clientHeight < 200) {
        fetchPage(loadedPage + 1)
      }
    }, [loading, hasMore, loadedPage, fetchPage, liveSync])

    // -----------------------------------------------------------------------
    // Actions
    // -----------------------------------------------------------------------

    const handleRefresh = useCallback(() => {
      setExpanded(new Set())
      setSelectedIdx(null)
      setLoadedPage(0)
      setHasMore(true)
      fetchPage(0, true)
    }, [fetchPage])

    const handleClear = useCallback(async () => {
      await window.bridgeCallApi.clear()
      setExpanded(new Set())
      setSelectedIdx(null)
      setEntries([])
      setTotal(0)
      setLoadedPage(0)
      setHasMore(false)
    }, [])

    const handleDelete = useCallback(async (id: number) => {
      await window.bridgeCallApi.delete(id)
      setEntries((prev) => prev.filter((e) => e.id !== id))
      setTotal((prev) => prev - 1)
      setExpanded((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }, [])

    // -----------------------------------------------------------------------
    // Filter + sort
    // -----------------------------------------------------------------------

    const filtered = entries
      .filter((e) => {
        if (modeFilter !== 'all' && e.mode !== modeFilter) return false
        if (search) {
          const q = search.toLowerCase()
          return e.path.toLowerCase().includes(q) || (e.sourceUrl ?? '').toLowerCase().includes(q)
        }
        return true
      })
      .sort((a, b) => {
        switch (sort) {
          case 'time-asc':
            return a.timestamp - b.timestamp
          case 'duration-desc':
            return b.durationMs - a.durationMs
          case 'duration-asc':
            return a.durationMs - b.durationMs
          case 'path-asc':
            return a.path.localeCompare(b.path)
          case 'path-desc':
            return b.path.localeCompare(a.path)
          case 'time-desc':
          default:
            return b.timestamp - a.timestamp
        }
      })

    // -----------------------------------------------------------------------
    // Expand / collapse
    // -----------------------------------------------------------------------

    const toggleExpand = (id: number): void => {
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    }

    // -----------------------------------------------------------------------
    // Keyboard navigation
    // -----------------------------------------------------------------------

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (filtered.length === 0) return
        let idx = selectedIdx ?? 0

        switch (e.key) {
          case 'j':
          case 'ArrowDown':
            e.preventDefault()
            idx = Math.min(idx + 1, filtered.length - 1)
            setSelectedIdx(idx)
            itemRefs.current.get(filtered[idx].id)?.scrollIntoView({ block: 'nearest' })
            break
          case 'k':
          case 'ArrowUp':
            e.preventDefault()
            idx = Math.max(idx - 1, 0)
            setSelectedIdx(idx)
            itemRefs.current.get(filtered[idx].id)?.scrollIntoView({ block: 'nearest' })
            break
          case 'Enter':
            e.preventDefault()
            if (selectedIdx !== null && filtered[selectedIdx]) {
              toggleExpand(filtered[selectedIdx].id)
            }
            break
          case 'Delete':
          case 'Backspace':
            e.preventDefault()
            if (selectedIdx !== null && filtered[selectedIdx]) {
              handleDelete(filtered[selectedIdx].id)
            }
            break
        }
      },
      [filtered, selectedIdx, handleDelete]
    )

    // -----------------------------------------------------------------------
    // Mode badge helper
    // -----------------------------------------------------------------------

    function ModeBadge({
      mode,
      sync
    }: {
      mode: 'custom' | 'static' | 'declarative'
      sync: boolean
    }): React.JSX.Element {
      const borderColor = mode === 'custom' ? RB.black : mode === 'static' ? RB.blue : RB.green
      return (
        <span
          className="inline-block px-[4px] py-[1px] text-[10px] font-bold uppercase tracking-[1px]"
          style={{
            border: `2px solid ${borderColor}`,
            color: borderColor,
            backgroundColor: RB.white
          }}
        >
          {mode}
          {sync ? '•sync' : ''}
        </span>
      )
    }

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    return (
      <div
        className="h-screen flex flex-col"
        style={{ backgroundColor: RB.white }}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        {/* ---------------------------------------------------------------- */}
        {/* Header                                                          */}
        {/* ---------------------------------------------------------------- */}
        <header
          style={
            {
              WebkitAppRegion: 'drag',
              paddingLeft: isMac ? 100 : 0,
              borderBottom: `3px solid ${RB.black}`
            } as React.CSSProperties
          }
          className="px-[24px] h-12 shrink-0 flex items-center justify-between"
        >
          <div
            className="flex items-center gap-[16px] flex-1 min-w-0"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <span className="font-headline text-[14px] uppercase tracking-[2px] text-black whitespace-nowrap">
              Bridge Call Log
            </span>
            <span className="font-mono text-[12px] text-black whitespace-nowrap">
              {total} calls
            </span>

            {/* Search */}
            <input
              type="text"
              placeholder="Search path or URL…"
              className="font-mono text-[13px] text-black outline-none flex-1 min-w-[80px] max-w-[240px]"
              style={{
                border: `3px solid ${RB.black}`,
                padding: '4px 8px',
                backgroundColor: RB.white
              }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={(e) => {
                e.currentTarget.style.borderWidth = '5px'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderWidth = '3px'
              }}
            />
          </div>

          <div
            className="flex items-center gap-[8px]"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            {/* Sort */}
            <select
              className="font-mono text-[11px] uppercase tracking-[1px] text-black outline-none cursor-pointer"
              style={{
                border: `3px solid ${RB.black}`,
                padding: '4px 6px',
                backgroundColor: RB.white,
                borderRadius: 0
              }}
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              <option value="time-desc">Newest</option>
              <option value="time-asc">Oldest</option>
              <option value="duration-desc">Slowest</option>
              <option value="duration-asc">Fastest</option>
              <option value="path-asc">Path A→Z</option>
              <option value="path-desc">Path Z→A</option>
            </select>

            {/* Mode filter */}
            <select
              className="font-mono text-[11px] uppercase tracking-[1px] text-black outline-none cursor-pointer"
              style={{
                border: `3px solid ${RB.black}`,
                padding: '4px 6px',
                backgroundColor: RB.white,
                borderRadius: 0
              }}
              value={modeFilter}
              onChange={(e) => setModeFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="custom">Custom</option>
              <option value="static">Static</option>
              <option value="declarative">Declarative</option>
            </select>

            {/* Live Sync toggle — RawBlock status chip */}
            <button
              className="font-body text-[11px] uppercase tracking-[2px] cursor-pointer"
              style={{
                border: `3px solid ${liveSync ? RB.green : RB.black}`,
                padding: '4px 10px',
                backgroundColor: liveSync ? RB.green : RB.white,
                color: liveSync ? RB.white : RB.black
              }}
              onClick={() => {
                setLiveSync((prev) => !prev)
              }}
              onMouseEnter={(e) => {
                if (!liveSync) {
                  e.currentTarget.style.backgroundColor = RB.black
                  e.currentTarget.style.color = RB.white
                }
              }}
              onMouseLeave={(e) => {
                if (!liveSync) {
                  e.currentTarget.style.backgroundColor = RB.white
                  e.currentTarget.style.color = RB.black
                }
              }}
              title={
                liveSync
                  ? 'Live sync is on — auto-refreshing every 1.2s'
                  : 'Enable live sync to auto-refresh'
              }
            >
              {liveSync ? '● Live' : '○ Live'}
            </button>

            {/* Refresh — RawBlock Primary (white bg, black text, 3px border, hover invert) */}
            <button
              className="font-body text-[11px] uppercase tracking-[2px] cursor-pointer"
              style={{
                border: `3px solid ${RB.black}`,
                padding: '4px 12px',
                backgroundColor: RB.white,
                color: RB.black
              }}
              onClick={handleRefresh}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = RB.black
                e.currentTarget.style.color = RB.white
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = RB.white
                e.currentTarget.style.color = RB.black
              }}
            >
              Refresh
            </button>
            <button
              className="font-body text-[11px] uppercase tracking-[2px] cursor-pointer"
              style={{
                border: `3px solid ${RB.black}`,
                padding: '4px 12px',
                backgroundColor: RB.white,
                color: RB.black
              }}
              onClick={handleClear}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = RB.red
                e.currentTarget.style.color = RB.white
                e.currentTarget.style.borderColor = RB.red
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = RB.white
                e.currentTarget.style.color = RB.black
                e.currentTarget.style.borderColor = RB.black
              }}
            >
              Clear All
            </button>
          </div>
        </header>

        {/* ---------------------------------------------------------------- */}
        {/* Entry list                                                      */}
        {/* ---------------------------------------------------------------- */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto font-mono text-[13px] outline-none leading-[1.6]"
          onScroll={handleScroll}
          tabIndex={-1}
        >
          {liveSync && (
            <div
              className="flex items-center gap-[8px] px-[24px] py-[6px] text-[11px] uppercase tracking-[1px] font-bold"
              style={{
                backgroundColor: RB.green,
                color: RB.white,
                borderBottom: `3px solid ${RB.black}`
              }}
            >
              <span>●</span>
              <span>Live Sync — auto-refreshing every 1.2s</span>
              <span className="ml-auto font-mono normal-case tracking-normal font-normal">
                {total} calls
              </span>
            </div>
          )}
          {filtered.length === 0 && !loading && (
            <div className="flex items-center justify-center h-full text-black text-[14px]">
              {search || modeFilter !== 'all'
                ? 'No results match your filter.'
                : 'No bridge calls yet — invoke a bridge function to see results here.'}
            </div>
          )}

          {filtered.map((entry, idx) => {
            const isOpen = expanded.has(entry.id)
            const isSelected = selectedIdx === idx
            return (
              <div key={entry.id}>
                {/* -- Summary row -- */}
                <div
                  ref={(el) => {
                    if (el) itemRefs.current.set(entry.id, el)
                    else itemRefs.current.delete(entry.id)
                  }}
                  className="flex items-start gap-[8px] px-[24px] py-[8px] cursor-pointer"
                  style={{
                    borderBottom: `3px solid ${RB.black}`,
                    backgroundColor: isSelected ? RB.black : RB.white,
                    color: isSelected ? RB.white : RB.black
                  }}
                  onClick={() => {
                    setSelectedIdx(idx)
                    toggleExpand(entry.id)
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = '#F0F0F0'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = RB.white
                    }
                  }}
                >
                  {/* Timestamp */}
                  <span
                    className="text-[11px] w-[80px] shrink-0 pt-[2px]"
                    title={fmtDate(entry.timestamp)}
                    style={{ color: isSelected ? RB.white : undefined }}
                  >
                    {fmtTime(entry.timestamp)}
                  </span>

                  {/* Mode badge */}
                  <ModeBadge mode={entry.mode} sync={entry.sync} />

                  {/* Path */}
                  <span
                    className="text-[12px] w-[100px] shrink-0 truncate pt-[2px]"
                    title={entry.path}
                  >
                    [{entry.path}]
                  </span>

                  {/* Args preview */}
                  <span className="flex-1 break-all pt-[2px] min-w-0">{shortJson(entry.args)}</span>

                  {/* Duration */}
                  <span className="text-[11px] w-[44px] shrink-0 text-right pt-[2px]">
                    {entry.durationMs}ms
                  </span>

                  {/* Args size */}
                  {entry.argsSize !== undefined && (
                    <span className="text-[10px] w-[40px] shrink-0 text-right pt-[2px]">
                      {entry.argsSize}b
                    </span>
                  )}

                  {/* Expand indicator */}
                  <span className="text-[11px] w-[16px] shrink-0 pt-[2px]">
                    {isOpen ? '▾' : '▸'}
                  </span>
                </div>

                {/* -- Expanded detail -- */}
                {isOpen && (
                  <div
                    className="px-[24px] py-[12px] text-[12px]"
                    style={{
                      borderBottom: `3px solid ${RB.black}`,
                      backgroundColor: RB.greyLight
                    }}
                  >
                    {/* Error */}
                    {entry.error ? (
                      <div className="mb-[8px]" style={{ color: RB.red }}>
                        <span className="font-bold uppercase tracking-[1px]">Error:</span>{' '}
                        <span>{entry.error}</span>
                      </div>
                    ) : null}

                    {/* Arguments */}
                    <div className="mb-[8px]">
                      <span className="font-bold uppercase tracking-[1px] text-black">
                        Arguments:
                      </span>
                      <pre
                        className="mt-[4px] p-[12px] overflow-x-auto whitespace-pre-wrap text-[12px]"
                        style={{
                          border: `3px solid ${RB.black}`,
                          backgroundColor: RB.white,
                          color: RB.black
                        }}
                      >
                        {prettyJson(entry.args)}
                      </pre>
                    </div>

                    {/* Result */}
                    {!entry.error ? (
                      <div className="mb-[8px]">
                        <span className="font-bold uppercase tracking-[1px] text-black">
                          Result:
                        </span>
                        <pre
                          className="mt-[4px] p-[12px] overflow-x-auto whitespace-pre-wrap text-[12px]"
                          style={{
                            border: `3px solid ${RB.black}`,
                            backgroundColor: RB.white,
                            color: RB.black
                          }}
                        >
                          {prettyJson(entry.result)}
                        </pre>
                      </div>
                    ) : null}

                    {/* Console Output */}
                    {entry.consoleOutput && entry.consoleOutput.length > 0 ? (
                      <div className="mb-[8px]">
                        <span className="font-bold uppercase tracking-[1px] text-black">
                          Console Output:
                        </span>
                        <div
                          className="mt-[4px] p-[8px] text-[12px] leading-[1.5] max-h-[200px] overflow-y-auto"
                          style={{
                            border: `3px solid ${RB.black}`,
                            backgroundColor: RB.white
                          }}
                        >
                          {entry.consoleOutput.map((c, i) => {
                            const cColor =
                              c.level === 'error'
                                ? RB.red
                                : c.level === 'warn'
                                  ? RB.orange
                                  : RB.black
                            return (
                              <div key={i} className="flex items-start gap-[8px]">
                                <span
                                  className="w-[36px] shrink-0 font-bold uppercase text-[10px] tracking-[1px]"
                                  style={{ color: cColor }}
                                >
                                  {c.level}
                                </span>
                                <span style={{ color: cColor }}>{c.message}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ) : null}

                    {/* Stack Trace */}
                    {entry.stack ? (
                      <div className="mb-[8px]">
                        <span className="font-bold uppercase tracking-[1px] text-black">
                          Stack Trace:
                        </span>
                        <pre
                          className="mt-[4px] p-[12px] overflow-x-auto whitespace-pre-wrap text-[11px] max-h-[160px] overflow-y-auto"
                          style={{
                            border: `3px solid ${RB.black}`,
                            backgroundColor: RB.white,
                            color: RB.black
                          }}
                        >
                          {entry.stack}
                        </pre>
                      </div>
                    ) : null}

                    {/* Footer meta */}
                    <div className="flex flex-wrap gap-x-[16px] gap-y-[4px] mt-[4px] text-[11px]">
                      <span>Duration: {entry.durationMs}ms</span>
                      <span>
                        Mode: {entry.mode}
                        {entry.sync ? ' (sync)' : ' (async)'}
                      </span>
                      {entry.argsSize !== undefined && <span>Args: {entry.argsSize}b</span>}
                      {entry.sourceUrl ? (
                        <span title={entry.sourceUrl} className="underline">
                          {truncateUrl(entry.sourceUrl)}
                        </span>
                      ) : null}
                      {entry.traceId && <span className="font-mono">Trace: {entry.traceId}</span>}
                    </div>

                    {/* Single-delete button — RawBlock destructive */}
                    <div className="mt-[12px] flex justify-end">
                      <button
                        className="font-body text-[10px] uppercase tracking-[2px] cursor-pointer"
                        style={{
                          border: `3px solid ${RB.red}`,
                          padding: '4px 12px',
                          backgroundColor: RB.white,
                          color: RB.red
                        }}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(entry.id)
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = RB.red
                          e.currentTarget.style.color = RB.white
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = RB.white
                          e.currentTarget.style.color = RB.red
                        }}
                      >
                        Delete entry
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* Load more indicator */}
          {loading && (
            <div className="flex items-center justify-center py-[16px] text-black text-[12px] font-mono">
              Loading…
            </div>
          )}
          {!hasMore && entries.length > 0 && !liveSync && (
            <div className="flex items-center justify-center py-[16px] text-black text-[11px] font-mono">
              All {total} entries loaded
            </div>
          )}
          {liveSync && entries.length > 0 && (
            <div className="flex items-center justify-center py-[16px] text-black text-[11px] font-mono">
              <span
                className="inline-block w-[6px] h-[6px] rounded-full mr-[6px]"
                style={{ backgroundColor: RB.green }}
              />
              Live — showing latest page. Scroll up or disable Live Sync to browse history.
            </div>
          )}
        </div>
      </div>
    )
  }
})
