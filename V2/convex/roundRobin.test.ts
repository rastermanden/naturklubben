import { describe, expect, it } from 'vitest'
import {
  computeStandings,
  generateRoundRobinMatches,
  rankStandings,
  sharedLeaders,
  type StandingsMatch,
} from './roundRobin'

describe('generateRoundRobinMatches', () => {
  it('lader hver deltager møde alle andre præcis én gang', () => {
    const matches = generateRoundRobinMatches(['a', 'b', 'c', 'd', 'e'])

    expect(matches).toHaveLength(10)
    const pairs = matches.map((match) =>
      [match.participant1Id, match.participant2Id].sort().join('-'),
    )
    expect(new Set(pairs).size).toBe(10)
    for (const match of matches) {
      expect(match.round).toBe(1)
      expect(match.status).toBe('pending')
      expect(match.nextMatchRound).toBeNull()
    }
  })

  it('genererer ingen kampe for én deltager', () => {
    expect(generateRoundRobinMatches(['a'])).toEqual([])
  })
})

describe('computeStandings + rankStandings', () => {
  it('tæller kampe og enkeltspil rigtigt', () => {
    const matches: StandingsMatch[] = [
      {
        participant1Id: 'a',
        participant2Id: 'b',
        winnerId: 'a',
        games: [{ winnerId: 'a' }, { winnerId: 'b' }, { winnerId: 'a' }],
      },
    ]

    const standings = computeStandings(['a', 'b', 'c'], matches)
    const a = standings.find((s) => s.participantId === 'a')!
    const b = standings.find((s) => s.participantId === 'b')!
    const c = standings.find((s) => s.participantId === 'c')!

    expect(a).toMatchObject({
      played: 1,
      won: 1,
      lost: 0,
      gamesWon: 2,
      gamesLost: 1,
    })
    expect(b).toMatchObject({
      played: 1,
      won: 0,
      lost: 1,
      gamesWon: 1,
      gamesLost: 2,
    })
    expect(c).toMatchObject({
      played: 0,
      won: 0,
      lost: 0,
      gamesWon: 0,
      gamesLost: 0,
    })
  })

  it('ranger efter flest kampsejre først', () => {
    const matches: StandingsMatch[] = [
      { participant1Id: 'a', participant2Id: 'b', winnerId: 'a', games: [] },
      { participant1Id: 'a', participant2Id: 'c', winnerId: 'a', games: [] },
      { participant1Id: 'b', participant2Id: 'c', winnerId: 'b', games: [] },
    ]
    const standings = computeStandings(['a', 'b', 'c'], matches)
    const ranked = rankStandings(standings, matches)

    expect(ranked.map((s) => s.participantId)).toEqual(['a', 'b', 'c'])
  })

  it('afgør lige mange kampsejre ved indbyrdes opgør', () => {
    // a og b ender begge med 2 sejr. a slog b indbyrdes (kamp 1), så a skal
    // ligge foran b -- selvom b samlet set har et langt bedre
    // enkeltspilsregnskab (+3 mod a's +1). c og d har ingen sejre og har
    // ikke mødt hinanden, så de forbliver i deres oprindelige rækkefølge.
    const matches: StandingsMatch[] = [
      {
        participant1Id: 'a',
        participant2Id: 'b',
        winnerId: 'a',
        games: [{ winnerId: 'a' }, { winnerId: 'b' }, { winnerId: 'a' }],
      },
      { participant1Id: 'a', participant2Id: 'c', winnerId: 'a', games: [] },
      {
        participant1Id: 'b',
        participant2Id: 'c',
        winnerId: 'b',
        games: [{ winnerId: 'b' }, { winnerId: 'b' }],
      },
      {
        participant1Id: 'b',
        participant2Id: 'd',
        winnerId: 'b',
        games: [{ winnerId: 'b' }, { winnerId: 'b' }],
      },
    ]
    const standings = computeStandings(['a', 'b', 'c', 'd'], matches)
    const ranked = rankStandings(standings, matches)

    expect(ranked.map((s) => s.participantId)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('falder tilbage til enkeltspilsforskel, når indbyrdes opgør ikke skiller', () => {
    // a, b, c har hver 1 sejr i en "sten-saks-papir"-cirkel (intet par kan
    // skilles på indbyrdes opgør inden for gruppen) -- så det er
    // enkeltspilsforskellen, der afgør rækkefølgen.
    const matches: StandingsMatch[] = [
      {
        participant1Id: 'a',
        participant2Id: 'b',
        winnerId: 'a',
        games: [{ winnerId: 'a' }, { winnerId: 'a' }],
      },
      {
        participant1Id: 'b',
        participant2Id: 'c',
        winnerId: 'b',
        games: [{ winnerId: 'b' }, { winnerId: 'c' }, { winnerId: 'b' }],
      },
      {
        participant1Id: 'c',
        participant2Id: 'a',
        winnerId: 'c',
        games: [{ winnerId: 'c' }, { winnerId: 'a' }, { winnerId: 'c' }],
      },
    ]
    const standings = computeStandings(['a', 'b', 'c'], matches)
    const ranked = rankStandings(standings, matches)

    // enkeltspil: a = 3-2 (+1), c = 3-3 (0), b = 2-3 (-1) -- ingen af de tre
    // kan skilles på indbyrdes opgør (hver har 1 sejr i gruppen), så
    // enkeltspilsforskellen afgør rækkefølgen.
    expect(ranked.map((s) => s.participantId)).toEqual(['a', 'c', 'b'])
  })
})

describe('sharedLeaders', () => {
  it('giver kun én leder, når stillingen ikke er uafgjort', () => {
    const matches: StandingsMatch[] = [
      { participant1Id: 'a', participant2Id: 'b', winnerId: 'a', games: [] },
      { participant1Id: 'a', participant2Id: 'c', winnerId: 'a', games: [] },
      { participant1Id: 'b', participant2Id: 'c', winnerId: 'b', games: [] },
    ]
    const standings = computeStandings(['a', 'b', 'c'], matches)
    const ranked = rankStandings(standings, matches)

    expect(sharedLeaders(ranked, matches).map((s) => s.participantId)).toEqual([
      'a',
    ])
  })

  it('finder én leder, når indbyrdes opgør afgør en lige stilling', () => {
    // Samme data som testen for indbyrdes opgør ovenfor: a og b har begge 2
    // sejre, men a slog b direkte -- ikke reelt uafgjort.
    const matches: StandingsMatch[] = [
      {
        participant1Id: 'a',
        participant2Id: 'b',
        winnerId: 'a',
        games: [{ winnerId: 'a' }, { winnerId: 'b' }, { winnerId: 'a' }],
      },
      { participant1Id: 'a', participant2Id: 'c', winnerId: 'a', games: [] },
      {
        participant1Id: 'b',
        participant2Id: 'c',
        winnerId: 'b',
        games: [{ winnerId: 'b' }, { winnerId: 'b' }],
      },
      {
        participant1Id: 'b',
        participant2Id: 'd',
        winnerId: 'b',
        games: [{ winnerId: 'b' }, { winnerId: 'b' }],
      },
    ]
    const standings = computeStandings(['a', 'b', 'c', 'd'], matches)
    const ranked = rankStandings(standings, matches)

    expect(sharedLeaders(ranked, matches).map((s) => s.participantId)).toEqual([
      'a',
    ])
  })

  it('finder én leder, når enkeltspilsforskellen afgør en lige stilling', () => {
    const matches: StandingsMatch[] = [
      {
        participant1Id: 'a',
        participant2Id: 'b',
        winnerId: 'a',
        games: [{ winnerId: 'a' }, { winnerId: 'a' }],
      },
      {
        participant1Id: 'b',
        participant2Id: 'c',
        winnerId: 'b',
        games: [{ winnerId: 'b' }, { winnerId: 'c' }, { winnerId: 'b' }],
      },
      {
        participant1Id: 'c',
        participant2Id: 'a',
        winnerId: 'c',
        games: [{ winnerId: 'c' }, { winnerId: 'a' }, { winnerId: 'c' }],
      },
    ]
    const standings = computeStandings(['a', 'b', 'c'], matches)
    const ranked = rankStandings(standings, matches)

    expect(sharedLeaders(ranked, matches).map((s) => s.participantId)).toEqual([
      'a',
    ])
  })

  it('giver delt førsteplads, når intet kan skille de bedste', () => {
    // a og b har hver 1 sejr, har aldrig mødt hinanden, og har ingen
    // enkeltspil registreret -- helt uafgjort.
    const matches: StandingsMatch[] = [
      { participant1Id: 'a', participant2Id: 'c', winnerId: 'a', games: [] },
      { participant1Id: 'b', participant2Id: 'd', winnerId: 'b', games: [] },
    ]
    const standings = computeStandings(['a', 'b', 'c', 'd'], matches)
    const ranked = rankStandings(standings, matches)

    expect(
      sharedLeaders(ranked, matches)
        .map((s) => s.participantId)
        .sort(),
    ).toEqual(['a', 'b'])
  })

  it('giver en tom liste uden deltagere', () => {
    expect(sharedLeaders([], [])).toEqual([])
  })
})
