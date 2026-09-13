import type { GeneratedMatch } from './types'

export interface BracketParticipant {
  id: string
  seed: number
}

function nextPowerOfTwo(n: number): number {
  let size = 1
  while (size < n) size *= 2
  return size
}

function defaultShuffle<T>(items: T[]): T[] {
  const shuffled = [...items]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

/**
 * Genererer en single elimination-bracket. Er antallet af deltagere ikke en
 * potens af to, lodtrækkes der ("lod ... bye i runde 1", jf. #229): de
 * deltagere, en fuld bracket ville have haft modstandere til, trækkes til at
 * gå direkte videre i runde 1 -- byes forekommer kun der, aldrig i senere
 * runder, fordi antallet af videre-rykkede (byes + kampvindere) altid
 * lander på en potens af to.
 *
 * `shuffle` kan overstyres i tests for et deterministisk resultat; appen
 * bruger standard-Fisher-Yates.
 */
export function generateSingleEliminationBracket(
  participants: BracketParticipant[],
  shuffle: <T>(items: T[]) => T[] = defaultShuffle,
): GeneratedMatch[] {
  if (participants.length < 2) {
    throw new Error('En bracket kræver mindst 2 deltagere')
  }

  const bracketSize = nextPowerOfTwo(participants.length)
  const totalRounds = Math.log2(bracketSize)
  const numByes = bracketSize - participants.length

  const shuffledIds = shuffle(participants.map((participant) => participant.id))
  const byeIds = shuffledIds.slice(0, numByes)
  const pairedIds = shuffledIds.slice(numByes)

  const matches: GeneratedMatch[] = []
  let matchIndex = 0

  function linkToNextRound(index: number) {
    if (totalRounds <= 1) {
      return { nextMatchRound: null, nextMatchIndex: null, nextMatchSlot: null }
    }
    return {
      nextMatchRound: 2,
      nextMatchIndex: Math.floor(index / 2),
      nextMatchSlot: (index % 2 === 0 ? 1 : 2) as 1 | 2,
    }
  }

  for (const byeId of byeIds) {
    matches.push({
      round: 1,
      matchIndex,
      participant1Id: byeId,
      participant2Id: null,
      winnerId: byeId,
      status: 'completed',
      ...linkToNextRound(matchIndex),
    })
    matchIndex++
  }

  for (let i = 0; i < pairedIds.length; i += 2) {
    matches.push({
      round: 1,
      matchIndex,
      participant1Id: pairedIds[i],
      participant2Id: pairedIds[i + 1],
      winnerId: null,
      status: 'pending',
      ...linkToNextRound(matchIndex),
    })
    matchIndex++
  }

  // Byes er allerede afgjort -- deres vinder fylder direkte den plads,
  // vedkommende skal stå på i runde 2.
  const knownSlots = new Map<string, string>()
  for (const match of matches) {
    if (
      match.winnerId &&
      match.nextMatchRound !== null &&
      match.nextMatchIndex !== null &&
      match.nextMatchSlot !== null
    ) {
      knownSlots.set(
        `${match.nextMatchRound}:${match.nextMatchIndex}:${match.nextMatchSlot}`,
        match.winnerId,
      )
    }
  }

  for (let round = 2; round <= totalRounds; round++) {
    const matchesInRound = bracketSize / 2 ** round
    const isFinal = round === totalRounds

    for (let index = 0; index < matchesInRound; index++) {
      matches.push({
        round,
        matchIndex: index,
        participant1Id: knownSlots.get(`${round}:${index}:1`) ?? null,
        participant2Id: knownSlots.get(`${round}:${index}:2`) ?? null,
        winnerId: null,
        status: 'pending',
        nextMatchRound: isFinal ? null : round + 1,
        nextMatchIndex: isFinal ? null : Math.floor(index / 2),
        nextMatchSlot: isFinal ? null : ((index % 2 === 0 ? 1 : 2) as 1 | 2),
      })
    }
  }

  return matches
}
