import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import WindowSizeInput from '@renderer/components/WindowSizeInput'

export const Route = createFileRoute('/browser')({
  component: BrowserControl
})

const inputCls =
  'font-mono text-[15px] leading-[1.5] py-[10px] px-[12px] border-[3px] border-black bg-surface-sunken text-black outline-none transition-colors duration-[50ms] hover:bg-[#e8e8e8] focus:border-[5px] focus:bg-white'

const btnPrimary =
  'font-body text-[14px] font-semibold uppercase tracking-[2px] py-[10px] px-[24px] border-[3px] border-black bg-black text-white cursor-pointer transition-colors duration-[50ms] hover:bg-white hover:text-black active:border-[5px] active:bg-black active:text-white'

const btnDanger =
  'font-body text-[14px] font-semibold uppercase tracking-[2px] py-[10px] px-[24px] border-[3px] border-black bg-error text-white cursor-pointer transition-colors duration-[50ms] hover:bg-black hover:text-error'

function BrowserControl(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('https://example.com')
  const [width, setWidth] = useState(1024)
  const [height, setHeight] = useState(768)
  const [locked, setLocked] = useState(false)

  useEffect(() => {
    void window.browserApi.getState().then((s) => {
      setOpen(s.open)
      setUrl(s.url)
      setWidth(s.width)
      setHeight(s.height)
      setLocked(s.locked)
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

  return (
    <div className="w-full max-w-[520px] mt-[100px] mx-auto p-[24px] border-[3px] border-black bg-white">
      <h1 className="font-headline text-[32px] leading-[1.1] text-black pb-[24px]">
        BROWSER CONTROL
      </h1>

      {/* URL */}
      <div className="pb-[24px]">
        <label
          className="block font-headline text-[14px] uppercase tracking-wider text-black pb-[4px]"
          htmlFor="browser-url"
        >
          URL
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
            NAVIGATE
          </button>
        </div>
      </div>

      {/* Size */}
      <div className="pb-[24px]">
        <label className="block font-headline text-[14px] uppercase tracking-wider text-black pb-[4px]">
          Window Size
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
          <span className="font-body text-[16px] text-black">Lock window size</span>
        </label>
      </div>

      {/* Open / Close */}
      <div className="pb-[24px]">
        <button
          className={`block w-full ${open ? btnDanger : btnPrimary}`}
          onClick={handleToggleWindow}
        >
          {open ? 'CLOSE BROWSER WINDOW' : 'OPEN BROWSER WINDOW'}
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
            {open ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
        <div className="font-mono text-[15px] leading-[1.5] text-black pb-[4px] break-all">
          URL: {url}
        </div>
        <div className="font-mono text-[15px] leading-[1.5] text-black">
          Size: {width} × {height}
        </div>
      </div>
    </div>
  )
}
