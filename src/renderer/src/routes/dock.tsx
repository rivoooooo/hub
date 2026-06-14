import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import DockAppFormModal, { type DockFormValues } from '@renderer/components/DockAppFormModal'
import { m } from '../paraglide/messages.js'

export const Route = createFileRoute('/dock')({
  component: function DockDesktop(): React.JSX.Element {
    const navigate = useNavigate()
    const [apps, setApps] = useState<DockApp[]>([])
    const [loading, setLoading] = useState(true)
    const [contextMenu, setContextMenu] = useState<{
      x: number
      y: number
      app: DockApp
    } | null>(null)
    const [editApp, setEditApp] = useState<DockApp | null>(null)

    const loadApps = useCallback(() => {
      void window.dockApi.getAll().then(
        (list) => {
          setApps(list)
          setLoading(false)
        },
        () => setLoading(false)
      )
    }, [])

    useEffect(() => {
      loadApps()
    }, [loadApps])

    // Close context menu on any click
    useEffect(() => {
      if (!contextMenu) return
      const handler = (): void => setContextMenu(null)
      document.addEventListener('click', handler)
      return () => document.removeEventListener('click', handler)
    }, [contextMenu])

    const handleLaunch = useCallback((app: DockApp) => {
      void window.dockApi.launch(app.id)
    }, [])

    const handleContextMenu = useCallback((e: React.MouseEvent, app: DockApp) => {
      e.preventDefault()
      e.stopPropagation()
      setContextMenu({ x: e.clientX, y: e.clientY, app })
    }, [])

    const handleUninstall = useCallback(() => {
      if (!contextMenu) return
      void window.dockApi.remove(contextMenu.app.id).then(() => {
        setContextMenu(null)
        loadApps()
      }, console.error)
    }, [contextMenu, loadApps])

    const handleEdit = useCallback(() => {
      if (!contextMenu) return
      setEditApp(contextMenu.app)
      setContextMenu(null)
    }, [contextMenu])

    const handleEditSubmit = useCallback(
      async (values: DockFormValues) => {
        if (!editApp) return
        await window.dockApi.update(editApp.id, values)
        setEditApp(null)
        loadApps()
      },
      [editApp, loadApps]
    )

    const editInitialValues = editApp
      ? {
          name: editApp.name,
          iconDataUrl: editApp.iconDataUrl,
          windowConfig: { ...editApp.windowConfig },
          userAgent: editApp.userAgent || ''
        }
      : {
          name: '',
          iconDataUrl: '',
          windowConfig: { width: 1024, height: 768, titleBarStyle: 'hidden' as const, frame: true },
          userAgent: ''
        }

    return (
      <div className="pt-[100px] px-[24px] pb-[40px] min-h-screen">
        <div className="flex items-center justify-between pb-[24px]">
          <h1 className="font-headline text-[48px] leading-none text-black">{m.dock_title()}</h1>
          <button
            className="font-body text-[12px] uppercase tracking-[1px] border-[3px] border-black px-[8px] py-[4px] cursor-pointer hover:bg-black hover:text-white transition-colors duration-[50ms]"
            onClick={() => navigate({ to: '/' })}
          >
            ← {m.back_to_home()}
          </button>
        </div>

        {loading ? (
          <div className="font-mono text-[15px] text-black opacity-60">Loading…</div>
        ) : apps.length === 0 ? (
          <div className="font-mono text-[15px] text-black opacity-60">{m.dock_empty()}</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-[16px]">
            {apps.map((app) => (
              <div
                key={app.id}
                className="flex flex-col items-center gap-[8px] p-[16px] border-[3px] border-black bg-white cursor-pointer transition-colors duration-[50ms] hover:bg-black hover:text-white group"
                onClick={() => handleLaunch(app)}
                onContextMenu={(e) => handleContextMenu(e, app)}
              >
                {/* Icon */}
                <div className="w-[64px] h-[64px] flex items-center justify-center overflow-hidden">
                  {app.iconDataUrl ? (
                    <img
                      src={app.iconDataUrl}
                      alt={app.name}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="w-full h-full bg-black flex items-center justify-center">
                      <span className="text-white font-headline text-[24px] uppercase">
                        {app.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>

                {/* Name */}
                <span className="font-body text-[12px] text-center leading-tight text-inherit break-all line-clamp-2">
                  {app.name}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Context menu */}
        {contextMenu && (
          <div
            className="fixed z-300 bg-white border-[3px] border-black shadow-lg"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="block w-full text-left font-body text-[13px] px-[12px] py-[8px] hover:bg-success hover:text-white cursor-pointer border-b-[1px] border-black transition-colors duration-[50ms]"
              onClick={handleEdit}
            >
              {m.dock_edit()}
            </button>
            <button
              className="block w-full text-left font-body text-[13px] px-[12px] py-[8px] hover:bg-error hover:text-white cursor-pointer transition-colors duration-[50ms]"
              onClick={handleUninstall}
            >
              {m.dock_uninstall()}
            </button>
          </div>
        )}

        {/* Edit modal */}
        <DockAppFormModal
          open={editApp !== null}
          title={m.dock_edit()}
          initialValues={editInitialValues}
          onSubmit={handleEditSubmit}
          onClose={() => setEditApp(null)}
        />
      </div>
    )
  }
})

// ---------------------------------------------------------------------------
// Inline types — kept in sync with preload/index.d.ts
// ---------------------------------------------------------------------------

interface DockWindowConfig {
  width: number
  height: number
  titleBarStyle: 'default' | 'hidden' | 'none'
  frame: boolean
}

interface DockApp {
  id: string
  name: string
  url: string
  iconDataUrl: string
  windowConfig: DockWindowConfig
  userAgent?: string
  createdAt: number
}
