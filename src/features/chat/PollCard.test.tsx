import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PollCard } from './PollCard'
import type { PollSummary } from './polls'

afterEach(cleanup)

const poll: PollSummary = {
  id: 'poll-1',
  question: 'Hvor skal vi hen på lørdag?',
  closed: false,
  createdBy: 'ada',
  totalVotes: 3,
  options: [
    {
      id: 'option-1',
      label: 'Skoven',
      count: 2,
      percentage: 67,
      votedByMe: true,
    },
    {
      id: 'option-2',
      label: 'Stranden',
      count: 1,
      percentage: 33,
      votedByMe: false,
    },
  ],
  ownVoteOptionId: 'option-1',
}

describe('PollCard', () => {
  it('shows every answer with its vote count and percentage', () => {
    render(
      <PollCard
        poll={poll}
        canClose={false}
        onVote={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('Skoven')).toBeTruthy()
    expect(screen.getByText('Stranden')).toBeTruthy()
    expect(screen.getByText('2 · 67%')).toBeTruthy()
    expect(screen.getByText('1 · 33%')).toBeTruthy()
    expect(screen.getByText('3 stemmer')).toBeTruthy()
  })

  it('marks the member’s own vote', () => {
    render(
      <PollCard
        poll={poll}
        canClose={false}
        onVote={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(
      screen
        .getByRole('button', { name: /Fjern din stemme på Skoven/ })
        .getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      screen
        .getByRole('button', { name: /Stem på Stranden/ })
        .getAttribute('aria-pressed'),
    ).toBe('false')
  })

  it('calls onVote with the chosen answer', () => {
    const onVote = vi.fn()
    render(
      <PollCard
        poll={poll}
        canClose={false}
        onVote={onVote}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Stranden/ }))
    expect(onVote).toHaveBeenCalledWith('option-2')
  })

  it('shows a close button only when canClose is true and the poll is open', () => {
    const { rerender } = render(
      <PollCard
        poll={poll}
        canClose={false}
        onVote={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.queryByText('Luk afstemningen')).toBeNull()

    rerender(
      <PollCard
        poll={poll}
        canClose={true}
        onVote={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('Luk afstemningen')).toBeTruthy()
  })

  it('calls onClose when the creator closes the poll', () => {
    const onClose = vi.fn()
    render(
      <PollCard
        poll={poll}
        canClose={true}
        onVote={vi.fn()}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByText('Luk afstemningen'))
    expect(onClose).toHaveBeenCalled()
  })

  it('disables voting and hides the close button once the poll is closed', () => {
    render(
      <PollCard
        poll={{ ...poll, closed: true }}
        canClose={true}
        onVote={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('Afstemningen er lukket.')).toBeTruthy()
    expect(screen.queryByText('Luk afstemningen')).toBeNull()
    for (const button of screen.getAllByRole('button')) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }
  })
})
