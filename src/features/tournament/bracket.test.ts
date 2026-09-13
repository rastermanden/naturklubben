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

    const round1Bye = round1.find((m) => m.bye)!
    expect(round1Bye).toMatchObject({
      participant2Id: null,
      status: 'completed',
    })
    expect(round1Bye.winnerId).toBe(round1Bye.participant1Id)

    // Runde 1-byens vinder skal spille en RIGTIG kamp i runde 2 -- aldrig
    // gives endnu en bye, før vedkommende selv har vundet en rigtig kamp.
    // Ellers kunne den samme deltager nå finalen uden at have spillet en
    // eneste kamp (den fejl, denne test dækker).
    const byeWinnersRound2Match = round2.find(
      (m) =>
        m.participant1Id === round1Bye.winnerId ||
        m.participant2Id === round1Bye.winnerId,
    )!
    expect(byeWinnersRound2Match.bye).toBe(false)
    expect(byeWinnersRound2Match.status).toBe('pending')

    // Runde 2's bye går i stedet til en runde-1-vinder, der allerede har
    // bevist sig -- og kan (endnu) ikke afgøres, da den kamp ikke er spillet.
    const round2Bye = round2.find((m) => m.bye)!
    expect(round2Bye).toMatchObject({
      participant1Id: null,
      participant2Id: null,
      status: 'pending',
    })
    expect(round2Bye.matchIndex).not.toBe(byeWinnersRound2Match.matchIndex)

    // Finalen er aldrig en bye, og kender ikke nogen af deltagerne endnu --
    // begge afhænger af runde 2's kampe.
    expect(round3[0]).toMatchObject({
      bye: false,
      status: 'pending',
      participant1Id: null,
      participant2Id: null,
    })
  })

  it('giver aldrig en deltager to byes i træk, heller ikke i en større bracket', () => {
    // Jo flere deltagere, jo flere runder kan have en bye (fx 3 for 9
    // deltagere) -- ingen af dem må nogensinde gå til den samme deltager,
    // før vedkommende har spillet en rigtig kamp imellem.
    for (const n of [5, 9, 13, 17]) {
      const matches = generateSingleEliminationBracket(
        participants(n),
        identityShuffle,
      )
      const byMatchIndex = new Map(
        matches.map((m) => [`${m.round}:${m.matchIndex}`, m]),
      )

      for (const match of matches) {
        if (!match.bye || match.status !== 'completed') continue
        if (match.nextMatchRound === null || match.nextMatchIndex === null) {
          continue
        }
        const next = byMatchIndex.get(
          `${match.nextMatchRound}:${match.nextMatchIndex}`,
        )!
        // Den næste kamp, byens vinder rykker videre til, må ikke selv være
        // en anden automatisk afgjort bye for den samme deltager.
        expect(next.bye && next.status === 'completed').toBe(false)
      }
    }
  })

  it('lader turneringens opretter vælge, hvem der sidder over i runde 1', () => {
    const matches = generateSingleEliminationBracket(
      participants(5),
      identityShuffle,
      'p3',
    )
    const round1Bye = matches.find((m) => m.round === 1 && m.bye)
    expect(round1Bye?.participant1Id).toBe('p3')
  })

  it('ignorerer et ugyldigt eller irrelevant valg af hvem der sidder over', () => {
    // Lige antal deltagere -> ingen bye overhovedet, uanset hvad der bedes om.
    const evenMatches = generateSingleEliminationBracket(
      participants(4),
      identityShuffle,
      'p1',
    )
    expect(evenMatches.some((m) => m.bye)).toBe(false)

    // Et id, der ikke er blandt deltagerne, falder tilbage til den normale
    // (tilfældige) udvælgelse i stedet for at fejle.
    const matches = generateSingleEliminationBracket(
      participants(5),
      identityShuffle,
      'does-not-exist',
    )
    const round1Bye = matches.find((m) => m.round === 1 && m.bye)
    expect(round1Bye?.participant1Id).toBe('p5')
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
