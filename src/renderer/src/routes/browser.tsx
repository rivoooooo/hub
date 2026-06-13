import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import WindowSizeInput from '@renderer/components/WindowSizeInput'
import { m } from '../paraglide/messages.js'

interface BridgeMethod {
  name: string
  acceptParams: boolean
  code: boolean
  returnValue: string
}

interface BridgeConfig {
  enabled: boolean
  globalName: string
  methods: BridgeMethod[]
}

export const Route = createFileRoute('/browser')({
  component: BrowserControl
})

const inputCls =
  'font-mono text-[15px] leading-[1.5] py-[10px] px-[12px] border-[3px] border-black bg-surface-sunken text-black outline-none transition-colors duration-[50ms] hover:bg-[#e8e8e8] focus:border-[5px] focus:bg-white'

const btnPrimary =
  'font-body text-[14px] font-semibold uppercase tracking-[2px] py-[10px] px-[24px] border-[3px] border-black bg-black text-white cursor-pointer transition-colors duration-[50ms] hover:bg-white hover:text-black active:border-[5px] active:bg-black active:text-white'

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
  const [bridgeMethods, setBridgeMethods] = useState<BridgeMethod[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Refs to hold bridge config for immediate IPC saves from the toggle
  const bridgeGlobalNameRef = useRef(bridgeGlobalName)
  const bridgeMethodsRef = useRef(bridgeMethods)
  bridgeGlobalNameRef.current = bridgeGlobalName
  bridgeMethodsRef.current = bridgeMethods

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
      setBridgeMethods(c.methods)
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
      methods: bridgeMethodsRef.current
    })
  }, [])

  const handleBridgeGlobalNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setBridgeGlobalName(e.target.value)
  }, [])

  const handleBridgeMethodChange = useCallback(
    (index: number, field: keyof BridgeMethod, value: string | boolean) => {
      setBridgeMethods((prev) => {
        const next = [...prev]
        next[index] = { ...next[index], [field]: value }
        return next
      })
    },
    []
  )

  const handleAddMethod = useCallback(() => {
    setBridgeMethods((prev) => [
      ...prev,
      { name: '', acceptParams: false, code: false, returnValue: '' }
    ])
  }, [])

  const handleRemoveMethod = useCallback((index: number) => {
    setBridgeMethods((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleSaveBridge = useCallback(() => {
    const config: BridgeConfig = {
      enabled: bridgeEnabled,
      globalName: bridgeGlobalName,
      methods: bridgeMethods
    }
    void window.bridgeApi.setConfig(config)
  }, [bridgeEnabled, bridgeGlobalName, bridgeMethods])

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
        setBridgeMethods(config.methods)
      })
    }
    reader.readAsText(file)
    // Reset so the same file can be re-imported
    e.target.value = ''
  }, [])

  const titleBarLabels: Record<TitleBarMode, string> = {
    default: m.browser_titlebar_default(),
    hidden: m.browser_titlebar_hidden(),
    transparent: m.browser_titlebar_transparent()
  }

  return (
    <>
      <div className="pt-[120px] px-[24px]">
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
                className="peer w-[20px] h-[20px] border-[3px] border-black bg-white checked:bg-black cursor-pointer appearance-none transition-colors duration-[50ms]"
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
                      className="peer w-[20px] h-[20px] rounded-full border-[3px] border-black bg-white checked:bg-black cursor-pointer appearance-none transition-colors duration-[50ms]"
                      checked={checked}
                      onChange={() => handleTitleBarModeChange(mode)}
                    />
                    {/* Inner dot — only visible when checked */}
                    <span className="absolute inset-[5px] rounded-full bg-white pointer-events-none hidden peer-checked:block" />
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
                className="peer w-[20px] h-[20px] border-[3px] border-black bg-white checked:bg-black cursor-pointer appearance-none transition-colors duration-[50ms]"
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
          <p className="font-mono text-[13px] leading-[1.5] text-black opacity-60 pt-[4px]">
            {m.browser_toolbar_desc()}
          </p>
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

      {/* Right sidebar overlay */}
      {bridgeSidebar && (
        <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setBridgeSidebar(false)} />
      )}

      {/* Right sidebar */}
      {bridgeSidebar && (
        <div className="fixed top-0 right-0 z-50 h-full w-[420px] max-w-[90vw] bg-white border-l-[3px] border-black overflow-y-auto">
          <div className="p-[24px]">
            {/* Header */}
            <div className="flex items-center justify-between pb-[16px]">
              <span className="font-headline text-[14px] uppercase tracking-wider text-black">
                Bridge Configuration
              </span>
              <button
                className="font-body text-[20px] leading-none border-[2px] border-black w-[32px] h-[32px] flex items-center justify-center cursor-pointer hover:bg-black hover:text-white transition-colors duration-[50ms]"
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
                    className="peer w-[20px] h-[20px] border-[3px] border-black bg-white checked:bg-black cursor-pointer appearance-none transition-colors duration-[50ms]"
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
              <p className="font-mono text-[13px] leading-[1.5] text-black opacity-60 pt-[4px]">
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
                  <label
                    className="block font-headline text-[12px] uppercase tracking-wider text-black pb-[4px]"
                    htmlFor="bridge-name"
                  >
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

                {/* Methods */}
                <div>
                  <label className="block font-headline text-[12px] uppercase tracking-wider text-black pb-[4px]">
                    Methods
                  </label>
                  <div className="space-y-[8px]">
                    {bridgeMethods.map((method, i) => (
                      <div key={i} className="border-[2px] border-black p-[8px] space-y-[6px]">
                        <div className="flex gap-[6px] items-center">
                          <input
                            className={`flex-1 ${inputCls} text-[13px] py-[6px] px-[8px]`}
                            type="text"
                            placeholder="method name"
                            value={method.name}
                            onChange={(e) => handleBridgeMethodChange(i, 'name', e.target.value)}
                          />
                          <button
                            className="font-body text-[12px] uppercase tracking-[1px] border-[2px] border-black bg-error text-white px-[8px] py-[4px] cursor-pointer hover:bg-black hover:text-error"
                            onClick={() => handleRemoveMethod(i)}
                          >
                            X
                          </button>
                        </div>
                        <div className="flex gap-[12px] items-center">
                          <label className="flex items-center gap-[4px] cursor-pointer text-[12px] font-body text-black">
                            <input
                              type="checkbox"
                              className="w-[14px] h-[14px] border-[2px] border-black"
                              checked={method.acceptParams}
                              onChange={(e) =>
                                handleBridgeMethodChange(i, 'acceptParams', e.target.checked)
                              }
                            />
                            accept params
                          </label>
                          <label className="flex items-center gap-[4px] cursor-pointer text-[12px] font-body text-black">
                            <input
                              type="checkbox"
                              className="w-[14px] h-[14px] border-[2px] border-black"
                              checked={method.code}
                              onChange={(e) =>
                                handleBridgeMethodChange(i, 'code', e.target.checked)
                              }
                            />
                            code mode
                          </label>
                        </div>
                        <textarea
                          className={`w-full ${inputCls} text-[12px] py-[4px] px-[6px] resize-y min-h-[32px]`}
                          rows={2}
                          placeholder={method.code ? 'return args[0] + args[1]' : 'return value'}
                          value={method.returnValue}
                          onChange={(e) =>
                            handleBridgeMethodChange(i, 'returnValue', e.target.value)
                          }
                        />
                      </div>
                    ))}
                    <button
                      className={`w-full ${btnPrimary} text-[12px] py-[6px]`}
                      onClick={handleAddMethod}
                    >
                      + Add Method
                    </button>
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
    </>
  )
}
