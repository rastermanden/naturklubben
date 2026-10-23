import { useContext } from 'react'
import { ThemeContext } from './ThemeContext'

/**
 * Temaet for den kørende app. Kaster uden en `ThemeProvider` -- det er med
 * vilje: et tema, der stiltiende falder tilbage til lyst, ser ud som om
 * indstillingen virker, indtil nogen prøver at skifte.
 */
export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme skal bruges inden i en ThemeProvider')
  }
  return context
}
