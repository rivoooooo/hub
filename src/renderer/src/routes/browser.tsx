import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import WindowSizeInput from '@renderer/components/WindowSizeInput'
import DockAppFormModal, { type DockFormValues } from '@renderer/components/DockAppFormModal'
import { m } from '../paraglide/messages.js'

// ---------------------------------------------------------------------------
// Bridge tree types — kept in sync with main/bridge-store.ts
// ---------------------------------------------------------------------------

interface ParamDef {
  name: string
  optional?: boolean
}

interface MatchCondition {
  paramName: string
  matchValue?: string
}

interface MatchEntry {
  conditions: MatchCondition[]
  returnValue?: string
}

interface BridgeFunctionConfig {
  acceptParams?: boolean
  mode?: 'static' | 'declarative' | 'custom'
  returnValue?: string
  matchValue?: string
  mockReturnValue?: string
  codeString?: string
  params?: ParamDef[]
  matchEntries?: MatchEntry[]
  fallbackReturnValue?: string
  responseMode?: 'async' | 'sync'
}

interface BridgeObjectConfig {
  returnValue?: string
}

interface BridgeNode {
  name: string
  type: 'object' | 'function'
  children?: BridgeNode[]
  functionConfig?: BridgeFunctionConfig
  objectConfig?: BridgeObjectConfig
}

interface BridgeConfig {
  enabled: boolean
  globalName: string
  tree: BridgeNode[]
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/browser')({
  component: BrowserControl
})

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const inputCls =
  'font-mono text-[15px] leading-[1.5] py-[10px] px-[12px] border-[3px] border-black bg-surface-sunken text-black outline-none transition-colors duration-[50ms] hover:bg-[#e8e8e8] focus:border-[5px] focus:bg-white'

const btnPrimary =
  'font-body text-[14px] font-semibold uppercase tracking-[2px] py-[10px] px-[24px] border-[3px] border-black bg-black text-white cursor-pointer transition-colors duration-[50ms] hover:bg-white hover:text-black active:border-[5px] active:bg-black active:text-white'

const btnSmall =
  'font-body text-[11px] uppercase tracking-[1px] border-[3px] border-black px-[6px] py-[3px] cursor-pointer transition-colors duration-[50ms]'

const btnDestructive =
  'font-body text-[11px] uppercase tracking-[1px] border-[3px] border-black bg-error text-white px-[6px] py-[3px] cursor-pointer transition-colors duration-[50ms] hover:bg-black hover:text-error'

const clsLabel = 'block font-headline text-[14px] uppercase tracking-wider text-black pb-[4px]'
const clsDesc = 'font-mono text-[13px] leading-[1.5] text-black opacity-60 pt-[4px]'

// ---------------------------------------------------------------------------
// Recursive Bridge Node Editor
// ---------------------------------------------------------------------------

interface NodeEditorProps {
  node: BridgeNode
  onChange: (updated: BridgeNode) => void
  onRemove: () => void
  depth: number
}

function blankNode(type: 'object' | 'function'): BridgeNode {
  return type === 'object'
    ? { name: '', type: 'object', objectConfig: {} }
    : { name: '', type: 'function', functionConfig: { mode: 'static' } }
}

