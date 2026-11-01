import { useSyncExternalStore } from 'react'
import {
  chooseInstallMethod,
  getInstallPromptState,
  promptInstall,
  subscribeInstallPrompt,
  type InstallMethod,
} from './installPrompt'
import { isAndroidDevice, isIosDevice, isStandaloneDisplay } from './platform'

/**
 * Om -- og hvordan -- appen kan installeres her (#291). Læser det fælles
 * lager, som main.tsx fylder ved opstart, så også en knap, der monteres
 * senere (fx i burger-menuen), ved, at browseren har meldt sig klar.
 */
export function useInstallPrompt(): {
  method: InstallMethod
  promptInstall: () => Promise<void>
} {
  const state = useSyncExternalStore(
    subscribeInstallPrompt,
    getInstallPromptState,
  )

  const method = chooseInstallMethod({
    hasPrompt: state.deferredPrompt !== null,
    isStandalone: state.installed || isStandaloneDisplay(),
    isIos: isIosDevice(),
    isAndroid: isAndroidDevice(),
  })

  return { method, promptInstall }
}
