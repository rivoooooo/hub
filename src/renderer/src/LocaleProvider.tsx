import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import { getLocale, setLocale, locales, localStorageKey } from './paraglide/runtime.js'
import { LocaleContext, type LocaleContextValue } from './LocaleContext'

export function LocaleProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [locale, setLocaleState] = useState(() => {
    try {
      return localStorage.getItem(localStorageKey) ?? getLocale()
    } catch {
      return getLocale()
    }
  })

  // Sync paraglide runtime with the stored locale on first mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once
  useEffect(() => {
    if (locale !== getLocale()) {
      setLocale(locale, { reload: false })
    }
  }, [])

  const setLocaleAndRerender = useCallback((newLocale: string) => {
    setLocaleState(newLocale)
    try {
      localStorage.setItem(localStorageKey, newLocale)
    } catch {
      // ignore localStorage errors
    }
    setLocale(newLocale, { reload: false })
  }, [])

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, setLocaleAndRerender, availableLocales: locales }),
    [locale, setLocaleAndRerender]
  )

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}
