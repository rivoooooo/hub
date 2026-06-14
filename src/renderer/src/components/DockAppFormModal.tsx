import { useCallback, useEffect, useState } from 'react'
import { m } from '../paraglide/messages.js'

// ---------------------------------------------------------------------------
// Types (kept in sync with preload/index.d.ts)
// ---------------------------------------------------------------------------

export interface DockWindowConfig {
  width: number
  height: number
  titleBarStyle: 'default' | 'hidden' | 'none'
  frame: boolean
}

export interface DockApp {
  id: string
  name: string
  url: string
  iconDataUrl: string
  windowConfig: DockWindowConfig
  userAgent?: string
  createdAt: number
}

export interface DockFormValues {
  name: string
  iconDataUrl: string
  windowConfig: DockWindowConfig
  userAgent: string
  /** JSON with keys: common, isMacos, isWindows, isLinux */
  customCss: string
}

interface DockAppFormModalProps {
  open: boolean
  title: string
  submitLabel?: string
  initialValues: DockFormValues
  /** Called when the user confirms. Return a promise to keep the UI busy. */
  onSubmit: (values: DockFormValues) => Promise<void>
  onClose: () => void
}

const inputCls =
  'font-body text-[15px] border-[3px] border-black px-[8px] py-[6px] bg-white text-black outline-none focus:border-[5px] transition-all duration-[50ms]'

const btnSmall =
  'font-body text-[13px] font-semibold uppercase tracking-[1px] border-[3px] border-black px-[8px] py-[6px] cursor-pointer transition-colors duration-[50ms]'

const btnPrimary =
  'font-body text-[14px] font-semibold uppercase tracking-[2px] border-[3px] border-black bg-black text-white px-[16px] py-[10px] cursor-pointer hover:bg-white hover:text-black transition-colors duration-[50ms] active:border-[5px]'

