import type { GeneratedMatch } from './types'

export interface BracketParticipant {
  id: string
  seed: number
}

interface RoundPlan {
  round: number
  matches: number
  hasBye: boolean
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
 * Planlægger antal kampe pr. runde ud fra `matches(r) = ceil(entrants(r) / 2)`
 * -- de vindere (inkl. en evt. bye), der rykker videre, bliver entrants(r+1).
 * Er entrants(r) ulige, er der plads til præcis én bye i runde r, aldrig
 * flere. Sammenlignet med at polstre op til nærmeste potens af to og samle
 * alle byes i runde 1 (den gamle model) spreder det byes ud over hele
 * turneringen: 5 deltagere giver fx 1 bye i runde 1 og 1 i runde 2, i stedet
 * for 3 byes, alle i runde 1.
 */
function planRounds(participantCount: number): RoundPlan[] {
  const rounds: RoundPlan[] = []
  let entrants = participantCount
  let round = 1
  while (entrants > 1) {
    const matches = Math.ceil(entrants / 2)
    rounds.push({ round, matches, hasBye: entrants % 2 === 1 })
    entrants = matches
    round += 1
  }
  return rounds
}

/**
 * Genererer en single elimination-bracket. `shuffle` kan overstyres i tests
 * for et deterministisk resultat; appen bruger standard-Fisher-Yates.
 *
 * En bye i runde 1 -- den eneste runde, hvor vi kender de rigtige deltagere
 * ved oprettelsen -- afgøres med det samme (`status: 'completed'`), og dens
 * vinder fylder direkte den plads, vedkommende skal stå på i næste runde. Er
 * den plads *selv* en bye (fordi den udelukkende fødes af denne ene kamp),
 * afgøres den også med det samme, og sådan fortsætter det, så langt kæden af
 * på-hinanden-følgende byes rækker.
 *
 * En bye, hvis eneste plads endnu ikke er kendt her -- fordi den afhænger af
 * en kamp, der endnu ikke er spillet -- kan ikke afgøres ved oprettelsen. Den
 * oprettes i stedet som en almindelig, tom kamp med `bye: true` og bliver
 * afgjort automatisk, i det øjeblik dens ene mulige plads bliver udfyldt --
 * se den tilsvarende kaskade i record_tournament_match_result
 * (20260913140000_tournament_bracket_byes.sql). Bye-pladsen ligger altid
 * sidst i runden (`matches - 1`): det er det, der får næste rundes egen bye
 * til at falde naturligt på det sidste indeks der også, fordi den
 * udelukkende fødes af rundens sidste kampindeks.
 */
export function generateSingleEliminationBracket(
  participants: BracketParticipant[],
  shuffle: <T>(items: T[]) => T[] = defaultShuffle,
): GeneratedMatch[] {
  if (participants.length < 2) {
    throw new Error('En bracket kræver mindst 2 deltagere')
  }

  const rounds = planRounds(participants.length)
  const totalRounds = rounds.length
  const matches: GeneratedMatch[] = []
  const knownSlots = new Map<string, string>()

  function linkToNextRound(round: number, index: number) {
    if (round >= totalRounds) {
      return { nextMatchRound: null, nextMatchIndex: null, nextMatchSlot: null }
    }
    return {
      nextMatchRound: round + 1,
      nextMatchIndex: Math.floor(index / 2),
      nextMatchSlot: (index % 2 === 0 ? 1 : 2) as 1 | 2,
    }
  }

  function recordKnownWinner(
    link: ReturnType<typeof linkToNextRound>,
    winnerId: string,
  ) {
    if (
      link.nextMatchRound !== null &&
      link.nextMatchIndex !== null &&
      link.nextMatchSlot !== null
    ) {
      knownSlots.set(
        `${link.nextMatchRound}:${link.nextMatchIndex}:${link.nextMatchSlot}`,
        winnerId,
      )
    }
  }

  // Runde 1: de eneste kampe, hvor vi allerede kender de rigtige deltagere.
  const round1 = rounds[0]
  const shuffledIds = shuffle(participants.map((participant) => participant.id))
  const byeId = round1.hasBye ? shuffledIds[shuffledIds.length - 1] : null
  const pairedIds = round1.hasBye ? shuffledIds.slice(0, -1) : shuffledIds

  let pairCursor = 0
  for (let index = 0; index < round1.matches; index++) {
    const isByeSlot = round1.hasBye && index === round1.matches - 1
    const link = linkToNextRound(1, index)

    if (isByeSlot && byeId) {
      matches.push({
        round: 1,
        matchIndex: index,
        participant1Id: byeId,
        participant2Id: null,
        winnerId: byeId,
        status: 'completed',
        bye: true,
        ...link,
      })
      recordKnownWinner(link, byeId)
    } else {
      const participant1Id = pairedIds[pairCursor++]
      const participant2Id = pairedIds[pairCursor++]
      matches.push({
        round: 1,
        matchIndex: index,
        participant1Id,
        participant2Id,
        winnerId: null,
        status: 'pending',
        bye: false,
        ...link,
      })
    }
  }

  // Runde 2 og frem: en plads kommer enten fra en allerede kendt bye-vinder
  // (knownSlots, fra en tidligere runde i denne kæde) eller venter på en
  // rigtig kamp i runden før. Er en bye-kamps ene plads allerede kendt her,
  // er kampen selv afgjort med det samme, og dens vinder skal gives videre
  // til den næste runde igen -- muligvis flere gange i træk.
  for (let r = 1; r < totalRounds; r++) {
    const plan = rounds[r]
    for (let index = 0; index < plan.matches; index++) {
      const isByeSlot = plan.hasBye && index === plan.matches - 1
      const link = linkToNextRound(plan.round, index)
      const participant1Id = knownSlots.get(`${plan.round}:${index}:1`) ?? null
      const participant2Id = knownSlots.get(`${plan.round}:${index}:2`) ?? null

      if (isByeSlot && participant1Id) {
        matches.push({
          round: plan.round,
          matchIndex: index,
          participant1Id,
          participant2Id: null,
          winnerId: participant1Id,
          status: 'completed',
          bye: true,
          ...link,
        })
        recordKnownWinner(link, participant1Id)
      } else {
        matches.push({
          round: plan.round,
          matchIndex: index,
          participant1Id,
          participant2Id,
          winnerId: null,
          status: 'pending',
          bye: isByeSlot,
          ...link,
        })
      }
    }
  }

  return matches
}
