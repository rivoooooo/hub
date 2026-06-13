import { createFileRoute, Link } from '@tanstack/react-router'
import { m } from '../paraglide/messages.js'
import { useLocale } from '../useLocale'

const selectCls =
  'font-mono text-[15px] leading-[1.5] py-[10px] px-[12px] border-[3px] border-black bg-white text-black outline-none cursor-pointer transition-colors duration-[50ms] hover:bg-[#e8e8e8] focus:border-[5px] focus:bg-white appearance-none'

const localeOptions: { value: string; labelKey: 'settings_locale_en' | 'settings_locale_zhCN' }[] =
  [
    { value: 'en', labelKey: 'settings_locale_en' },
    { value: 'zh-CN', labelKey: 'settings_locale_zhCN' }
  ]

export const Route = createFileRoute('/settings')({
  component: function Settings(): React.JSX.Element {
    const { locale, setLocaleAndRerender } = useLocale()

    return (
      <div className="pt-[120px] px-[24px]">
        <h1 className="font-headline text-[64px] leading-none text-black pb-[16px]">
          {m.settings_title()}
        </h1>

        {/* Language */}
        <div className="pb-[24px] max-w-[320px]">
          <label
            htmlFor="settings-language"
            className="block font-headline text-[14px] uppercase tracking-wider text-black pb-[4px]"
          >
            {m.settings_language_label()}
          </label>
          <div className="relative">
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
        </div>

        <Link to="/" className="font-mono text-[15px] text-black underline hover:text-blue">
          {m.back_to_home()}
        </Link>
      </div>
    )
  }
})