export default function DockAppFormModal({
  open,
  title,
  submitLabel,
  initialValues,
  onSubmit,
  onClose
}: DockAppFormModalProps): React.JSX.Element | null {
  const [name, setName] = useState(initialValues.name)
  const [iconUrl, setIconUrl] = useState(initialValues.iconDataUrl)
  const [width, setWidth] = useState(initialValues.windowConfig.width)
  const [height, setHeight] = useState(initialValues.windowConfig.height)
  const [titleBarStyle, setTitleBarStyle] = useState(initialValues.windowConfig.titleBarStyle)
  const [frame, setFrame] = useState(initialValues.windowConfig.frame)
  const [userAgent, setUserAgent] = useState(initialValues.userAgent)
  const [cssCommon, setCssCommon] = useState('')
  const [cssMacos, setCssMacos] = useState('')
  const [cssWindows, setCssWindows] = useState('')
  const [cssLinux, setCssLinux] = useState('')
  const [customCssEnabled, setCustomCssEnabled] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Sync form when initialValues change (e.g. editing a different app)
  useEffect(() => {
    setName(initialValues.name)
    setIconUrl(initialValues.iconDataUrl)
    setWidth(initialValues.windowConfig.width)
    setHeight(initialValues.windowConfig.height)
    setTitleBarStyle(initialValues.windowConfig.titleBarStyle)
    setFrame(initialValues.windowConfig.frame)
    setUserAgent(initialValues.userAgent)
    try {
      const parsed = JSON.parse(initialValues.customCss || '{}')
      setCssCommon(parsed.common || '')
      setCssMacos(parsed.isMacos || '')
      setCssWindows(parsed.isWindows || '')
      setCssLinux(parsed.isLinux || '')
      setCustomCssEnabled(!!(parsed.common || parsed.isMacos || parsed.isWindows || parsed.isLinux))
    } catch {
      setCssCommon('')
      setCssMacos('')
      setCssWindows('')
      setCssLinux('')
      setCustomCssEnabled(false)
    }
  }, [initialValues])

  const handleSubmit = useCallback(() => {
    setSubmitting(true)
    void onSubmit({
      name,
      iconDataUrl: iconUrl,
      windowConfig: { width, height, titleBarStyle, frame },
      userAgent,
      customCss: JSON.stringify({
        common: cssCommon,
        isMacos: cssMacos,
        isWindows: cssWindows,
        isLinux: cssLinux
      })
    }).finally(() => setSubmitting(false))
  }, [
    name,
    iconUrl,
    width,
    height,
    titleBarStyle,
    frame,
    userAgent,
    cssCommon,
    cssMacos,
    cssWindows,
    cssLinux,
    onSubmit
  ])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-200 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white border-[3px] border-black p-[24px] w-[480px] max-w-[92vw] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-[16px]">
          <span className="font-headline text-[14px] uppercase tracking-wider text-black">
            {title}
          </span>
          <button
            className="font-body text-[20px] leading-none border-[3px] border-black w-[32px] h-[32px] flex items-center justify-center cursor-pointer hover:bg-black hover:text-white transition-colors duration-[50ms]"
            onClick={onClose}
            disabled={submitting}
          >
            ×
          </button>
        </div>

        {/* App Name */}
        <div className="pb-[12px]">
          <label className="block font-headline text-[12px] uppercase tracking-wider text-black pb-[4px]">
            {m.dock_install_name()}
          </label>
          <input
            className={`w-full ${inputCls}`}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My App"
            disabled={submitting}
          />
        </div>

        {/* Icon URL */}
        <div className="pb-[12px]">
          <label className="block font-headline text-[12px] uppercase tracking-wider text-black pb-[4px]">
            {m.dock_install_icon()}
          </label>
          <div className="flex gap-[6px] items-start">
            <input
              className={`flex-1 ${inputCls}`}
              type="text"
              value={iconUrl}
              onChange={(e) => setIconUrl(e.target.value)}
              placeholder="https://example.com/favicon.ico"
              disabled={submitting}
            />
            <button
              type="button"
              className={`${btnSmall} whitespace-nowrap ${submitting ? 'opacity-50 pointer-events-none' : ''}`}
              onClick={() => document.getElementById('icon-file-input')?.click()}
              disabled={submitting}
            >
              {m.dock_install_browse()}
            </button>
            <input
              id="icon-file-input"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = () => {
                  if (typeof reader.result === 'string') setIconUrl(reader.result)
                }
                reader.readAsDataURL(file)
                // Reset so the same file can be re-selected
                e.target.value = ''
              }}
            />
          </div>
          {iconUrl && (
            <div className="mt-[6px] flex items-center gap-[8px]">
              <img
                src={iconUrl}
                alt=""
                className="w-[24px] h-[24px] border-[2px] border-black object-contain"
                onError={(e) => {
                  ;(e.target as HTMLImageElement).style.display = 'none'
                }}
                onLoad={(e) => {
                  ;(e.target as HTMLImageElement).style.display = ''
                }}
              />
              <span className="font-mono text-[11px] text-black/50 truncate max-w-[300px]">
                {iconUrl.length > 60 ? iconUrl.slice(0, 60) + '…' : iconUrl}
              </span>
            </div>
          )}
        </div>

        {/* User-Agent */}
        <div className="pb-[12px]">
          <label className="block font-headline text-[12px] uppercase tracking-wider text-black pb-[4px]">
            {m.dock_install_user_agent()}
          </label>
          <input
            className={`w-full ${inputCls}`}
            type="text"
            value={userAgent}
            onChange={(e) => setUserAgent(e.target.value)}
            placeholder="Mozilla/5.0 ..."
            disabled={submitting}
          />
        </div>

        {/* Custom CSS — collapsible */}
        <div className="pb-[12px]">
          <div className="flex items-center gap-[8px] pb-[4px]">
            <button
              type="button"
              role="switch"
              aria-checked={customCssEnabled}
              className={`relative inline-flex h-[20px] w-[36px] shrink-0 cursor-pointer items-center border-[2px] border-black transition-colors duration-[50ms] ${
                customCssEnabled ? 'bg-black' : 'bg-white'
              }`}
              onClick={() => setCustomCssEnabled(!customCssEnabled)}
            >
              <span
                className={`inline-block h-[12px] w-[12px] border-[2px] border-black transition-transform duration-[50ms] ${
                  customCssEnabled ? 'translate-x-[18px] bg-white' : 'translate-x-[2px] bg-black'
                }`}
              />
            </button>
            <span className="font-headline text-[12px] uppercase tracking-wider text-black">
              {m.dock_install_custom_css()}
            </span>
          </div>
          {customCssEnabled && (
            <>
              <div className="pt-[8px]">
                <label className="block font-mono text-[11px] text-black pb-[4px]">
                  {m.dock_install_css_common()}
                </label>
                <textarea
                  className={`w-full ${inputCls} resize-y min-h-[60px] font-mono text-[13px]`}
                  rows={3}
                  value={cssCommon}
                  onChange={(e) => setCssCommon(e.target.value)}
                  placeholder="body { background: #f0f0f0; }"
                  disabled={submitting}
                />
              </div>
              <div className="pt-[8px]">
                <label className="block font-mono text-[11px] text-black pb-[4px]">
                  {m.dock_install_css_macos()}
                </label>
                <textarea
                  className={`w-full ${inputCls} resize-y min-h-[60px] font-mono text-[13px]`}
                  rows={2}
                  value={cssMacos}
                  onChange={(e) => setCssMacos(e.target.value)}
                  placeholder="/* wrapped in .is-macos */"
                  disabled={submitting}
                />
              </div>
              <div className="pt-[8px]">
                <label className="block font-mono text-[11px] text-black pb-[4px]">
                  {m.dock_install_css_windows()}
                </label>
                <textarea
                  className={`w-full ${inputCls} resize-y min-h-[60px] font-mono text-[13px]`}
                  rows={2}
                  value={cssWindows}
                  onChange={(e) => setCssWindows(e.target.value)}
                  placeholder="/* wrapped in .is-windows */"
                  disabled={submitting}
                />
              </div>
              <div className="pt-[8px]">
                <label className="block font-mono text-[11px] text-black pb-[4px]">
                  {m.dock_install_css_linux()}
                </label>
                <textarea
                  className={`w-full ${inputCls} resize-y min-h-[60px] font-mono text-[13px]`}
                  rows={2}
                  value={cssLinux}
                  onChange={(e) => setCssLinux(e.target.value)}
                  placeholder="/* wrapped in .is-linux */"
                  disabled={submitting}
                />
              </div>
            </>
          )}
        </div>

        {/* Window Size */}
        <div className="pb-[12px]">
          <label className="block font-headline text-[12px] uppercase tracking-wider text-black pb-[4px]">
            {m.dock_install_window_size()}
          </label>
          <div className="flex gap-[8px]">
            <input
              className={`flex-1 ${inputCls}`}
              type="number"
              min={400}
              max={3840}
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
              placeholder="Width"
              disabled={submitting}
            />
            <span className="self-center font-mono text-[15px]">×</span>
            <input
              className={`flex-1 ${inputCls}`}
              type="number"
              min={300}
              max={2160}
              value={height}
              onChange={(e) => setHeight(Number(e.target.value))}
              placeholder="Height"
              disabled={submitting}
            />
          </div>
        </div>

        {/* Title Bar Style */}
        <div className="pb-[12px]">
          <label className="block font-headline text-[12px] uppercase tracking-wider text-black pb-[4px]">
            {m.dock_install_titlebar()}
          </label>
          <div className="flex gap-[8px]">
            {(['default', 'hidden', 'none'] as const).map((style) => (
              <button
                key={style}
                className={`flex-1 ${btnSmall} ${titleBarStyle === style ? 'bg-black text-white' : 'bg-white text-black hover:bg-black hover:text-white'}`}
                onClick={() => setTitleBarStyle(style)}
                disabled={submitting}
              >
                {style === 'default'
                  ? m.dock_install_titlebar_default()
                  : style === 'hidden'
                    ? m.dock_install_titlebar_hidden()
                    : m.dock_install_titlebar_none()}
              </button>
            ))}
          </div>
        </div>

        {/* Frame toggle */}
        <div className="pb-[20px]">
          <label className="flex items-center gap-[8px] cursor-pointer select-none">
            <span className="relative w-[20px] h-[20px]">
              <input
                type="checkbox"
                className="peer w-[20px] h-[20px] border-[3px] border-black bg-white checked:bg-black cursor-pointer appearance-none transition-colors duration-[50ms]"
                checked={frame}
                onChange={(e) => setFrame(e.target.checked)}
                disabled={submitting}
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
            <span className="font-body text-[14px] text-black">{m.dock_install_frame()}</span>
          </label>
        </div>

        {/* Submit button */}
        <button
          className={`w-full ${btnPrimary} ${submitting ? 'opacity-50 pointer-events-none' : ''}`}
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitLabel || m.dock_install_confirm()}
        </button>
      </div>
    </div>
  )
}
