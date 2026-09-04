/**
 * Mørk tilstand til aftenbrug (#187).
 *
 * Præferencen er tre-delt -- `auto`, `light`, `dark` -- mens CSS'en kun kender
 * to. Oversættelsen sker her, og resultatet skrives som `data-theme` på
 * `<html>`. Det er derfor `index.css` klarer sig med ét mørkt selektor-tilfælde
 * uden media-query.
 *
 * Valget gemmes i localStorage og ikke i `profiles`. Et tema er en egenskab ved
 * *skærmen*, ikke ved medlemmet: den samme person vil gerne have mørkt på
 * telefonen i skovbrynet klokken 22 og lyst på computeren om formiddagen. Det
 * betyder også, at temaet virker, før man er logget ind, og uden et rundtur til
 * databasen ved hver sideindlæsning.
 */

export type ThemePreference = 'auto' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

/** Skal holdes i sync med det lille script i index.html, som læser den samme
 *  nøgle, før React er indlæst. */
export const THEME_STORAGE_KEY = 'naturklubben:theme'

/** Farven på browserens egen kant (statuslinje på Android, faneblad).
 *  Den lyse er den samme grønne, appen altid har haft. */
const BROWSER_THEME_COLOR: Record<ResolvedTheme, string> = {
  light: '#166534',
  dark: '#0b120e',
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'auto' || value === 'light' || value === 'dark'
}

export function readThemePreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isThemePreference(stored) ? stored : 'auto'
  } catch {
    // Privat tilstand og blokerede cookies kaster her. Et tema er ikke værd at
    // vælte appen over.
    return 'auto'
  }
}

export function storeThemePreference(preference: ThemePreference) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // Se readThemePreference.
  }
}

export function prefersDarkSystemTheme() {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
}

export function applyResolvedTheme(theme: ResolvedTheme) {
  document.documentElement.dataset.theme = theme

  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', BROWSER_THEME_COLOR[theme])
}
