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
      bye: false,
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
    expect(round1.every((m) => m.status === 'pending' && !m.bye)).toBe(true)
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

  it('spreder byes over flere runder ved 5 deltagere i stedet for at samle dem i runde 1', () => {
    const matches = generateSingleEliminationBracket(
      participants(5),
      identityShuffle,
    )

    const round1 = matches.filter((m) => m.round === 1)
    const round2 = matches.filter((m) => m.round === 2)
    const round3 = matches.filter((m) => m.round === 3)

    // 5 deltagere -> 1 bye i runde 1 og 1 i runde 2 (i stedet for den gamle
    // model, der ville polstre op til 8 og give 3 byes, alle i runde 1).
    expect(round1).toHaveLength(3)
    expect(round2).toHaveLength(2)
    expect(round3).toHaveLength(1)

    const round1Byes = round1.filter((m) => m.bye)
    expect(round1Byes).toHaveLength(1)
    expect(round1Byes[0]).toMatchObject({
      participant2Id: null,
      status: 'completed',
    })
    expect(round1Byes[0].winnerId).toBe(round1Byes[0].participant1Id)

    // Runde 2's bye fødes udelukkende af runde 1's bye, hvis vinder allerede
    // er kendt -- den afgøres derfor også med det samme ved oprettelsen.
    const round2Byes = round2.filter((m) => m.bye)
    expect(round2Byes).toHaveLength(1)
    expect(round2Byes[0]).toMatchObject({
      participant2Id: null,
      status: 'completed',
    })
    expect(round2Byes[0].participant1Id).toBe(round1Byes[0].winnerId)
    expect(round2Byes[0].winnerId).toBe(round1Byes[0].winnerId)

    // Den anden runde-2-kamp er en rigtig, endnu uafgjort kamp mellem to
    // runde-1-vindere.
    const round2RealMatches = round2.filter((m) => !m.bye)
    expect(round2RealMatches).toHaveLength(1)
    expect(round2RealMatches[0]).toMatchObject({
      status: 'pending',
      participant1Id: null,
      participant2Id: null,
    })

    // Finalen er aldrig en bye -- men kender allerede den ene deltager
    // (bye-kæden), mens den anden venter på runde 2's rigtige kamp.
    expect(round3[0].bye).toBe(false)
    expect(round3[0].status).toBe('pending')
    expect(
      [round3[0].participant1Id, round3[0].participant2Id].filter(Boolean),
    ).toEqual([round2Byes[0].winnerId])
  })

  it('giver ingen byes ved 7 deltagere ud over runde 1', () => {
    const matches = generateSingleEliminationBracket(
      participants(7),
      identityShuffle,
    )
    const round1 = matches.filter((m) => m.round === 1)

    // 7 deltagere -> 1 bye, i runde 1.
    expect(round1.filter((m) => m.bye)).toHaveLength(1)
    expect(round1).toHaveLength(4)
    expect(matches.filter((m) => m.round === 2)).toHaveLength(2)
    expect(matches.filter((m) => m.round === 3)).toHaveLength(1)
    expect(matches.filter((m) => m.bye)).toHaveLength(1)
  })

  it('giver kun 1 bye ved 6 deltagere, i runde 2 -- ikke 2 byes i runde 1', () => {
    // 6 deltagere er lige, så runde 1 har ingen byes overhovedet (3 rigtige
    // kampe). Runde 2 har 3 entrants (2 runde-1-vindere + 1 til) og dermed
    // præcis 1 bye -- den kan ikke afgøres før runde 1 er spillet, så den
    // oprettes tom og venter på sin ene rigtige fødekamp.
    const matches = generateSingleEliminationBracket(
      participants(6),
      identityShuffle,
    )
    const round1 = matches.filter((m) => m.round === 1)
    const round2 = matches.filter((m) => m.round === 2)
    const round3 = matches.filter((m) => m.round === 3)

    expect(round1).toHaveLength(3)
    expect(round1.every((m) => !m.bye)).toBe(true)

    expect(round2).toHaveLength(2)
    const round2Byes = round2.filter((m) => m.bye)
    expect(round2Byes).toHaveLength(1)
    expect(round2Byes[0]).toMatchObject({
      participant1Id: null,
      participant2Id: null,
      status: 'pending',
    })

    expect(round3).toHaveLength(1)
    expect(matches.filter((m) => m.bye)).toHaveLength(1)
  })

  it('svarer altid til n-1 rigtige eliminationer plus antal byes', () => {
    // Hver rigtig kamp eliminerer præcis én deltager -- der skal altid være
    // n-1 af dem. Hver bye-"kamp" eliminerer ingen, men optager stadig sin
    // egen række, så det samlede kampantal er n-1 plus antallet af byes.
    for (const n of [2, 3, 5, 6, 7, 9, 11, 16]) {
      const matches = generateSingleEliminationBracket(
        participants(n),
        identityShuffle,
      )
      const byeCount = matches.filter((m) => m.bye).length
      expect(matches).toHaveLength(n - 1 + byeCount)

      // Aldrig mere end 1 bye pr. runde.
      const rounds = [...new Set(matches.map((m) => m.round))]
      for (const round of rounds) {
        expect(
          matches.filter((m) => m.round === round && m.bye).length,
        ).toBeLessThanOrEqual(1)
      }
    }
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
