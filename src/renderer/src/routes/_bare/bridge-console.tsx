import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConsoleEntry {
  id: number
  timestamp: number
  level: 'log' | 'warn' | 'error'
  message: string
  path: string
}

const isMac = /mac/i.test(navigator.platform ?? '')

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const btnSmall =
  'font-body text-[11px] uppercase tracking-[1px] border-[3px] border-black px-[6px] py-[3px] cursor-pointer transition-colors duration-[50ms]'

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/_bare/bridge-console')({
  component: function BridgeConsole(): React.JSX.Element {
    const [entries, setEntries] = useState<ConsoleEntry[]>([])
    const [autoScroll, setAutoScroll] = useState(true)
    const [filter, setFilter] = useState<'all' | 'log' | 'warn' | 'error'>('all')
    const listRef = useRef<HTMLDivElement>(null)

    // -----------------------------------------------------------------------
    // Fetch entries
    // -----------------------------------------------------------------------

    const fetchEntries = useCallback(() => {
      window.sandboxConsoleApi
        .getEntries()
        .then(setEntries)
        .catch(() => setEntries([]))
    }, [])

    useEffect(() => {
      fetchEntries()
      // Poll every 1s for new entries
      const timer = setInterval(fetchEntries, 1000)
      return () => clearInterval(timer)
    }, [fetchEntries])

    // -----------------------------------------------------------------------
    // Auto-scroll
    // -----------------------------------------------------------------------

    useEffect(() => {
      if (autoScroll && listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight
      }
    }, [entries, autoScroll])

    // -----------------------------------------------------------------------
    // Actions
    // -----------------------------------------------------------------------

    const handleClear = useCallback(async () => {
      await window.sandboxConsoleApi.clear()
      await fetchEntries()
    }, [fetchEntries])

    const handleRefresh = useCallback(() => {
      fetchEntries()
    }, [fetchEntries])

    // -----------------------------------------------------------------------
    // Filter
    // -----------------------------------------------------------------------

    const filtered = filter === 'all' ? entries : entries.filter((e) => e.level === filter)

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    const timeStr = (ts: number): string => {
      const d = new Date(ts)
      return d.toLocaleTimeString() + '.' + String(d.getMilliseconds()).padStart(3, '0')
    }

    const levelColors: Record<string, string> = {
      log: 'text-black',
      warn: 'text-[#b8860b]',
      error: 'text-[#cc0000]'
    }

    const levelBg: Record<string, string> = {
      log: 'bg-white',
      warn: 'bg-[#fff8e1]',
      error: 'bg-[#ffe8e8]'
    }

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    return (
      <div className="h-screen flex flex-col bg-white">
        {/* Header */}
        <header
          style={
            {
              WebkitAppRegion: 'drag',
              paddingLeft: isMac ? 100 : 0
            } as React.CSSProperties
          }
          className="px-[24px] h-12 border-b-[3px] border-black"
        >
          <div className="flex items-center justify-between size-full">
            <div
              className="flex items-center gap-[16px]"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              <span className="font-headline text-[14px] uppercase tracking-wider text-black">
                Sandbox Console
              </span>
              <span className="font-mono text-[12px] text-black opacity-50">
                {filtered.length} / {entries.length} entries
              </span>
            </div>

            <div
              className="flex items-center gap-[8px]"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              {/* Filter */}
              <select
                className="font-mono text-[12px] border-[3px] border-black px-[6px] py-[3px] bg-white text-black outline-none"
                value={filter}
                onChange={(e) => setFilter(e.target.value as typeof filter)}
              >
                <option value="all">all</option>
                <option value="log">log</option>
                <option value="warn">warn</option>
                <option value="error">error</option>
              </select>

              {/* Auto-scroll toggle */}
              <label className="flex items-center gap-[4px] cursor-pointer select-none text-[11px] font-body text-black">
                <span className="relative w-[18px] h-[18px]">
                  <input
                    type="checkbox"
                    className="peer w-[18px] h-[18px] border-[3px] border-black bg-white checked:bg-black cursor-pointer appearance-none transition-colors duration-[50ms] focus:border-[4px]"
                    checked={autoScroll}
                    onChange={() => setAutoScroll(!autoScroll)}
                  />
                  <svg
                    className="absolute inset-0 w-[18px] h-[18px] pointer-events-none hidden peer-checked:block"
                    viewBox="0 0 20 20"
                  >
                    <polyline
                      points="5,10 9,14 15,6"
                      fill="none"
                      stroke="white"
                      strokeWidth="3"
                      strokeLinecap="square"
                      strokeLinejoin="miter"
                    />
                  </svg>
                </span>
                auto-scroll
              </label>

              <button
                className={`${btnSmall} bg-white text-black hover:bg-black hover:text-white`}
                onClick={handleRefresh}
              >
                Refresh
              </button>
              <button
                className={`${btnSmall} bg-white text-black hover:bg-black hover:text-white`}
                onClick={handleClear}
              >
                Clear
              </button>
            </div>
          </div>
        </header>

        {/* Entry list */}
        <div ref={listRef} className="flex-1 overflow-y-auto font-mono text-[13px] leading-[1.6]">
          {filtered.length === 0 && (
            <div className="flex items-center justify-center h-full text-black opacity-30 text-[14px]">
              No console output yet — call a custom bridge function to see results here.
            </div>
          )}
          {filtered.map((entry) => (
            <div
              key={entry.id}
              className={`flex items-start gap-[8px] px-[24px] py-[4px] border-b-[1px] border-black/10 ${levelBg[entry.level]} hover:brightness-95 transition-all duration-[50ms]`}
            >
              {/* Level badge */}
              <span
                className={`inline-block w-[40px] shrink-0 text-[11px] uppercase font-bold ${levelColors[entry.level]}`}
              >
                {entry.level}
              </span>

              {/* Timestamp */}
              <span className="text-black/40 text-[11px] w-[100px] shrink-0">
                {timeStr(entry.timestamp)}
              </span>

              {/* Path badge */}
              <span
                className="text-black/30 text-[11px] w-[120px] shrink-0 truncate"
                title={entry.path}
              >
                [{entry.path}]
              </span>

              {/* Message */}
              <span className="text-black flex-1 break-all whitespace-pre-wrap">
                {entry.message}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }
})
