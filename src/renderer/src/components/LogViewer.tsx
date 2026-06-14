import { useCallback, useEffect, useRef, useState } from 'react'
import { m } from '../paraglide/messages.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LogType = 'auto' | 'txt' | 'json'

export interface LogViewerProps {
  filepath: string
  watch?: boolean
  type?: LogType
  isDirectory?: boolean
  /** Called when the viewer navigates to a different path (e.g. dir entry click) */
  onPathChange?: (filepath: string) => void
}

// ---------------------------------------------------------------------------
// Local type (mirrors preload DirEntry)
// ---------------------------------------------------------------------------

interface DirEntry {
  name: string
  path: string
  isDirectory: boolean
  size: number
  mtimeMs: number
}

// ---------------------------------------------------------------------------
// Styles (RawBlock)
// ---------------------------------------------------------------------------

const btnSmallCls =
  'font-mono text-[11px] leading-[1.5] py-[4px] px-[8px] border-[2px] border-black bg-white text-black cursor-pointer transition-colors duration-[50ms] hover:bg-black hover:text-white'

const btnActiveCls = 'bg-black text-white'

const selectCls =
  'font-mono text-[13px] leading-[1.5] py-[6px] px-[10px] border-[3px] border-black bg-white text-black outline-none cursor-pointer transition-colors duration-[50ms] hover:bg-[#e8e8e8] appearance-none'

