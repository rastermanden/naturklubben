import { createContext } from 'react'
import type { ResolvedTheme, ThemePreference } from './theme'

export interface ThemeContextValue {
  /** Det, medlemmet har valgt -- kan være `auto`. */
  preference: ThemePreference
  /** Det, der faktisk er tegnet på skærmen lige nu. */
  resolved: ResolvedTheme
  setPreference: (preference: ThemePreference) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)
