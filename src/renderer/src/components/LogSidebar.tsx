import { useCallback, useEffect, useState } from 'react'
import { m } from '../paraglide/messages.js'

// ---------------------------------------------------------------------------
// Local types (mirror preload types for renderer usage)
// ---------------------------------------------------------------------------

interface LogRecentEntry {
  filepath: string
  filename: string
  lastOpened: number
}

interface LogFavoriteEntry {
  filepath: string
  filename: string
  label?: string
  addedAt: number
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LogSidebarProps {
  onSelectPath: (filepath: string, isDirectory: boolean) => void
  currentPath?: string
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const sectionHeaderCls =
  'font-headline text-[12px] uppercase tracking-[3px] text-black pb-[8px] border-b-[3px] border-black mb-[8px]'

const listItemCls =
  'font-mono text-[12px] leading-[1.5] px-[8px] py-[6px] w-full text-left border-b-[1px] border-black/30 hover:bg-black hover:text-white transition-colors duration-[50ms] cursor-pointer truncate'

const btnSmallCls =
  'font-mono text-[10px] leading-[1.5] py-[2px] px-[6px] border-[2px] border-black bg-white text-black cursor-pointer transition-colors duration-[50ms] hover:bg-black hover:text-white shrink-0'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LogSidebar({
  onSelectPath,
  currentPath
}: LogSidebarProps): React.JSX.Element {
  const [recents, setRecents] = useState<LogRecentEntry[]>([])
  const [favorites, setFavorites] = useState<LogFavoriteEntry[]>([])

  const loadData = useCallback(async () => {
    const [r, f] = await Promise.all([window.logsApi.getRecents(), window.logsApi.getFavorites()])
    setRecents(r)
    setFavorites(f)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData, currentPath])

  const handleRemoveRecent = useCallback(
    async (e: React.MouseEvent, filepath: string) => {
      e.stopPropagation()
      await window.logsApi.removeRecent(filepath)
      loadData()
    },
    [loadData]
  )

  const handleToggleFavorite = useCallback(
    async (e: React.MouseEvent, filepath: string) => {
      e.stopPropagation()
      const isFav = favorites.some((f) => f.filepath === filepath)
      if (isFav) {
        await window.logsApi.removeFavorite(filepath)
      } else {
        await window.logsApi.addFavorite(filepath)
      }
      loadData()
    },
    [favorites, loadData]
  )

  const handleClearRecents = useCallback(async () => {
    await window.logsApi.clearRecents()
    setRecents([])
  }, [])

  const handleSelect = useCallback(
    async (filepath: string) => {
      const isDir = await window.logsApi.isDirectory(filepath)
      onSelectPath(filepath, isDir)
    },
    [onSelectPath]
  )

  return (
    <div className="flex flex-col h-full border-[3px] border-black p-[12px] bg-white">
      {/* Recents */}
      <div className="pb-[20px]">
        <div className="flex items-center justify-between mb-[4px]">
          <h3 className={sectionHeaderCls} style={{ border: 'none', margin: 0, padding: 0 }}>
            {m.logs_recents()}
          </h3>
          {recents.length > 0 && (
            <button type="button" className={btnSmallCls} onClick={handleClearRecents}>
              {m.logs_clear_recents()}
            </button>
          )}
        </div>
        {recents.length === 0 ? (
          <p className="font-mono text-[12px] text-black/50 px-[8px]">{m.logs_empty_recents()}</p>
        ) : (
          <div className="max-h-[200px] overflow-y-auto">
            {recents.map((r) => (
              <div key={r.filepath} className="flex items-center gap-[4px]">
                <button
                  type="button"
                  className={`${listItemCls} flex-1`}
                  onClick={() => handleSelect(r.filepath)}
                  title={r.filepath}
                >
                  {r.filename}
                </button>
                <button
                  type="button"
                  className={btnSmallCls}
                  onClick={(e) => handleToggleFavorite(e, r.filepath)}
                  title={
                    favorites.some((f) => f.filepath === r.filepath)
                      ? m.logs_remove_favorite()
                      : m.logs_add_favorite()
                  }
                >
                  {favorites.some((f) => f.filepath === r.filepath) ? '★' : '☆'}
                </button>
                <button
                  type="button"
                  className={btnSmallCls}
                  onClick={(e) => handleRemoveRecent(e, r.filepath)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Favorites */}
      <div>
        <h3 className={sectionHeaderCls} style={{ border: 'none', margin: 0, padding: 0 }}>
          {m.logs_favorites()}
        </h3>
        {favorites.length === 0 ? (
          <p className="font-mono text-[12px] text-black/50 px-[8px]">{m.logs_empty_favorites()}</p>
        ) : (
          <div className="max-h-[200px] overflow-y-auto">
            {favorites.map((f) => (
              <div key={f.filepath} className="flex items-center gap-[4px]">
                <button
                  type="button"
                  className={`${listItemCls} flex-1`}
                  onClick={() => handleSelect(f.filepath)}
                  title={f.filepath}
                >
                  {f.label || f.filename}
                </button>
                <button
                  type="button"
                  className={btnSmallCls}
                  onClick={(e) => handleToggleFavorite(e, f.filepath)}
                  title={m.logs_remove_favorite()}
                >
                  ★
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
