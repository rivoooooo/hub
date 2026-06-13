import { createContext } from 'react'

export interface LocaleContextValue {
  locale: string
  setLocaleAndRerender: (locale: string) => void
  availableLocales: readonly string[]
}

export const LocaleContext = createContext<LocaleContextValue | null>(null)
