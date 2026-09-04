import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { ThemeContext } from './ThemeContext'
import {
  applyResolvedTheme,
  prefersDarkSystemTheme,
  readThemePreference,
  storeThemePreference,
  type ThemePreference,
} from './theme'

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Begge dele læses i initialisatoren og ikke i en effekt: scriptet i
  // index.html har allerede afgjort temaet, og starter React med noget andet,
  // blinker siden om ved første tegning.
  const [preference, setPreferenceState] =
    useState<ThemePreference>(readThemePreference)
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    prefersDarkSystemTheme,
  )

  const resolved =
    preference === 'auto' ? (systemPrefersDark ? 'dark' : 'light') : preference

  useEffect(() => {
    applyResolvedTheme(resolved)
  }, [resolved])

  // Systemet lyttes der altid med på, også mens valget er `light` eller
  // `dark` -- så er svaret klar med det samme, hvis medlemmet skifter tilbage
  // til auto. `resolved` regnes ud under tegningen og bruger det bare, når det
  // er relevant.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return

    const query = window.matchMedia('(prefers-color-scheme: dark)')
    function followSystem(event: MediaQueryListEvent) {
      setSystemPrefersDark(event.matches)
    }

    query.addEventListener('change', followSystem)
    return () => query.removeEventListener('change', followSystem)
  }, [])

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next)
    storeThemePreference(next)
  }, [])

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
