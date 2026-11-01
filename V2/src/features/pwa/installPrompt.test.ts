import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  chooseInstallMethod,
  getInstallPromptState,
  installInstallPromptCapture,
  promptInstall,
  resetInstallPromptForTests,
  subscribeInstallPrompt,
} from './installPrompt'

afterEach(() => resetInstallPromptForTests())

function fakeInstallEvent() {
  const event = new Event('beforeinstallprompt', { cancelable: true })
  const prompt = vi.fn().mockResolvedValue(undefined)
  Object.assign(event, {
    prompt,
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  })
  return { event, prompt }
}

describe('chooseInstallMethod (#291)', () => {
  const base = {
    hasPrompt: false,
    isStandalone: false,
    isIos: false,
    isAndroid: false,
  }

  it('viser ingen knap, når appen kører fra hjemmeskærmen', () => {
    expect(
      chooseInstallMethod({ ...base, isStandalone: true, hasPrompt: true }),
    ).toBeNull()
  })

  it('bruger browserens dialog, når den har meldt sig klar', () => {
    expect(
      chooseInstallMethod({ ...base, hasPrompt: true, isAndroid: true }),
    ).toBe('prompt')
  })

  it('viser vejledningen på iPhone, hvor der aldrig kommer en melding', () => {
    expect(chooseInstallMethod({ ...base, isIos: true })).toBe('ios')
  })

  it('viser vejledningen på Android uden melding', () => {
    expect(chooseInstallMethod({ ...base, isAndroid: true })).toBe('android')
  })

  it('viser ingen knap på en computer uden melding', () => {
    expect(chooseInstallMethod(base)).toBeNull()
  })
})

describe('det fælles lager', () => {
  it('husker meldingen for en knap, der først monteres bagefter', () => {
    installInstallPromptCapture(window)
    const { event } = fakeInstallEvent()
    window.dispatchEvent(event)

    // Burger-menuens knap abonnerer først nu -- og ser alligevel meldingen.
    const listener = vi.fn()
    subscribeInstallPrompt(listener)
    expect(getInstallPromptState().deferredPrompt).toBe(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('giver besked til dem, der allerede lytter', () => {
    installInstallPromptCapture(window)
    const listener = vi.fn()
    subscribeInstallPrompt(listener)
    window.dispatchEvent(fakeInstallEvent().event)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('viser browserens dialog én gang og glemmer så meldingen', async () => {
    installInstallPromptCapture(window)
    const { event, prompt } = fakeInstallEvent()
    window.dispatchEvent(event)

    await promptInstall()
    expect(prompt).toHaveBeenCalledTimes(1)
    expect(getInstallPromptState().deferredPrompt).toBeNull()
  })

  it('husker, at appen er installeret', () => {
    installInstallPromptCapture(window)
    window.dispatchEvent(fakeInstallEvent().event)
    window.dispatchEvent(new Event('appinstalled'))
    expect(getInstallPromptState()).toEqual({
      deferredPrompt: null,
      installed: true,
    })
  })
})
