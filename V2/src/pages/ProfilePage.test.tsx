import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const uploadAvatar = vi.hoisted(() => vi.fn())

vi.mock('convex/react', () => ({
  useMutation: () => vi.fn(),
}))

vi.mock('../features/auth/useCurrentProfile', () => ({
  useCurrentProfile: () => ({
    isLoading: false,
    profile: {
      fullName: 'Test Medlem',
      pronouns: null,
      causes: [],
      chatColor: '#16a34a',
      featureNotificationsEnabled: true,
      avatarUrl: 'https://example.com/avatar.jpg',
    },
  }),
}))

vi.mock('../features/profile/uploadAvatar', () => ({
  uploadAvatar: (...args: unknown[]) => uploadAvatar(...args),
}))

import ProfilePage from './ProfilePage'

afterEach(() => {
  cleanup()
  uploadAvatar.mockReset()
})

describe('ProfilePage profilbillede', () => {
  it('gemmer billedet med det samme, når en fil er valgt', async () => {
    uploadAvatar.mockResolvedValue(undefined)
    render(<ProfilePage />)

    const file = new File(['png'], 'ansigt.png', { type: 'image/png' })
    fireEvent.change(await screen.findByLabelText('Vælg profilbillede'), {
      target: { files: [file] },
    })

    expect(await screen.findByText('Profilbilledet er gemt.')).toBeTruthy()
    expect(uploadAvatar).toHaveBeenCalledOnce()
    expect(uploadAvatar.mock.calls[0]?.[0].file).toBe(file)
    expect(screen.getByRole('img', { name: 'Test Medlem' })).toBeTruthy()
  })

  it('viser den danske fejl, når filen ikke er et billede', async () => {
    uploadAvatar.mockRejectedValue(new Error('AVATAR_NOT_AN_IMAGE'))
    render(<ProfilePage />)

    fireEvent.change(await screen.findByLabelText('Vælg profilbillede'), {
      target: {
        files: [new File(['tekst'], 'notat.txt', { type: 'text/plain' })],
      },
    })

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Filen er ikke et billede.')
  })
})