const preCls =
  'font-mono text-[13px] leading-[1.6] whitespace-pre-wrap break-all overflow-auto p-[16px] border-[3px] border-black bg-white text-black m-0'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString()
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LogViewer({
  filepath,
  watch: initialWatch = false,
  type: initialType = 'auto',
  isDirectory: directoryMode = false,
  onPathChange
}: LogViewerProps): React.JSX.Element {
  const [content, setContent] = useState<string>('')
  const [totalLines, setTotalLines] = useState(0)
  const [fileSize, setFileSize] = useState(0)
  const [currentPath, setCurrentPath] = useState(filepath)
  const [logType, setLogType] = useState<LogType>(initialType)
  const [watching, setWatching] = useState(initialWatch)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirEntries, setDirEntries] = useState<DirEntry[] | null>(null)
  const [isFav, setIsFav] = useState(false)
  const preRef = useRef<HTMLPreElement>(null)

  // Load file content / directory listing
  const loadPath = useCallback(
    async (path: string): Promise<void> => {
      setLoading(true)
      setError(null)
      setContent('')
      setDirEntries(null)

      try {
        const isDir = await window.logsApi.isDirectory(path)
        if (isDir) {
          const entries = await window.logsApi.listDirectory(path)
          setDirEntries(entries)
        } else {
          const result = await window.logsApi.readFile(path, 0, 5000)
          setContent(result.content)
          setTotalLines(result.totalLines)
          setFileSize(result.size)

          // Auto-detect type
          if (logType === 'auto') {
            const inferred = await window.logsApi.inferType(path)
            setDisplayType(inferred)
          }

          // Add to recents
          await window.logsApi.addRecent(path)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    },
    [logType]
  )

  const [displayType, setDisplayType] = useState<'txt' | 'json'>(
    initialType === 'auto' ? 'txt' : initialType
  )

  // Initial load
  useEffect(() => {
    if (filepath) {
      setCurrentPath(filepath)
      loadPath(filepath)
      // Check favorite status
      window.logsApi.isFavorite(filepath).then(setIsFav)
    }
  }, [filepath, loadPath])

  // Watch
  useEffect(() => {
    if (!watching || !currentPath) return
    window.logsApi.watchStart(currentPath)
    const unsub = window.logsApi.onFileChanged((fp, newContent) => {
      if (fp === currentPath) {
        setContent(newContent)
        // Auto-scroll to bottom
        requestAnimationFrame(() => {
          if (preRef.current) {
            preRef.current.scrollTop = preRef.current.scrollHeight
          }
        })
      }
    })
    return () => {
      unsub()
      window.logsApi.watchStop(currentPath)
    }
  }, [watching, currentPath])

  // Toggle watch
  const toggleWatch = useCallback(() => {
    setWatching((prev) => !prev)
  }, [])

  // Change log type
  const handleTypeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const val = e.target.value as LogType
      setLogType(val)
      if (val !== 'auto') {
        setDisplayType(val)
      } else {
        window.logsApi.inferType(currentPath).then(setDisplayType)
      }
    },
    [currentPath]
  )

  // Directory entry click — delegate to the parent via onPathChange,
  // which will flow back as the filepath prop and trigger loading via useEffect
  const handleDirEntryClick = useCallback(
    async (entryPath: string) => {
      onPathChange?.(entryPath)
    },
    [onPathChange]
  )

  // Favorite toggle
  const toggleFavorite = useCallback(async () => {
    if (isFav) {
      await window.logsApi.removeFavorite(currentPath)
      setIsFav(false)
    } else {
      await window.logsApi.addFavorite(currentPath)
      setIsFav(true)
    }
  }, [currentPath, isFav])

  // Render JSON with basic formatting
  const renderContent = (): string => {
    if (displayType === 'json') {
      try {
        return JSON.stringify(JSON.parse(content), null, 2)
      } catch {
        return content
      }
    }
    return content
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      {!directoryMode && (
        <div className="flex items-center gap-[8px] pb-[12px] flex-wrap">
          {/* Path display */}
          <span
            className="font-mono text-[13px] text-black truncate flex-1 min-w-0"
            title={currentPath}
          >
            {currentPath}
          </span>

          {/* Type selector */}
          <select
            value={logType}
            onChange={handleTypeChange}
            className={`${selectCls} max-w-[120px]`}
          >
            <option value="auto">{m.logs_type_auto()}</option>
            <option value="txt">{m.logs_type_txt()}</option>
            <option value="json">{m.logs_type_json()}</option>
          </select>

          {/* Watch toggle */}
          <button
            type="button"
            className={`${btnSmallCls} ${watching ? btnActiveCls : ''}`}
            onClick={toggleWatch}
          >
            {watching ? m.logs_stop_watch() : m.logs_watch()}
          </button>

          {/* Favorite */}
          <button type="button" className={btnSmallCls} onClick={toggleFavorite}>
            {isFav ? m.logs_remove_favorite() : m.logs_add_favorite()}
          </button>

          {/* File info */}
          {!loading && content && (
            <span className="font-mono text-[11px] text-black/50">
              {m.logs_total_lines({ lines: String(totalLines) })} | {formatSize(fileSize)}
            </span>
          )}
        </div>
      )}

      {/* Content area */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <span className="font-mono text-[15px] text-black">Loading…</span>
        </div>
      )}

      {error && (
        <div className="flex-1 flex items-center justify-center">
          <span className="font-mono text-[15px] text-[#FF0000]">{error}</span>
        </div>
      )}

      {/* Directory listing */}
      {dirEntries && !loading && (
        <div className="flex-1 overflow-auto border-[3px] border-black">
          {/* Parent dir link */}
          <button
            type="button"
            className="font-mono text-[13px] leading-[1.5] px-[12px] py-[8px] w-full text-left border-b-[2px] border-black hover:bg-[#e8e8e8] transition-colors duration-[50ms]"
            onClick={async () => {
              const parent = currentPath.split('/').slice(0, -1).join('/') || '/'
              handleDirEntryClick(parent)
            }}
          >
            ..
          </button>
          {dirEntries.map((entry) => (
            <button
              key={entry.path}
              type="button"
              className="font-mono text-[13px] leading-[1.5] px-[12px] py-[8px] w-full text-left border-b-[1px] border-black hover:bg-black hover:text-white transition-colors duration-[50ms]"
              onClick={() => handleDirEntryClick(entry.path)}
            >
              <span className={entry.isDirectory ? 'font-bold' : ''}>
                {entry.isDirectory ? '📁 ' : '📄 '}
                {entry.name}
              </span>
              {!entry.isDirectory && (
                <span className="text-black/40 ml-[12px]">{formatSize(entry.size)}</span>
              )}
              <span className="text-black/30 ml-[8px] text-[11px]">
                {formatTime(entry.mtimeMs)}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* File content */}
      {!loading && !error && !dirEntries && (
        <pre ref={preRef} className={`${preCls} flex-1`}>
          {renderContent()}
        </pre>
      )}
    </div>
  )
}
