import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MatchCard } from './MatchCard'
import type { TournamentMatch } from './types'

afterEach(cleanup)

const nameFor = (id: string) => (id === 'p1' ? 'Alice' : 'Bob')

function pendingMatch(
  overrides: Partial<TournamentMatch> = {},
): TournamentMatch {
  return {
    id: 'm1',
    tournament_id: 't1',
    round: 1,
    match_index: 0,
    participant1_id: 'p1',
    participant2_id: 'p2',
    winner_id: null,
    status: 'pending',
    next_match_id: null,
    next_match_slot: null,
    bye: false,
    ...overrides,
  }
}

const defaultUndoProps = {
  canUndo: false,
  onUndo: vi.fn(),
  undoing: false,
}

describe('MatchCard', () => {
  it('viser det gemte resultat for en afgjort kamp uden inputknapper', () => {
    render(
      <MatchCard
        match={pendingMatch({ status: 'completed', winner_id: 'p1' })}
        nameFor={nameFor}
        onRecordResult={vi.fn()}
        submitting={false}
        {...defaultUndoProps}
      />,
    )

    expect(screen.getByText('Alice vandt')).toBeTruthy()
    expect(screen.queryByText('Alice', { selector: 'button' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Fortryd/ })).toBeNull()
  })

  it('viser en fortryd-knap for en afgjort kamp, når canUndo er sat', () => {
    const onUndo = vi.fn()
    render(
      <MatchCard
        match={pendingMatch({ status: 'completed', winner_id: 'p1' })}
        nameFor={nameFor}
        onRecordResult={vi.fn()}
        submitting={false}
        canUndo
        onUndo={onUndo}
        undoing={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Fortryd resultat' }))
    expect(onUndo).toHaveBeenCalledTimes(1)
  })

  it('udregner kampvinderen efter 2 spilsejre og lader brugeren gemme', () => {
    const onRecordResult = vi.fn()
    render(
      <MatchCard
        match={pendingMatch()}
        nameFor={nameFor}
        onRecordResult={onRecordResult}
        submitting={false}
        {...defaultUndoProps}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Alice' }))
    fireEvent.click(screen.getByRole('button', { name: 'Bob' }))
    // Endnu ikke afgjort (1-1) -- ingen gem-knap, og spil 3 kan vælges.
    expect(screen.queryByRole('button', { name: /Gem resultat/ })).toBeNull()
    expect(screen.getByText('Spil 3: hvem vandt?')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Alice' }))

    const saveButton = screen.getByRole('button', {
      name: 'Gem resultat -- Alice vinder',
    })
    fireEvent.click(saveButton)

    expect(onRecordResult).toHaveBeenCalledWith(['p1', 'p2', 'p1'])
  })

  it('kan fortryde sidste spil, før resultatet gemmes', () => {
    render(
      <MatchCard
        match={pendingMatch()}
        nameFor={nameFor}
        onRecordResult={vi.fn()}
        submitting={false}
        {...defaultUndoProps}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Alice' }))
    expect(screen.getByText('Spil: Alice')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Fortryd sidste spil' }))
    expect(screen.queryByText('Spil: Alice')).toBeNull()
    expect(screen.getByText('Spil 1: hvem vandt?')).toBeTruthy()
  })
})
