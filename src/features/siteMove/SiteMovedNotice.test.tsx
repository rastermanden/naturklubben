import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ onOldHost: true }))

vi.mock('./siteMove', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./siteMove')>()
  return { ...actual, shouldCheckForMove: () => mocks.onOldHost }
})

import { SiteMovedNotice } from './SiteMovedNotice'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  mocks.onOldHost = true
})

function stubFetch(response: Promise<{ type: string }>) {
  const fetchMock = vi.fn(() => response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('SiteMovedNotice', () => {
  it('sender folk til naturklubben.dk, når den gamle adresse viderestiller', async () => {
    const fetchMock = stubFetch(Promise.resolve({ type: 'opaqueredirect' }))
    render(<SiteMovedNotice />)

    expect(
      await screen.findByRole('dialog', { name: 'Naturklubben er flyttet' }),
    ).toBeTruthy()
    expect(
      screen
        .getByRole('link', { name: 'Gå til naturklubben.dk' })
        .getAttribute('href'),
    ).toMatch(/^https:\/\/naturklubben\.dk\//)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/favicon\.svg\?flyttet-tjek=/),
      expect.objectContaining({ redirect: 'manual' }),
    )
  })

  it('viser intet, så længe den gamle adresse svarer normalt', async () => {
    const fetchMock = stubFetch(Promise.resolve({ type: 'basic' }))
    render(<SiteMovedNotice />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('viser intet offline', async () => {
    const fetchMock = stubFetch(Promise.reject(new TypeError('offline')))
    render(<SiteMovedNotice />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('tjekker slet ikke på andre adresser', () => {
    mocks.onOldHost = false
    const fetchMock = stubFetch(Promise.resolve({ type: 'opaqueredirect' }))
    render(<SiteMovedNotice />)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
