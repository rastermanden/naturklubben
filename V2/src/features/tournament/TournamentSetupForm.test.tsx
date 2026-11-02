import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TournamentSetupForm } from './TournamentSetupForm'

const members = [
  { id: 'a', fullName: 'Ada', avatarUrl: null, chatColor: '#16a34a' },
  { id: 'b', fullName: 'Bo', avatarUrl: null, chatColor: '#16a34a' },
  { id: 'c', fullName: 'Chris', avatarUrl: null, chatColor: '#16a34a' },
]

afterEach(cleanup)

describe('TournamentSetupForm', () => {
  it('kræver to deltagere og viser bye-valget ved ulige udslag', () => {
    const onSubmit = vi.fn()
    render(
      <TournamentSetupForm
        members={members}
        submitting={false}
        error={null}
        onSubmit={onSubmit}
      />,
    )

    expect(screen.getByText('Alle-mod-alle')).toBeTruthy()
    expect(screen.getByText('Udslagsrunder')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Start turnering' }))
    expect(
      screen.getByText('Vælg mindst 2 deltagere for at starte en turnering.'),
    ).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('radio', { name: /Udslagsrunder/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Ada/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Bo/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Chris/ }))

    expect(screen.getByText('Hvem sidder over i runde 1?')).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'b' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start turnering' }))

    expect(onSubmit).toHaveBeenCalledWith({
      format: 'single_elimination',
      participantProfileIds: ['a', 'b', 'c'],
      byeProfileId: 'b',
    })
  })
})
