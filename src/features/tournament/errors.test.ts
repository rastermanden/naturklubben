import { describe, expect, it } from 'vitest'
import { messageForMember } from './errors'

const fallback = 'Resultatet kunne ikke gemmes. Prøv igen.'

describe('messageForMember', () => {
  it('viser RPC-beskeden, når den er skrevet til medlemmerne', () => {
    expect(
      messageForMember(
        { code: '22023', message: 'Kampen er allerede afgjort' },
        fallback,
      ),
    ).toBe('Kampen er allerede afgjort')
  })

  it('skjuler alt andet bag den generelle besked', () => {
    // En rå databasefejl -- fx unique-nøglen på enkeltspil -- siger
    // medlemmerne intet og skal ikke ud i brugerfladen.
    expect(
      messageForMember(
        {
          code: '23505',
          message:
            'duplicate key value violates unique constraint "tournament_games_match_id_game_number_key"',
        },
        fallback,
      ),
    ).toBe(fallback)
    expect(messageForMember(new Error('Failed to fetch'), fallback)).toBe(
      fallback,
    )
    expect(messageForMember(null, fallback)).toBe(fallback)
    expect(messageForMember('noget gik galt', fallback)).toBe(fallback)
  })

  it('falder tilbage, hvis beskeden er tom', () => {
    expect(messageForMember({ code: '22023', message: '   ' }, fallback)).toBe(
      fallback,
    )
    expect(messageForMember({ code: '22023' }, fallback)).toBe(fallback)
  })
})
