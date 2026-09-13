import { describe, expect, it } from 'vitest'
import { generateSingleEliminationBracket } from './bracket'

const identityShuffle = <T>(items: T[]) => items

function participants(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    seed: index + 1,
  }))
}

describe('generateSingleEliminationBracket', () => {
  it('kaster ved under 2 deltagere', () => {
    expect(() =>
      generateSingleEliminationBracket([{ id: 'p1', seed: 1 }]),
    ).toThrow()
  })

  it('laver én kamp (finalen) ved 2 deltagere -- ingen byes', () => {
    const matches = generateSingleEliminationBracket(
      participants(2),
      identityShuffle,
    )

    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({
      round: 1,
      participant1Id: 'p1',
      participant2Id: 'p2',
      status: 'pending',
      nextMatchRound: null,
    })
  })

  it('bygger en fuld bracket uden byes ved en potens af to (4)', () => {
    const matches = generateSingleEliminationBracket(
      participants(4),
      identityShuffle,
    )

    const round1 = matches.filter((m) => m.round === 1)
    const round2 = matches.filter((m) => m.round === 2)
    expect(round1).toHaveLength(2)
    expect(round2).toHaveLength(1)
    expect(round1.every((m) => m.status === 'pending')).toBe(true)
    // Ingen byes: begge runde-1-kampe peger ind i finalen, hver på sin plads.
    expect(round1[0]).toMatchObject({
      nextMatchRound: 2,
      nextMatchIndex: 0,
      nextMatchSlot: 1,
    })
    expect(round1[1]).toMatchObject({
      nextMatchRound: 2,
      nextMatchIndex: 0,
      nextMatchSlot: 2,
    })
  })

  it('giver byes kun i runde 1 ved 5 deltagere, og rykker dem automatisk videre', () => {
    const matches = generateSingleEliminationBracket(
      participants(5),
      identityShuffle,
    )

    const round1 = matches.filter((m) => m.round === 1)
    const round2 = matches.filter((m) => m.round === 2)
    const round3 = matches.filter((m) => m.round === 3)

    // 5 deltagere -> bracket-størrelse 8 -> 3 byes, alle i runde 1.
    const byeMatches = round1.filter((m) => m.participant2Id === null)
    expect(byeMatches).toHaveLength(3)
    for (const bye of byeMatches) {
      expect(bye.status).toBe('completed')
      expect(bye.winnerId).toBe(bye.participant1Id)
    }
    expect(
      round1.filter((m) => m.participant2Id !== null && m.status === 'pending'),
    ).toHaveLength(1)

    expect(round2).toHaveLength(2)
    expect(round3).toHaveLength(1)
    // Ingen byes uden for runde 1.
    for (const match of [...round2, ...round3]) {
      expect(match.status).toBe('pending')
      expect(match.winnerId).toBeNull()
    }
    // Mindst én runde-2-kamp har allerede begge deltagere kendt (to
    // bye-vindere, der nu møder hinanden).
    expect(round2.some((m) => m.participant1Id && m.participant2Id)).toBe(true)
  })

  it('giver ingen byes ved 7 deltagere ud over runde 1', () => {
    const matches = generateSingleEliminationBracket(
      participants(7),
      identityShuffle,
    )
    const round1 = matches.filter((m) => m.round === 1)

    // 7 deltagere -> bracket-størrelse 8 -> 1 bye.
    expect(round1.filter((m) => m.participant2Id === null)).toHaveLength(1)
    expect(round1).toHaveLength(4)
    expect(matches.filter((m) => m.round === 2)).toHaveLength(2)
    expect(matches.filter((m) => m.round === 3)).toHaveLength(1)
  })

  it('spreder byes på tværs af runde 2, så de ikke møder hinanden unødigt', () => {
    // 6 deltagere -> bracket-størrelse 8 -> 2 byes og 2 runde 2-kampe: der
    // er plads til én bye pr. runde 2-kamp, så ingen af dem skal ende med
    // begge byes (og dermed en kamp, der reelt allerede er spillet færdigt,
    // før nogen har rørt en bold).
    const matches = generateSingleEliminationBracket(
      participants(6),
      identityShuffle,
    )
    const round1 = matches.filter((m) => m.round === 1)
    const round2 = matches.filter((m) => m.round === 2)

    expect(round1.filter((m) => m.participant2Id === null)).toHaveLength(2)
    expect(round2).toHaveLength(2)
    // Var begge byes i samme runde 2-kamp, ville den kamp allerede have
    // begge deltagere kendt med det samme -- det må ikke ske her.
    expect(round2.every((m) => !(m.participant1Id && m.participant2Id))).toBe(
      true,
    )
  })

  it('inkluderer alle deltagere præcis én gang i runde 1', () => {
    const all = participants(6)
    const matches = generateSingleEliminationBracket(all, identityShuffle)
    const round1 = matches.filter((m) => m.round === 1)

    const seen = round1.flatMap((m) =>
      [m.participant1Id, m.participant2Id].filter((id): id is string => !!id),
    )
    expect(seen.sort()).toEqual(all.map((p) => p.id).sort())
    expect(new Set(seen).size).toBe(all.length)
  })
})
