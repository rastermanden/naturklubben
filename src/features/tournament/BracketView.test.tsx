import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BracketView } from './BracketView'
import type { TournamentMatch } from './types'

afterEach(cleanup)

const names: Record<string, string> = {
  p1: 'Anna',
  p2: 'Bo',
  p3: 'Carl',
  p4: 'Dina',
  p5: 'Erik',
  p6: 'Frida',
}
const nameFor = (id: string) => names[id] ?? 'Ukendt'

function match(overrides: Partial<TournamentMatch> = {}): TournamentMatch {
  return {
    id: 'm',
    tournament_id: 't',
    round: 1,
    match_index: 0,
    participant1_id: null,
    participant2_id: null,
    winner_id: null,
    status: 'pending',
    next_match_id: null,
    next_match_slot: null,
    bye: false,
    best_of: 3,
    ...overrides,
  }
}

/** Samme form som bracket.ts laver til 6 deltagere: 3 rigtige kampe i runde
 * 1, en rigtig kamp og en bye i runde 2, og finalen. */
function sixPlayerBracket(): TournamentMatch[] {
  return [
    match({
      id: 'r1a',
      round: 1,
      match_index: 0,
      participant1_id: 'p1',
      participant2_id: 'p2',
      next_match_id: 'r2bye',
      next_match_slot: 1,
    }),
    match({
      id: 'r1b',
      round: 1,
      match_index: 1,
      participant1_id: 'p3',
      participant2_id: 'p4',
      next_match_id: 'r2real',
      next_match_slot: 1,
    }),
    match({
      id: 'r1c',
      round: 1,
      match_index: 2,
      participant1_id: 'p5',
      participant2_id: 'p6',
      next_match_id: 'r2real',
      next_match_slot: 2,
    }),
    match({
      id: 'r2real',
      round: 2,
      match_index: 0,
      next_match_id: 'final',
      next_match_slot: 1,
    }),
    match({
      id: 'r2bye',
      round: 2,
      match_index: 1,
      bye: true,
      next_match_id: 'final',
      next_match_slot: 2,
    }),
    match({ id: 'final', round: 3, match_index: 0 }),
  ]
}

describe('BracketView', () => {
  it('viser hvilken kamp en tom plads venter på', () => {
    render(<BracketView matches={sixPlayerBracket()} nameFor={nameFor} />)

    // Runde 2's rigtige kamp venter på vinderne af de to runde 1-kampe.
    expect(screen.getByText('Vinder af Carl/Dina')).toBeTruthy()
    expect(screen.getByText('Vinder af Erik/Frida')).toBeTruthy()
    // Bye-kampens udfyldte plads venter på sin ene fødekamp.
    expect(screen.getByText('Vinder af Anna/Bo')).toBeTruthy()
  })

  it('kalder en plads, ingen nogensinde fylder, for en oversidder', () => {
    render(<BracketView matches={sixPlayerBracket()} nameFor={nameFor} />)

    expect(screen.getByText('Oversidder')).toBeTruthy()
    // "Bye" var det gamle ord og sagde ikke medlemmerne noget.
    expect(screen.queryByText('Bye')).toBeNull()
  })

  it('siger "Venter…", når fødekampen selv mangler sine deltagere', () => {
    render(<BracketView matches={sixPlayerBracket()} nameFor={nameFor} />)

    // Finalens to pladser fødes af runde 2, hvor ingen deltagere er kendt
    // endnu -- så der er ikke noget navn at vise.
    expect(screen.getAllByText('Venter…')).toHaveLength(2)
  })

  it('navngiver runderne efter antal kampe, ikke afstanden til finalen', () => {
    render(<BracketView matches={sixPlayerBracket()} nameFor={nameFor} />)

    // 3 kampe i runde 1 er ingen kvartfinale, selvom der er to runder til
    // finalen.
    expect(screen.getByText('Runde 1')).toBeTruthy()
    expect(screen.getByText('Semifinale')).toBeTruthy()
    expect(screen.getByText('Finale')).toBeTruthy()
    expect(screen.queryByText('Kvartfinale')).toBeNull()
  })

  it('kalder en runde med fire kampe for kvartfinalen', () => {
    const quarters = [0, 1, 2, 3].map((index) =>
      match({ id: `q${index}`, round: 1, match_index: index }),
    )
    render(<BracketView matches={quarters} nameFor={nameFor} />)

    expect(screen.getByText('Kvartfinale')).toBeTruthy()
  })
})