function BridgeNodeEditor({ node, onChange, onRemove, depth }: NodeEditorProps): React.JSX.Element {
  const isFn = node.type === 'function'
  const fnCfg = node.functionConfig ?? {}
  const objCfg = node.objectConfig ?? {}
  const mode = fnCfg.mode ?? 'static'

  const update = useCallback(
    (patch: Partial<BridgeNode>) => onChange({ ...node, ...patch }),
    [node, onChange]
  )

  return (
    <div
      className="border-[2px] border-black p-[8px] space-y-[6px]"
      style={{ marginLeft: depth > 0 ? 12 : 0 }}
    >
      {/* Header row */}
      <div className="flex gap-[6px] items-center">
        <input
          className={`flex-1 ${inputCls} text-[13px] py-[6px] px-[8px]`}
          type="text"
          placeholder="node name"
          value={node.name}
          onChange={(e) => update({ name: e.target.value })}
        />

        {/* Type selector */}
        <select
          className={`${inputCls} text-[12px] py-[6px] px-[6px] w-[88px]`}
          value={node.type}
          onChange={(e) => {
            const newType = e.target.value as 'object' | 'function'
            if (newType === 'object') {
              onChange({
                ...node,
                type: 'object',
                children: node.children ?? [],
                objectConfig: objCfg,
                functionConfig: undefined
              })
            } else {
              onChange({
                ...node,
                type: 'function',
                functionConfig: fnCfg,
                objectConfig: undefined,
                children: undefined
              })
            }
          }}
        >
          <option value="function">function</option>
          <option value="object">object</option>
        </select>

        <button className={btnDestructive} onClick={onRemove}>
          X
        </button>
      </div>

      {/* Function-specific fields */}
      {isFn && (
        <div className="space-y-[6px]">
          <div className="flex gap-[12px] items-center">
            <label className="flex items-center gap-[8px] cursor-pointer select-none text-[12px] font-body text-black">
              <span className="relative w-[20px] h-[20px]">
                <input
                  type="checkbox"
                  className="peer w-[20px] h-[20px] border-[3px] border-black bg-white checked:bg-black cursor-pointer appearance-none transition-colors duration-[50ms] focus:border-[5px]"
                  checked={fnCfg.acceptParams ?? false}
                  onChange={(e) =>
                    update({ functionConfig: { ...fnCfg, acceptParams: e.target.checked } })
                  }
                />
                <svg
                  className="absolute inset-0 w-[20px] h-[20px] pointer-events-none hidden peer-checked:block"
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
              accept params
            </label>
          </div>

          {/* Mode selector */}
          <div className="flex gap-[6px] items-center">
            <span className="font-body text-[11px] uppercase tracking-[1px] text-black">mode:</span>
            <select
              className={`${inputCls} text-[11px] py-[4px] px-[4px] flex-1`}
              value={mode}
              onChange={(e) =>
                update({
                  functionConfig: { ...fnCfg, mode: e.target.value as BridgeFunctionConfig['mode'] }
                })
              }
            >
              <option value="static">static</option>
              <option value="declarative">declarative</option>
              <option value="custom">custom</option>
            </select>
          </div>

          {/* Sync toggle — static & declarative modes */}
          {(mode === 'static' || mode === 'declarative') && (
            <div className="flex items-center gap-[6px] pt-[4px]">
              <span className="relative w-[20px] h-[20px]">
                <input
                  id="sync-toggle"
                  type="checkbox"
                  className="peer w-[20px] h-[20px] border-[3px] border-black bg-white checked:bg-black cursor-pointer appearance-none transition-colors duration-[50ms] focus:border-[5px]"
                  checked={fnCfg.responseMode === 'sync'}
                  onChange={(e) =>
                    update({
                      functionConfig: {
                        ...fnCfg,
                        responseMode: e.target.checked ? 'sync' : 'async'
                      }
                    })
                  }
                />
                <svg
                  className="absolute inset-0 w-[20px] h-[20px] pointer-events-none hidden peer-checked:block"
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
              <label
                htmlFor="sync-toggle"
                className="font-body text-[11px] uppercase tracking-[1px] text-black cursor-pointer select-none"
              >
                sync (no IPC)
              </label>
            </div>
          )}

          {/* Static / Declarative: returnValue */}
          {(mode === 'static' || mode === 'declarative') && (
            <textarea
              className={`w-full ${inputCls} text-[12px] py-[4px] px-[6px] resize-y min-h-[32px]`}
              rows={2}
              placeholder={mode === 'static' ? 'return value (JSON)' : 'mock return value (JSON)'}
              value={mode === 'static' ? (fnCfg.returnValue ?? '') : (fnCfg.mockReturnValue ?? '')}
              onChange={(e) =>
                update({
                  functionConfig:
                    mode === 'static'
                      ? { ...fnCfg, returnValue: e.target.value }
                      : { ...fnCfg, mockReturnValue: e.target.value }
                })
              }
            />
          )}

          {/* Declarative: parameter signature + match rules + fallback */}
          {mode === 'declarative' && (
            <div className="space-y-[8px]">
              {/* ── Parameter Signature ── */}
              <div className="space-y-[4px]">
                <div className="flex items-center justify-between">
                  <span className="font-body text-[11px] uppercase tracking-[1px] text-black">
                    Params (signature)
                  </span>
                  <button
                    className={`${btnSmall} bg-white text-black hover:bg-black hover:text-white text-[10px]`}
                    onClick={() =>
                      update({
                        functionConfig: {
                          ...fnCfg,
                          params: [...(fnCfg.params ?? []), { name: '', optional: false }]
                        }
                      })
                    }
                  >
                    + Add Param
                  </button>
                </div>
                {(fnCfg.params ?? []).map((param, pi) => (
                  <div key={pi} className="flex gap-[4px] items-center">
                    <input
                      className={`flex-1 ${inputCls} text-[11px] py-[3px] px-[4px]`}
                      type="text"
                      placeholder="name"
                      value={param.name}
                      onChange={(e) => {
                        const next = [...(fnCfg.params ?? [])]
                        next[pi] = { ...next[pi], name: e.target.value }
                        update({ functionConfig: { ...fnCfg, params: next } })
                      }}
                    />
                    <label className="flex items-center gap-[4px] cursor-pointer text-[10px] font-body text-black whitespace-nowrap select-none">
                      <span className="relative w-[20px] h-[20px]">
                        <input
                          type="checkbox"
                          className="peer w-[20px] h-[20px] border-[3px] border-black bg-white checked:bg-black cursor-pointer appearance-none transition-colors duration-[50ms] focus:border-[5px]"
                          checked={param.optional ?? false}
                          onChange={(e) => {
                            const next = [...(fnCfg.params ?? [])]
                            next[pi] = { ...next[pi], optional: e.target.checked }
                            update({ functionConfig: { ...fnCfg, params: next } })
                          }}
                        />
                        <svg
                          className="absolute inset-0 w-[20px] h-[20px] pointer-events-none hidden peer-checked:block"
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
                      opt
                    </label>
                    <button
                      className={btnDestructive}
                      onClick={() => {
                        const next = (fnCfg.params ?? []).filter((_, j) => j !== pi)
                        update({
                          functionConfig: { ...fnCfg, params: next.length ? next : undefined }
                        })
                      }}
                    >
                      X
                    </button>
                  </div>
                ))}
              </div>

              {/* ── Match Rules ── */}
              <div className="space-y-[4px]">
                <div className="flex items-center justify-between">
                  <span className="font-body text-[11px] uppercase tracking-[1px] text-black">
                    Match Rules
                  </span>
                  <button
                    className={`${btnSmall} bg-white text-black hover:bg-black hover:text-white text-[10px]`}
                    onClick={() =>
                      update({
                        functionConfig: {
                          ...fnCfg,
                          matchEntries: [
                            ...(fnCfg.matchEntries ?? []),
                            { conditions: [{ paramName: '', matchValue: '' }], returnValue: '' }
                          ]
                        }
                      })
                    }
                  >
                    + Add Rule
                  </button>
                </div>
                {(fnCfg.matchEntries ?? []).map((entry, ei) => (
                  <div key={ei} className="border-[2px] border-black p-[8px] space-y-[6px]">
                    {/* Conditions — the visible, main part of a rule */}
                    <div className="space-y-[4px]">
                      <span className="font-body text-[11px] uppercase tracking-[1px] text-black">
                        WHEN
                      </span>
                      {entry.conditions.map((cond, ci) => (
                        <div key={ci} className="flex gap-[4px] items-center ml-[12px]">
                          <span className="font-mono text-[11px] text-black/60">args[</span>
                          <select
                            className={`${inputCls} text-[11px] py-[2px] px-[3px] w-[70px]`}
                            value={cond.paramName}
                            onChange={(e) => {
                              const nextEntries = [...(fnCfg.matchEntries ?? [])]
                              const entryCopy = {
                                ...nextEntries[ei],
                                conditions: [...nextEntries[ei].conditions]
                              }
                              entryCopy.conditions[ci] = {
                                ...entryCopy.conditions[ci],
                                paramName: e.target.value
                              }
                              nextEntries[ei] = entryCopy
                              update({ functionConfig: { ...fnCfg, matchEntries: nextEntries } })
                            }}
                          >
                            <option value="">?</option>
                            {(fnCfg.params ?? []).map((p) => (
                              <option key={p.name} value={p.name} disabled={!p.name}>
                                {p.name || '(unnamed)'}
                              </option>
                            ))}
                          </select>
                          <span className="font-mono text-[11px] text-black/60">]</span>
                          <span className="font-body text-[11px] text-black">=</span>
                          <input
                            className={`${inputCls} text-[11px] py-[2px] px-[3px] w-[70px] flex-1`}
                            type="text"
                            placeholder="value"
                            value={cond.matchValue ?? ''}
                            onChange={(e) => {
                              const nextEntries = [...(fnCfg.matchEntries ?? [])]
                              const entryCopy = {
                                ...nextEntries[ei],
                                conditions: [...nextEntries[ei].conditions]
                              }
                              entryCopy.conditions[ci] = {
                                ...entryCopy.conditions[ci],
                                matchValue: e.target.value
                              }
                              nextEntries[ei] = entryCopy
                              update({ functionConfig: { ...fnCfg, matchEntries: nextEntries } })
                            }}
                          />
                          <button
                            className={btnDestructive}
                            onClick={() => {
                              const nextEntries = [...(fnCfg.matchEntries ?? [])]
                              const entryCopy = {
                                ...nextEntries[ei],
                                conditions: nextEntries[ei].conditions.filter((_, j) => j !== ci)
                              }
                              nextEntries[ei] = entryCopy
                              update({ functionConfig: { ...fnCfg, matchEntries: nextEntries } })
                            }}
                          >
                            X
                          </button>
                        </div>
                      ))}
                      <button
                        className={`${btnSmall} bg-white text-black hover:bg-black hover:text-white`}
                        onClick={() => {
                          const nextEntries = [...(fnCfg.matchEntries ?? [])]
                          const entryCopy = {
                            ...entry,
                            conditions: [...entry.conditions, { paramName: '', matchValue: '' }]
                          }
                          nextEntries[ei] = entryCopy
                          update({ functionConfig: { ...fnCfg, matchEntries: nextEntries } })
                        }}
                      >
                        + AND
                      </button>
                    </div>

                    {/* THEN → return value */}
                    <div className="pt-[4px] border-t-[1px] border-black/20">
                      <span className="font-body text-[11px] uppercase tracking-[1px] text-black block pb-[4px]">
                        THEN →
                      </span>
                      <textarea
                        className={`w-full ${inputCls} text-[12px] py-[4px] px-[6px] resize-y min-h-[28px]`}
                        rows={1}
                        placeholder="return value (JSON)"
                        value={entry.returnValue ?? ''}
                        onChange={(e) => {
                          const nextEntries = [...(fnCfg.matchEntries ?? [])]
                          nextEntries[ei] = { ...nextEntries[ei], returnValue: e.target.value }
                          update({ functionConfig: { ...fnCfg, matchEntries: nextEntries } })
                        }}
                      />
                    </div>

                    {/* Delete rule */}
                    <button
                      className={btnDestructive}
                      onClick={() => {
                        const nextEntries = (fnCfg.matchEntries ?? []).filter((_, j) => j !== ei)
                        update({
                          functionConfig: {
                            ...fnCfg,
                            matchEntries: nextEntries.length ? nextEntries : undefined
                          }
                        })
                      }}
                    >
                      Delete Rule
                    </button>
                  </div>
                ))}
              </div>

              {/* ── Fallback return value ── */}
              <textarea
                className={`w-full ${inputCls} text-[12px] py-[4px] px-[6px] resize-y min-h-[32px]`}
                rows={2}
                placeholder="fallback return value (JSON) — used when no Match Rule applies"
                value={fnCfg.fallbackReturnValue ?? ''}
                onChange={(e) =>
                  update({ functionConfig: { ...fnCfg, fallbackReturnValue: e.target.value } })
                }
              />
            </div>
          )}

          {/* Custom: codeString */}
          {mode === 'custom' && (
            <textarea
              className={`w-full ${inputCls} text-[12px] py-[4px] px-[6px] resize-y min-h-[48px] font-mono`}
              rows={3}
              placeholder={'(args) => { const [name, value] = args; return { name }; }'}
              value={fnCfg.codeString ?? ''}
              onChange={(e) => update({ functionConfig: { ...fnCfg, codeString: e.target.value } })}
            />
          )}
        </div>
      )}

      {/* Object-specific fields */}
      {!isFn && (
        <div className="space-y-[6px]">
          <textarea
            className={`w-full ${inputCls} text-[12px] py-[4px] px-[6px] resize-y min-h-[32px]`}
            rows={2}
            placeholder="mock return value (JSON, optional)"
            value={objCfg.returnValue ?? ''}
            onChange={(e) => update({ objectConfig: { ...objCfg, returnValue: e.target.value } })}
          />
        </div>
      )}

      {/* Children (only for object nodes) */}
      {!isFn && (
        <div className="space-y-[4px]">
          {(node.children ?? []).map((child, i) => (
            <BridgeNodeEditor
              key={i}
              node={child}
              depth={depth + 1}
              onChange={(updated) => {
                const children = [...(node.children ?? [])]
                children[i] = updated
                update({ children })
              }}
              onRemove={() => {
                const children = [...(node.children ?? [])]
                children.splice(i, 1)
                update({ children })
              }}
            />
          ))}
          <button
            className={`${btnSmall} bg-white text-black hover:bg-black hover:text-white`}
            onClick={() => {
              const children = [...(node.children ?? []), blankNode('function')]
              update({ children })
            }}
          >
            + Add Child
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function BrowserControl(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('https://example.com')
  const [width, setWidth] = useState(1024)
  const [height, setHeight] = useState(768)
  const [locked, setLocked] = useState(false)
  const titleBarModes = ['default', 'hidden', 'transparent'] as const
  type TitleBarMode = (typeof titleBarModes)[number]

  const [titleBarMode, setTitleBarMode] = useState<TitleBarMode>('hidden')
  const [toolbarVisible, setToolbarVisible] = useState(false)
  const [bridgeSidebar, setBridgeSidebar] = useState(false)

  // Bridge state
  const [bridgeEnabled, setBridgeEnabled] = useState(false)
  const [bridgeGlobalName, setBridgeGlobalName] = useState('bridge')
  const [bridgeTree, setBridgeTree] = useState<BridgeNode[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Refs to hold bridge config for immediate IPC saves from the toggle
  const bridgeGlobalNameRef = useRef(bridgeGlobalName)
  const bridgeTreeRef = useRef(bridgeTree)
  bridgeGlobalNameRef.current = bridgeGlobalName
  bridgeTreeRef.current = bridgeTree

  useEffect(() => {
    void window.browserApi.getState().then((s) => {
      setOpen(s.open)
      setUrl(s.url)
      setWidth(s.width)
      setHeight(s.height)
      setLocked(s.locked)
    })

    void window.settingsApi.get().then((s) => {
      setTitleBarMode(s.browserTitleBarMode as TitleBarMode)
      setToolbarVisible(s.toolbarVisible)
    })

    // Load bridge config
    void window.bridgeApi.getConfig().then((c) => {
      setBridgeEnabled(c.enabled)
      setBridgeGlobalName(c.globalName)
      setBridgeTree(c.tree ?? [])
    })

    const unsubscribe = window.browserApi.onStateChange((s) => {
      setOpen(s.open)
      setUrl(s.url)
      setWidth(s.width)
      setHeight(s.height)
      setLocked(s.locked)
    })

    return unsubscribe
  }, [])

  const handleToggleWindow = useCallback(() => {
    if (open) {
      void window.browserApi.close()
    } else {
      void window.browserApi.open()
    }
  }, [open])

  const handleNavigate = useCallback(() => {
    void window.browserApi.navigate(url)
  }, [url])

  const handleResize = useCallback((w: number, h: number) => {
    void window.browserApi.resize(w, h)
  }, [])

  const handleLockChange = useCallback((checked: boolean) => {
    setLocked(checked)
    void window.browserApi.setLock(checked)
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleNavigate()
      }
    },
    [handleNavigate]
  )

  const handleTitleBarModeChange = useCallback((mode: TitleBarMode) => {
    setTitleBarMode(mode)
    void window.settingsApi.set('browserTitleBarMode', mode)
  }, [])

  const handleToolbarToggle = useCallback((checked: boolean) => {
    setToolbarVisible(checked)
    void window.settingsApi.set('toolbarVisible', checked)
  }, [])

  // --- Bridge handlers ---

  const handleBridgeToggle = useCallback((checked: boolean) => {
    setBridgeEnabled(checked)
    // Persist immediately so the browser page stops receiving injections
    void window.bridgeApi.setConfig({
      enabled: checked,
      globalName: bridgeGlobalNameRef.current,
      tree: bridgeTreeRef.current
    })
  }, [])

  const handleBridgeGlobalNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setBridgeGlobalName(e.target.value)
  }, [])

  const handleSaveBridge = useCallback(() => {
    const config: BridgeConfig = {
      enabled: bridgeEnabled,
      globalName: bridgeGlobalName,
      tree: bridgeTree
    }
    void window.bridgeApi.setConfig(config)
  }, [bridgeEnabled, bridgeGlobalName, bridgeTree])

  const handleExportBridge = useCallback(() => {
    void window.bridgeApi.exportConfig().then((json) => {
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'bridge-config.json'
      a.click()
      URL.revokeObjectURL(url)
    })
  }, [])

  const handleImportBridge = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const json = reader.result as string
      void window.bridgeApi.importConfig(json).then((config) => {
        setBridgeEnabled(config.enabled)
        setBridgeGlobalName(config.globalName)
        setBridgeTree(config.tree ?? [])
      })
    }
    reader.readAsText(file)
    // Reset so the same file can be re-imported
    e.target.value = ''
  }, [])

  // --------------------------------------------------
  // Dock install modal
  // --------------------------------------------------
  // ── Install to DOCK modal ──
  const [showInstallModal, setShowInstallModal] = useState(false)
  const installInitialValues = useMemo<DockFormValues>(
    () => ({
      name: url.replace(/^https?:\/\//, '').split('/')[0] || url,
      iconDataUrl: '',
      windowConfig: {
        width,
        height,
        titleBarStyle: 'hidden',
        frame: true
      },
      userAgent: ''
    }),
    [url, width, height]
  )

  const handleInstallSubmit = useCallback(
    async (values: DockFormValues) => {
      await window.dockApi.install({
        name: values.name || url,
        url,
        iconDataUrl: values.iconDataUrl || '',
        windowConfig: values.windowConfig,
        userAgent: values.userAgent || undefined
      })
      setShowInstallModal(false)
    },
    [url]
  )

  const titleBarLabels: Record<TitleBarMode, string> = {
    default: m.browser_titlebar_default(),
    hidden: m.browser_titlebar_hidden(),
    transparent: m.browser_titlebar_transparent()
  }

  return (
    <div className="flex min-h-screen">
      <div className="flex-1 pt-[120px] px-[24px] pb-[40px]">
        <div className="flex items-center justify-between pb-[16px]">
          <h1 className="font-headline text-[64px] leading-none text-black">{m.browser_title()}</h1>
          <button
            className={`font-body font-semibold text-[14px] uppercase tracking-[2px] py-[10px] px-[24px] border-[3px] border-black cursor-pointer transition-colors duration-[50ms] active:border-[5px] ${open ? 'bg-error text-white hover:bg-black hover:text-error' : 'bg-black text-white hover:bg-white hover:text-black'}`}
            onClick={handleToggleWindow}
          >
            {open ? m.browser_close_btn() : m.browser_open_btn()}
          </button>
        </div>

        {/* URL */}
        <div className="pb-[24px]">
          <label
            className="block font-headline text-[14px] uppercase tracking-wider text-black pb-[4px]"
            htmlFor="browser-url"
          >
            {m.browser_url_label()}
          </label>
          <div className="flex gap-[8px] items-center">
            <input
              id="browser-url"
              className={`flex-1 ${inputCls}`}
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button className={btnPrimary} onClick={handleNavigate}>
              {m.browser_navigate_btn()}
            </button>
            <button
              className={`${btnPrimary} text-[12px]`}
              onClick={() => setShowInstallModal(true)}
              title={m.dock_install_modal_title()}
            >
              {m.dock_install_btn()}
            </button>
          </div>
        </div>

        {/* Size */}
        <div className="pb-[24px]">
          <label className="block font-headline text-[14px] uppercase tracking-wider text-black pb-[4px]">
            {m.browser_window_size_label()}
          </label>
          <WindowSizeInput
            width={width}
            height={height}
            onWidthChange={setWidth}
            onHeightChange={setHeight}
            onApply={handleResize}
          />
        </div>

        {/* Lock */}
        <div className="pb-[24px]">
          <label className="flex items-center gap-[8px] cursor-pointer select-none">
            <span className="relative w-[20px] h-[20px]">
              <input
                type="checkbox"
                className="peer w-[20px] h-[20px] border-[3px] border-black bg-white checked:bg-black cursor-pointer appearance-none transition-colors duration-[50ms] focus:border-[5px]"
                checked={locked}
                onChange={(e) => handleLockChange(e.target.checked)}
              />
              {/* White checkmark, 3px stroke — only visible when checked */}
              <svg
                className="absolute inset-0 w-[20px] h-[20px] pointer-events-none hidden peer-checked:block"
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
            <span className="font-body text-[16px] text-black">{m.browser_lock_label()}</span>
          </label>
        </div>

        {/* Title bar mode */}
        <div className="pb-[24px]">
          <label className="block font-headline text-[14px] uppercase tracking-wider text-black pb-[8px]">
            {m.browser_title_bar_label()}
          </label>
          <div className="flex flex-col gap-[8px]">
            {titleBarModes.map((mode) => {
              const checked = titleBarMode === mode
              return (
                <label
                  key={mode}
                  className="flex items-center gap-[8px] cursor-pointer select-none"
                >
                  <span className="relative w-[20px] h-[20px]">
                    <input
                      type="radio"
                      name="titleBarMode"
                      className="peer w-[20px] h-[20px] rounded-full border-[3px] border-black bg-white cursor-pointer appearance-none transition-colors duration-[50ms]"
                      checked={checked}
                      onChange={() => handleTitleBarModeChange(mode)}
                    />
                    {/* Inner dot — 10px black dot only when checked */}
                    <span className="absolute inset-[5px] rounded-full bg-black pointer-events-none hidden peer-checked:block" />
                  </span>
                  <span className="font-body text-[16px] text-black">{titleBarLabels[mode]}</span>
                </label>
              )
            })}
          </div>
        </div>

        {/* Toolbar */}
        <div className="pb-[24px]">
          <label className="flex items-center gap-[8px] cursor-pointer select-none">
            <span className="relative w-[20px] h-[20px]">
              <input
                type="checkbox"
                className="peer w-[20px] h-[20px] border-[3px] border-black bg-white checked:bg-black cursor-pointer appearance-none transition-colors duration-[50ms] focus:border-[5px]"
                checked={toolbarVisible}
                onChange={(e) => handleToolbarToggle(e.target.checked)}
              />
              <svg
                className="absolute inset-0 w-[20px] h-[20px] pointer-events-none hidden peer-checked:block"
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
            <span className="font-body text-[16px] text-black">{m.browser_toolbar_label()}</span>
          </label>
          <p className={`${clsDesc}`}>{m.browser_toolbar_desc()}</p>
        </div>

        {/* Bridge trigger */}
        <div className="pb-[24px]">
          <button
            className={`w-full ${btnPrimary} text-[12px] py-[8px]`}
            onClick={() => setBridgeSidebar(true)}
          >
            {bridgeEnabled ? 'Bridge (ON) →' : 'Bridge (OFF) →'}
          </button>
        </div>

        {/* Status bar */}
        <div className="pt-[16px] border-t-[3px] border-black">
          <div className="flex items-center gap-[8px] pb-[8px]">
            <span
              className="inline-block w-[12px] h-[12px] border-[3px] border-black bg-black data-[open=true]:bg-success"
              data-open={open ? 'true' : undefined}
            />
            <span className="font-mono text-[15px] text-black font-semibold">
              {open ? m.browser_status_online() : m.browser_status_offline()}
            </span>
          </div>
          <div className="font-mono text-[15px] leading-[1.5] text-black pb-[4px] break-all">
            {m.browser_status_url({ url })}
          </div>
          <div className="font-mono text-[15px] leading-[1.5] text-black">
            {m.browser_status_size({ width, height })}
          </div>
        </div>
      </div>

      {/* Right sidebar — natural flex flow */}
      {bridgeSidebar && (
        <div className="w-[480px] max-w-[92vw] h-screen bg-white border-l-[3px] border-black overflow-y-auto sticky top-0">
          <div className="px-[24px] pt-16">
            {/* Header */}
            <div className="flex items-center justify-between pb-[16px]">
              <span className="font-headline text-[14px] uppercase tracking-wider text-black">
                Bridge Configuration
              </span>
              <button
                className="font-body text-[20px] leading-none border-[3px] border-black w-[32px] h-[32px] flex items-center justify-center cursor-pointer hover:bg-black hover:text-white transition-colors duration-[50ms]"
                onClick={() => setBridgeSidebar(false)}
                title="Close"
              >
                ×
              </button>
            </div>

            {/* Enable toggle */}
            <div className="pb-[20px]">
              <label className="flex items-center gap-[8px] cursor-pointer select-none">
                <span className="relative w-[20px] h-[20px]">
                  <input
                    type="checkbox"
                    className="peer w-[20px] h-[20px] border-[3px] border-black bg-white checked:bg-black cursor-pointer appearance-none transition-colors duration-[50ms] focus:border-[5px]"
                    checked={bridgeEnabled}
                    onChange={(e) => handleBridgeToggle(e.target.checked)}
                  />
                  <svg
                    className="absolute inset-0 w-[20px] h-[20px] pointer-events-none hidden peer-checked:block"
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
                <span className="font-body text-[16px] font-semibold text-black">
                  Enable Bridge
                </span>
              </label>
              <p className={clsDesc}>
                {bridgeEnabled
                  ? 'Bridge is active — window.' +
                    bridgeGlobalName +
                    ' is available on target pages.'
                  : 'Bridge is disabled. Toggle to inject a global bridge object.'}
              </p>
            </div>

            {bridgeEnabled && (
              <div className="space-y-[16px]">
                {/* Global name */}
                <div>
                  <label className={clsLabel} htmlFor="bridge-name">
                    Global Key
                  </label>
                  <input
                    id="bridge-name"
                    className={`w-full ${inputCls} text-[13px]`}
                    type="text"
                    value={bridgeGlobalName}
                    onChange={handleBridgeGlobalNameChange}
                  />
                </div>

                {/* Tree editor */}
                <div>
                  <label className={clsLabel}>Tree Nodes</label>
                  <div className="space-y-[8px]">
                    {(bridgeTree ?? []).map((node, i) => (
                      <BridgeNodeEditor
                        key={i}
                        node={node}
                        depth={0}
                        onChange={(updated) => {
                          const next = [...bridgeTree]
                          next[i] = updated
                          setBridgeTree(next)
                        }}
                        onRemove={() => {
                          setBridgeTree((prev) => prev.filter((_, j) => j !== i))
                        }}
                      />
                    ))}
                    <div className="flex gap-[4px]">
                      <button
                        className={`${btnSmall} bg-white text-black hover:bg-black hover:text-white`}
                        onClick={() => setBridgeTree((prev) => [...prev, blankNode('function')])}
                      >
                        + Add Function
                      </button>
                      <button
                        className={`${btnSmall} bg-white text-black hover:bg-black hover:text-white`}
                        onClick={() => setBridgeTree((prev) => [...prev, blankNode('object')])}
                      >
                        + Add Object
                      </button>
                    </div>
                  </div>
                </div>

                {/* Import / Export / Save */}
                <div className="flex flex-col gap-[8px] pt-[4px]">
                  <button
                    className={`w-full ${btnPrimary} text-[12px] py-[8px]`}
                    onClick={handleSaveBridge}
                  >
                    Save Bridge
                  </button>
                  <div className="flex gap-[8px]">
                    <button
                      className={`flex-1 ${btnPrimary} text-[12px] py-[8px]`}
                      onClick={handleExportBridge}
                    >
                      Export JSON
                    </button>
                    <button
                      className={`flex-1 ${btnPrimary} text-[12px] py-[8px]`}
                      onClick={handleImportBridge}
                    >
                      Import JSON
                    </button>
                  </div>
                </div>
                {/* Hidden file input for import */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            )}
          </div>
        </div>
      )}

      <DockAppFormModal
        open={showInstallModal}
        title={m.dock_install_modal_title()}
        initialValues={installInitialValues}
        onSubmit={handleInstallSubmit}
        onClose={() => setShowInstallModal(false)}
      />
    </div>
  )
}
