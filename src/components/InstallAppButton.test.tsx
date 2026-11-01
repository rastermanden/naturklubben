import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  installInstallPromptCapture,
  resetInstallPromptForTests,
} from '../features/pwa/installPrompt'

const platform = vi.hoisted(() => ({
  ios: false,
  android: false,
  standalone: false,
}))

vi.mock('../features/pwa/platform', () => ({
  isIosDevice: () => platform.ios,
  isAndroidDevice: () => platform.android,
  isStandaloneDisplay: () => platform.standalone,
}))

import { InstallAppButton } from './InstallAppButton'

afterEach(() => {
  cleanup()
  resetInstallPromptForTests()
  platform.ios = false
  platform.android = false
  platform.standalone = false
})

function announceInstallable() {
  const event = new Event('beforeinstallprompt', { cancelable: true })
  const prompt = vi.fn().mockResolvedValue(undefined)
  Object.assign(event, {
    prompt,
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  })
  window.dispatchEvent(event)
  return prompt
}

describe('InstallAppButton (#291)', () => {
  it('virker, selv om meldingen kom, før knappen blev monteret', () => {
    platform.android = true
    installInstallPromptCapture(window)
    const prompt = announceInstallable()

    render(<InstallAppButton className="" />)
    fireEvent.click(screen.getByRole('button', { name: 'Installér app' }))

    expect(prompt).toHaveBeenCalledTimes(1)
  })

  it('viser vejledningen til "Føj til hjemmeskærm" på iPhone', () => {
    platform.ios = true
    installInstallPromptCapture(window)

    render(<InstallAppButton className="" />)
    fireEvent.click(screen.getByRole('button', { name: 'Installér app' }))

    const guide = screen.getByRole('dialog', {
      name: 'Installér appen på din iPhone',
    })
    expect(guide.textContent).toContain('Føj til hjemmeskærm')
    fireEvent.click(screen.getByRole('button', { name: 'Forstået' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('viser vejledningen på Android, når browseren ikke har meldt sig', () => {
    platform.android = true
    installInstallPromptCapture(window)

    render(<InstallAppButton className="" />)
    fireEvent.click(screen.getByRole('button', { name: 'Installér app' }))

    expect(
      screen.getByRole('dialog', { name: 'Installér appen på din telefon' })
        .textContent,
    ).toContain('Installér app')
  })

  it('vises ikke, når appen kører fra hjemmeskærmen', () => {
    platform.ios = true
    platform.standalone = true
    render(<InstallAppButton className="" />)
    expect(screen.queryByRole('button', { name: 'Installér app' })).toBeNull()
  })

  it('vises ikke på en computer uden melding', () => {
    render(<InstallAppButton className="" />)
    expect(screen.queryByRole('button', { name: 'Installér app' })).toBeNull()
  })
})
