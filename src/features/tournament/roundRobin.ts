import type { GeneratedMatch } from './types'

/** Hver deltager møder alle andre præcis én gang. */
export function generateRoundRobinMatches(
  participantIds: string[],
): GeneratedMatch[] {
  const matches: GeneratedMatch[] = []
  let matchIndex = 0

  for (let i = 0; i < participantIds.length; i++) {
    for (let j = i + 1; j < participantIds.length; j++) {
      matches.push({
        round: 1,
        matchIndex: matchIndex++,
        participant1Id: participantIds[i],
        participant2Id: participantIds[j],
        winnerId: null,
        status: 'pending',
        bye: false,
        nextMatchRound: null,
        nextMatchIndex: null,
        nextMatchSlot: null,
      })
    }
  }

  return matches
}

export interface StandingsGame {
  winnerId: string
}

export interface StandingsMatch {
  participant1Id: string
  participant2Id: string
  winnerId: string | null
  games: StandingsGame[]
}

export interface Standing {
  participantId: string
  played: number
  won: number
  lost: number
  gamesWon: number
  gamesLost: number
}

/** Kampe spillet/vundet/tabt samt enkeltspilsejre/-nederlag pr. deltager. */
export function computeStandings(
  participantIds: string[],
  matches: StandingsMatch[],
): Standing[] {
  const byId = new Map<string, Standing>(
    participantIds.map((id) => [
      id,
      {
        participantId: id,
        played: 0,
        won: 0,
        lost: 0,
        gamesWon: 0,
        gamesLost: 0,
      },
    ]),
  )

  for (const match of matches) {
    for (const game of match.games) {
      const gameLoserId =
        game.winnerId === match.participant1Id
          ? match.participant2Id
          : match.participant1Id
      const gameWinner = byId.get(game.winnerId)
      const gameLoser = byId.get(gameLoserId)
      if (gameWinner) gameWinner.gamesWon += 1
      if (gameLoser) gameLoser.gamesLost += 1
    }

    if (!match.winnerId) continue
    const loserId =
      match.winnerId === match.participant1Id
        ? match.participant2Id
        : match.participant1Id
    const winner = byId.get(match.winnerId)
    const loser = byId.get(loserId)
    if (!winner || !loser) continue

    winner.played += 1
    winner.won += 1
    loser.played += 1
    loser.lost += 1
  }

  return Array.from(byId.values())
}

/** Indbyrdes sejre, men kun i kampe mellem to medlemmer af samme gruppe. */
function headToHeadWinsWithinGroup(
  groupIds: Set<string>,
  matches: StandingsMatch[],
): Map<string, number> {
  const wins = new Map<string, number>([...groupIds].map((id) => [id, 0]))

  for (const match of matches) {
    if (
      match.winnerId &&
      groupIds.has(match.participant1Id) &&
      groupIds.has(match.participant2Id)
    ) {
      wins.set(match.winnerId, (wins.get(match.winnerId) ?? 0) + 1)
    }
  }

  return wins
}

function gameDiff(standing: Standing): number {
  return standing.gamesWon - standing.gamesLost
}

/**
 * Rangerer stillingen efter (1) kampsejre, (2) indbyrdes opgør mellem lige
 * mange kampsejre, (3) forskel i enkeltspilsejre. Deltagere, der stadig
 * ikke kan adskilles, beholder deres indbyrdes rækkefølge fra `standings`.
 */
export function rankStandings(
  standings: Standing[],
  matches: StandingsMatch[],
): Standing[] {
  const groups: Standing[][] = []
  for (const standing of [...standings].sort((a, b) => b.won - a.won)) {
    const currentGroup = groups.at(-1)
    if (currentGroup && currentGroup[0].won === standing.won) {
      currentGroup.push(standing)
    } else {
      groups.push([standing])
    }
  }

  return groups.flatMap((group) =>
    group.length === 1 ? group : rankTiedGroup(group, matches),
  )
}

function rankTiedGroup(
  group: Standing[],
  matches: StandingsMatch[],
): Standing[] {
  const groupIds = new Set(group.map((standing) => standing.participantId))
  const headToHeadWins = headToHeadWinsWithinGroup(groupIds, matches)

  return [...group].sort((a, b) => {
    const headToHeadDiff =
      (headToHeadWins.get(b.participantId) ?? 0) -
      (headToHeadWins.get(a.participantId) ?? 0)
    if (headToHeadDiff !== 0) return headToHeadDiff

    return gameDiff(b) - gameDiff(a)
  })
}

/**
 * Deltagerne i førstepladsen -- mere end én, hvis ingen af tiebreakerne
 * (indbyrdes opgør, enkeltspilsforskel) kan skille dem. Bruges til at vise
 * "delt førsteplads" i stedet for at kåre en tilfældig vinder, når stillingen
 * reelt er uafgjort. `rankedStandings` skal komme fra `rankStandings`.
 */
export function sharedLeaders(
  rankedStandings: Standing[],
  matches: StandingsMatch[],
): Standing[] {
  if (rankedStandings.length === 0) return []

  const [first] = rankedStandings
  const tiedByWins = rankedStandings.filter((s) => s.won === first.won)
  if (tiedByWins.length === 1) return [first]

  const groupIds = new Set(tiedByWins.map((s) => s.participantId))
  const headToHeadWins = headToHeadWinsWithinGroup(groupIds, matches)
  const firstHeadToHead = headToHeadWins.get(first.participantId) ?? 0
  const firstDiff = gameDiff(first)

  return tiedByWins.filter(
    (s) =>
      (headToHeadWins.get(s.participantId) ?? 0) === firstHeadToHead &&
      gameDiff(s) === firstDiff,
  )
}
