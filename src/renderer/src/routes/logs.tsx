import { createFileRoute, Link, useSearch, useNavigate } from '@tanstack/react-router'
import { useState, useCallback } from 'react'
import LogViewer from '../components/LogViewer'
import LogSidebar from '../components/LogSidebar'
import { m } from '../paraglide/messages.js'

// ---------------------------------------------------------------------------
// Search params schema
// ---------------------------------------------------------------------------

interface LogsSearchParams {
  filepath?: string
  watch?: boolean
  type?: 'auto' | 'txt' | 'json'
  isDirectory?: boolean
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/logs')({
  validateSearch: (search: Record<string, unknown>): LogsSearchParams => ({
    filepath: typeof search.filepath === 'string' ? search.filepath : undefined,
    watch: search.watch === true || search.watch === 'true',
    type:
      search.type === 'auto' || search.type === 'txt' || search.type === 'json'
        ? search.type
        : undefined,
    isDirectory: search.isDirectory === true || search.isDirectory === 'true'
  }),
  component: function LogsPage(): React.JSX.Element {
    const search = useSearch({ from: Route.id })
    const navigate = useNavigate()
    const [currentPath, setCurrentPath] = useState<string>(search.filepath || '')
    const [inputPath, setInputPath] = useState(search.filepath || '')

    const handleSelectPath = useCallback(
      (filepath: string, isDirectory: boolean) => {
        setCurrentPath(filepath)
        setInputPath(filepath)
        navigate({
          to: '/logs',
          search: { filepath, isDirectory: isDirectory || undefined },
          replace: true
        })
      },
      [navigate]
    )

    const handleBrowse = useCallback(async () => {
      const val = inputPath.trim()
      if (!val) return
      setCurrentPath(val)
      try {
        const isDir = await window.logsApi.isDirectory(val)
        navigate({
          to: '/logs',
          search: { filepath: val, isDirectory: isDir || undefined },
          replace: true
        })
      } catch {
        navigate({
          to: '/logs',
          search: { filepath: val },
          replace: true
        })
      }
    }, [inputPath, navigate])

    return (
      <div className="pt-[80px] px-[24px] pb-[24px] h-screen flex flex-col">
        {/* Header + nav */}
        <div className="flex items-center gap-[16px] pb-[16px]">
          <Link
            to="/"
            className="font-mono text-[13px] text-black underline hover:text-blue transition-colors"
          >
            ← {m.back_to_home()}
          </Link>
          <h1 className="font-headline text-[32px] leading-none text-black">{m.logs_title()}</h1>
          <span className="font-mono text-[11px] text-black/50">
            {currentPath ? `→ ${currentPath}` : ''}
          </span>
        </div>

        {/* Path input + browse bar */}
        <div className="flex items-center gap-[8px] pb-[16px]">
          <input
            type="text"
            className="font-mono text-[13px] leading-[1.5] py-[8px] px-[12px] border-[3px] border-black bg-white text-black outline-none transition-colors duration-[50ms] hover:bg-[#e8e8e8] focus:border-[5px] flex-1 min-w-0"
            placeholder={m.logs_filepath_placeholder()}
            value={inputPath}
            onChange={(e) => setInputPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleBrowse()
            }}
          />
          <button
            type="button"
            className="font-mono text-[13px] leading-[1.5] py-[8px] px-[16px] border-[3px] border-black bg-black text-white cursor-pointer transition-colors duration-[50ms] hover:bg-white hover:text-black"
            onClick={handleBrowse}
          >
            {m.logs_browse()}
          </button>
        </div>

        {/* Main content: sidebar + viewer */}
        <div className="flex-1 flex gap-[16px] min-h-0">
          {/* Sidebar — recents & favorites */}
          <div className="w-[240px] shrink-0 overflow-y-auto">
            <LogSidebar onSelectPath={handleSelectPath} currentPath={currentPath} />
          </div>

          {/* Viewer */}
          <div className="flex-1 flex flex-col min-w-0">
            {currentPath ? (
              <LogViewer
                filepath={currentPath}
                watch={search.watch}
                type={search.type}
                isDirectory={search.isDirectory}
                onPathChange={(fp) => {
                  setCurrentPath(fp)
                  setInputPath(fp)
                  navigate({
                    to: '/logs',
                    search: { filepath: fp },
                    replace: true
                  })
                }}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center border-[3px] border-black">
                <p className="font-mono text-[15px] text-black/50">
                  Enter a file or directory path above
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }
})
