/**
 * "Installér app" (#291).
 *
 * Chromium-browsere melder kun én gang -- kort efter at siden er indlæst --
 * at appen kan installeres (`beforeinstallprompt`). Lyttede hver knap selv,
 * gik meldingen tabt for knappen i burger-menuen, der først monteres, når
 * menuen åbnes. Derfor fanges den her, én gang ved opstart (se main.tsx), og
 * alle knapper læser den samme tilstand.
 *
 * Safari på iPhone/iPad melder aldrig noget; dér er installationen altid
 * manuel (Del -> "Føj til hjemmeskærm"), og knappen viser en vejledning.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** Hvordan appen kan installeres her -- eller null, hvis der ikke skal vises en knap. */
export type InstallMethod = 'prompt' | 'ios' | 'android' | null

/**
 * Ren beslutning ud fra det, browseren har sagt: installeret -> ingen knap;
 * har browseren meldt sig klar -> dens egen dialog; ellers en vejledning på
 * iOS og Android. På en computer uden melding vises ingen knap.
 */
export function chooseInstallMethod(input: {
  hasPrompt: boolean
  isStandalone: boolean
  isIos: boolean
  isAndroid: boolean
}): InstallMethod {
  if (input.isStandalone) return null
  if (input.hasPrompt) return 'prompt'
  if (input.isIos) return 'ios'
  if (input.isAndroid) return 'android'
  return null
}

interface InstallPromptState {
  deferredPrompt: BeforeInstallPromptEvent | null
  installed: boolean
}

let state: InstallPromptState = { deferredPrompt: null, installed: false }
const listeners = new Set<() => void>()
let removeCapture: (() => void) | null = null

function setState(next: Partial<InstallPromptState>) {
  state = { ...state, ...next }
  for (const listener of listeners) listener()
}

export function subscribeInstallPrompt(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getInstallPromptState(): InstallPromptState {
  return state
}

/** Lytter efter browserens meldinger. Kaldes én gang ved opstart. */
export function installInstallPromptCapture(target: Window = window): void {
  if (removeCapture) return

  function handleBeforeInstallPrompt(event: Event) {
    // Browserens egen mini-infobar undertrykkes; appens knap tager over.
    event.preventDefault()
    setState({ deferredPrompt: event as BeforeInstallPromptEvent })
  }
  function handleAppInstalled() {
    setState({ deferredPrompt: null, installed: true })
  }

  target.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  target.addEventListener('appinstalled', handleAppInstalled)
  removeCapture = () => {
    target.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    target.removeEventListener('appinstalled', handleAppInstalled)
  }
}

/** Viser browserens egen installationsdialog. Meldingen kan kun bruges én gang. */
export async function promptInstall(): Promise<void> {
  const prompt = state.deferredPrompt
  if (!prompt) return
  await prompt.prompt()
  await prompt.userChoice
  setState({ deferredPrompt: null })
}

/** Kun til tests: nulstiller lageret. */
export function resetInstallPromptForTests(): void {
  removeCapture?.()
  removeCapture = null
  state = { deferredPrompt: null, installed: false }
  listeners.clear()
}
