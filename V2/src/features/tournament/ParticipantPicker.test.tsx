import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ParticipantPicker } from './ParticipantPicker'

const members = [
  { id: 'a', fullName: 'Ada', avatarUrl: null, chatColor: '#16a34a' },
  { id: 'b', fullName: 'Bo', avatarUrl: null, chatColor: '#16a34a' },
  { id: 'c', fullName: null, avatarUrl: null, chatColor: '#16a34a' },
]

afterEach(cleanup)

describe('ParticipantPicker', () => {
  it('viser antallet og stopper ved loftet, som i den nuværende app', () => {
    const onToggle = vi.fn()
    render(
      <ParticipantPicker
        members={members}
        selectedIds={['a', 'b']}
        onToggle={onToggle}
        maxParticipants={2}
      />,
    )

    expect(screen.getByText('Deltagere (2/2)')).toBeTruthy()
    expect(screen.getByText('Unavngivet medlem')).toBeTruthy()

    const boxes = screen.getAllByRole('checkbox')
    expect((boxes[0] as HTMLInputElement).checked).toBe(true)
    expect((boxes[1] as HTMLInputElement).disabled).toBe(false)
    expect((boxes[2] as HTMLInputElement).disabled).toBe(true)

    fireEvent.click(boxes[0])
    expect(onToggle).toHaveBeenCalledWith('a')
  })
})
