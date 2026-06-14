import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { m } from '../paraglide/messages.js'
import { useLocale } from '../useLocale'

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const selectCls =
  'font-mono text-[15px] leading-[1.5] py-[10px] px-[12px] border-[3px] border-black bg-white text-black outline-none cursor-pointer transition-colors duration-[50ms] hover:bg-[#e8e8e8] focus:border-[5px] focus:bg-white appearance-none'

const inputCls =
  'font-mono text-[15px] leading-[1.5] py-[10px] px-[12px] border-[3px] border-black bg-white text-black outline-none transition-colors duration-[50ms] hover:bg-[#e8e8e8] focus:border-[5px] focus:bg-white flex-1'

const labelCls = 'block font-headline text-[14px] uppercase tracking-wider text-black pb-[4px]'

const localeOptions: { value: string; labelKey: 'settings_locale_en' | 'settings_locale_zhCN' }[] =
  [
    { value: 'en', labelKey: 'settings_locale_en' },
    { value: 'zh-CN', labelKey: 'settings_locale_zhCN' }
  ]

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/settings')({
  component: function Settings(): React.JSX.Element {
    const { locale, setLocaleAndRerender } = useLocale()
    const [proxyEnabled, setProxyEnabled] = useState(false)
    const [proxyUrl, setProxyUrl] = useState('')
    const [seoHistoryDir, setSeoHistoryDir] = useState('')
    const [defaultUserAgent, setDefaultUserAgent] = useState('')
    const [loaded, setLoaded] = useState(false)
    const proxyUrlRef = useRef<HTMLInputElement>(null)
    const seoHistoryDirRef = useRef<HTMLInputElement>(null)

    // Load current settings once
    useEffect(() => {
      window.settingsApi.get().then((s) => {
        setProxyEnabled(s.proxyEnabled)
        setProxyUrl(s.proxyUrl)
        setSeoHistoryDir(s.seoHistoryDir)
        setDefaultUserAgent(s.defaultUserAgent)
        setLoaded(true)
      })
    }, [])

    const updateSetting = useCallback((key: string, value: unknown) => {
      window.settingsApi.set(key, value)
    }, [])

    const handleToggle = useCallback(() => {
      const next = !proxyEnabled
      setProxyEnabled(next)
      updateSetting('proxyEnabled', next)
      if (next && proxyUrlRef.current) {
        proxyUrlRef.current.focus()
      }
    }, [proxyEnabled, updateSetting])

    const handleUrlChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        setProxyUrl(val)
        updateSetting('proxyUrl', val)
      },
      [updateSetting]
    )

    const handleSeoHistoryDirChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        setSeoHistoryDir(val)
        updateSetting('seoHistoryDir', val)
      },
      [updateSetting]
    )

    const handleDefaultUserAgentChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        setDefaultUserAgent(val)
        updateSetting('defaultUserAgent', val)
      },
      [updateSetting]
    )

    return (
      <div className="pt-[120px] px-[24px] max-w-[640px]">
        <h1 className="font-headline text-[64px] leading-none text-black pb-[32px]">
          {m.settings_title()}
        </h1>

        {/* Language */}
        <section className="pb-[40px]">
          <label htmlFor="settings-language" className={labelCls}>
            {m.settings_language_label()}
          </label>
          <div className="relative max-w-[320px]">
            <select
              id="settings-language"
              className={`w-full ${selectCls}`}
              value={locale}
              onChange={(e) => setLocaleAndRerender(e.target.value)}
            >
              {localeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {m[opt.labelKey]()}
                </option>
              ))}
            </select>
            {/* Custom chevron */}
            <svg
              className="pointer-events-none absolute right-[12px] top-1/2 -translate-y-1/2 w-[16px] h-[16px] text-black"
              viewBox="0 0 16 16"
            >
              <polyline
                points="4,6 8,10 12,6"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="square"
                strokeLinejoin="miter"
              />
            </svg>
          </div>
        </section>

        {/* Proxy */}
        <section className="pb-[40px]">
          <h2 className="font-headline text-[12px] uppercase tracking-[3px] text-black pb-[16px] border-b-[3px] border-black mb-[16px]">
            {m.settings_proxy_title()}
          </h2>

          {loaded && (
            <>
              {/* Toggle */}
              <div className="flex items-center gap-[12px] pb-[16px]">
                <button
                  type="button"
                  role="switch"
                  aria-checked={proxyEnabled}
                  className={`relative inline-flex h-[28px] w-[52px] shrink-0 cursor-pointer items-center border-[3px] border-black transition-colors duration-[50ms] ${
                    proxyEnabled ? 'bg-black' : 'bg-white'
                  }`}
                  onClick={handleToggle}
                >
                  <span
                    className={`inline-block h-[18px] w-[18px] border-[2px] border-black transition-transform duration-[50ms] ${
                      proxyEnabled ? 'translate-x-[26px] bg-white' : 'translate-x-[4px] bg-black'
                    }`}
                  />
                </button>
                <span className="font-mono text-[14px] leading-[1.5] text-black">
                  {proxyEnabled ? m.settings_proxy_enabled() : m.settings_proxy_disabled()}
                </span>
              </div>

              {/* URL input */}
              <div className={proxyEnabled ? '' : 'opacity-40 pointer-events-none'}>
                <label htmlFor="settings-proxy-url" className={labelCls}>
                  {m.settings_proxy_url_label()}
                </label>
                <input
                  ref={proxyUrlRef}
                  id="settings-proxy-url"
                  type="text"
                  className={`max-w-[420px] ${inputCls}`}
                  placeholder="http://127.0.0.1:7890"
                  value={proxyUrl}
                  onChange={handleUrlChange}
                />
                <p className="font-mono text-[12px] leading-[1.5] text-black/50 pt-[4px]">
                  {m.settings_proxy_hint()}
                </p>
              </div>
            </>
          )}
        </section>

        {/* Data Directory */}
        <section className="pb-[40px]">
          <h2 className="font-headline text-[12px] uppercase tracking-[3px] text-black pb-[16px] border-b-[3px] border-black mb-[16px]">
            {m.settings_data_dir_title()}
          </h2>
          {loaded && (
            <div>
              <label htmlFor="settings-data-dir" className={labelCls}>
                {m.settings_data_dir_label()}
              </label>
              <input
                ref={seoHistoryDirRef}
                id="settings-data-dir"
                type="text"
                className={`max-w-[420px] ${inputCls}`}
                placeholder="~/.rivo"
                value={seoHistoryDir}
                onChange={handleSeoHistoryDirChange}
              />
              <p className="font-mono text-[12px] leading-[1.5] text-black/50 pt-[4px]">
                {m.settings_data_dir_hint()}
              </p>
            </div>
          )}
        </section>

        {/* Default User-Agent */}
        <section className="pb-[40px]">
          <h2 className="font-headline text-[12px] uppercase tracking-[3px] text-black pb-[16px] border-b-[3px] border-black mb-[16px]">
            {m.settings_default_ua_label()}
          </h2>
          {loaded && (
            <div>
              <label htmlFor="settings-default-ua" className={labelCls}>
                {m.settings_default_ua_label()}
              </label>
              <input
                id="settings-default-ua"
                type="text"
                className={`max-w-[420px] ${inputCls}`}
                placeholder="Mozilla/5.0 ..."
                value={defaultUserAgent}
                onChange={handleDefaultUserAgentChange}
              />
              <p className="font-mono text-[12px] leading-[1.5] text-black/50 pt-[4px]">
                {m.settings_default_ua_hint()}
              </p>
            </div>
          )}
        </section>

        {/* About */}
        <div className="pt-[16px]">
          <Link to="/about" className="font-mono text-[15px] text-black underline hover:text-blue">
            {m.about_title()}
          </Link>
        </div>
      </div>
    )
  }
})
