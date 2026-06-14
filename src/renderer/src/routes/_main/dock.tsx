import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import type React from 'react'
import DockAppFormModal, { type DockFormValues } from '@renderer/components/DockAppFormModal'
import { m } from '../../paraglide/messages.js'
import { getLogger } from '../../logger'

// ---------------------------------------------------------------------------
// AppIcon — icon display for dock app cards
// ---------------------------------------------------------------------------

/**
 * Renders the best available icon for a dock app card:
 *   1. User-configured iconDataUrl (if set)
 *   2. Letter fallback (first letter of app name)
 */
function AppIcon({ app, isRunning }: { app: DockApp; isRunning: boolean }): React.JSX.Element {
  // 1. Configured icon
  if (app.iconDataUrl) {
    return <img src={app.iconDataUrl} alt={app.name} className="w-full h-full object-contain" />
  }

  // 2. Letter fallback
  return (
    <div
      className={
        'w-full h-full flex items-center justify-center ' + (isRunning ? 'bg-white' : 'bg-black')
      }
    >
      <span
        className={
          'font-headline text-[24px] uppercase ' + (isRunning ? 'text-black' : 'text-white')
        }
      >
        {app.name.charAt(0).toUpperCase()}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------

export const Route = createFileRoute('/_main/dock')({
  component: function DockDesktop(): React.JSX.Element {
    const navigate = useNavigate()
    const [apps, setApps] = useState<DockApp[]>([])
    const [loading, setLoading] = useState(true)
    const [runningIds, setRunningIds] = useState<string[]>([])
    const [contextMenu, setContextMenu] = useState<{
      x: number
      y: number
      app: DockApp
    } | null>(null)
    const [editApp, setEditApp] = useState<DockApp | null>(null)
    const [createMode, setCreateMode] = useState(false)

    const loadApps = useCallback(() => {
      void window.dockApi.getAll().then(
        (list) => {
          setApps(list)
          setLoading(false)
        },
        () => setLoading(false)
      )
    }, [])

    const loadRunning = useCallback(() => {
      void window.dockApi.getRunning().then(setRunningIds, () => {})
    }, [])

    useEffect(() => {
      loadApps()
      loadRunning()
    }, [loadApps, loadRunning])

    // Subscribe to running-state changes from the main process
    useEffect(() => {
      const unsub = window.dockApi.onRunningStateChange((ids) => {
        setRunningIds(ids)
      })
      return unsub
    }, [])

    // Close context menu on any click
    useEffect(() => {
      if (!contextMenu) return
      const handler = (): void => setContextMenu(null)
      document.addEventListener('click', handler)
      return () => document.removeEventListener('click', handler)
    }, [contextMenu])

    const handleLaunch = useCallback((app: DockApp) => {
      void window.dockApi.launch(app.id)
      // Optimistically mark as running — the IPC will confirm via state change
      setRunningIds((prev) => (prev.includes(app.id) ? prev : [...prev, app.id]))
    }, [])

    const handleStop = useCallback(() => {
      if (!contextMenu) return
      void window.dockApi.closeApp(contextMenu.app.id).then(
        () => {
          setContextMenu(null)
          loadRunning()
        },
        (err) => getLogger().error('Failed to close app', err)
      )
    }, [contextMenu, loadRunning])

    const handleContextMenu = useCallback((e: React.MouseEvent, app: DockApp) => {
      e.preventDefault()
      e.stopPropagation()
      setContextMenu({ x: e.clientX, y: e.clientY, app })
    }, [])

    const handleUninstall = useCallback(() => {
      if (!contextMenu) return
      // Stop the app before uninstalling
      void window.dockApi
        .closeApp(contextMenu.app.id)
        .then(() => {
          return window.dockApi.remove(contextMenu.app.id)
        })
        .then(
          () => {
            setContextMenu(null)
            loadApps()
            loadRunning()
          },
          (err) => getLogger().error('Failed to uninstall app', err)
        )
    }, [contextMenu, loadApps, loadRunning])

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

    const handleCreateSubmit = useCallback(
      async (values: DockFormValues) => {
        await window.dockApi.install(values)
        setCreateMode(false)
        loadApps()
      },
      [loadApps]
    )

    const modalOpen = createMode || editApp !== null
    const modalTitle = createMode ? m.dock_install_modal_title() : m.dock_edit()
    const modalInitialValues = createMode
      ? {
          name: '',
          url: '',
          iconDataUrl: '',
          windowConfig: { width: 1024, height: 768, titleBarStyle: 'hidden' as const, frame: true },
          userAgent: '',
          customCss: ''
        }
      : editApp
        ? {
            name: editApp.name,
            url: editApp.url,
            iconDataUrl: editApp.iconDataUrl,
            windowConfig: { ...editApp.windowConfig },
            userAgent: editApp.userAgent || '',
            customCss: editApp.customCss || ''
          }
        : {
            name: '',
            url: '',
            iconDataUrl: '',
            windowConfig: {
              width: 1024,
              height: 768,
              titleBarStyle: 'hidden' as const,
              frame: true
            },
            userAgent: '',
            customCss: ''
          }
    const handleModalClose = useCallback(() => {
      setCreateMode(false)
      setEditApp(null)
    }, [])
    const handleModalSubmit = createMode ? handleCreateSubmit : handleEditSubmit

    return (
      <div className="pt-[100px] px-[24px] pb-[40px] min-h-screen">
        <div className="flex items-center justify-between pb-[24px]">
          <h1 className="font-headline text-[48px] leading-none text-black">{m.dock_title()}</h1>
          <div className="flex items-center gap-[8px]">
            <button
              className="font-body text-[12px] uppercase tracking-[1px] border-[3px] border-black px-[8px] py-[4px] cursor-pointer hover:bg-black hover:text-white transition-colors duration-[50ms]"
              onClick={() => setCreateMode(true)}
            >
              {m.dock_new()}
            </button>
            <button
              className="font-body text-[12px] uppercase tracking-[1px] border-[3px] border-black px-[8px] py-[4px] cursor-pointer hover:bg-black hover:text-white transition-colors duration-[50ms]"
              onClick={() => navigate({ to: '/' })}
            >
              {m.back_to_home()}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="font-mono text-[15px] text-black opacity-60">Loading…</div>
        ) : apps.length === 0 ? (
          <div className="font-mono text-[15px] text-black opacity-60">{m.dock_empty()}</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-[16px]">
            {apps.map((app) => {
              const isRunning = runningIds.includes(app.id)
              return (
                <div
                  key={app.id}
                  className={
                    'flex flex-col items-center gap-[8px] p-[16px] border-[3px] cursor-pointer transition-colors duration-[50ms] group ' +
                    (isRunning
                      ? 'bg-black text-white border-white hover:bg-white hover:text-black hover:border-black'
                      : 'bg-white text-black border-black hover:bg-black hover:text-white hover:border-black')
                  }
                  onClick={() => handleLaunch(app)}
                  onContextMenu={(e) => handleContextMenu(e, app)}
                >
                  {/* Icon */}
                  <div className="w-[64px] h-[64px] flex items-center justify-center overflow-hidden">
                    <AppIcon app={app} isRunning={isRunning} />
                  </div>

                  {/* Name */}
                  <span className="font-body text-[12px] text-center leading-tight text-inherit break-all line-clamp-2">
                    {app.name}
                  </span>

                  {/* Running indicator */}
                  <span
                    className={
                      'font-mono text-[10px] uppercase tracking-[1px] ' +
                      (isRunning ? 'text-success' : 'text-inherit opacity-40')
                    }
                  >
                    {isRunning ? m.dock_running() : m.dock_stopped()}
                  </span>
                </div>
              )
            })}
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
            {/* Stop button — only show if running */}
            {runningIds.includes(contextMenu.app.id) && (
              <button
                className="block w-full text-left font-body text-[13px] px-[12px] py-[8px] hover:bg-warning hover:text-white cursor-pointer border-b-[1px] border-black transition-colors duration-[50ms]"
                onClick={handleStop}
              >
                {m.dock_stop()}
              </button>
            )}
            <button
              className="block w-full text-left font-body text-[13px] px-[12px] py-[8px] hover:bg-error hover:text-white cursor-pointer transition-colors duration-[50ms]"
              onClick={handleUninstall}
            >
              {m.dock_uninstall()}
            </button>
          </div>
        )}

        {/* Create / Edit modal */}
        <DockAppFormModal
          open={modalOpen}
          title={modalTitle}
          initialValues={modalInitialValues}
          onSubmit={handleModalSubmit}
          onClose={handleModalClose}
          submitLabel={createMode ? m.dock_install_confirm() : m.dock_save()}
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
  customCss?: string
  createdAt: number
}
