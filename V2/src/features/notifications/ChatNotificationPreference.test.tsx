import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const updateProfile = vi.hoisted(() => vi.fn())
const profileState = vi.hoisted(() => ({
  isLoading: false,
  profile: {
    chatNotificationPreference: 'all' as 'all' | 'mentions' | 'none',
  },
}))

vi.mock('convex/react', () => ({
  useMutation: () => updateProfile,
}))

vi.mock('../auth/useCurrentProfile', () => ({
  useCurrentProfile: () => profileState,
}))

import { ChatNotificationPreference } from './ChatNotificationPreference'

afterEach(() => {
  cleanup()
  updateProfile.mockReset()
  profileState.isLoading = false
  profileState.profile = { chatNotificationPreference: 'all' }
})

describe('ChatNotificationPreference', () => {
  it('viser nuværende valg og gemmer ændringen på profilen', async () => {
    updateProfile.mockResolvedValue(undefined)
    render(<ChatNotificationPreference />)

    const select = screen.getByLabelText(
      'Notifikationer fra chatten',
    ) as HTMLSelectElement
    expect(select.value).toBe('all')

    fireEvent.change(select, { target: { value: 'mentions' } })

    expect(updateProfile).toHaveBeenCalledWith({
      chatNotificationPreference: 'mentions',
    })
  })

  it('viser fejlbesked, hvis gemning fejler', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    updateProfile.mockRejectedValue(new Error('netværk'))
    render(<ChatNotificationPreference />)

    fireEvent.change(screen.getByLabelText('Notifikationer fra chatten'), {
      target: { value: 'none' },
    })

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Valget kunne ikke gemmes')
    errorSpy.mockRestore()
  })
})
