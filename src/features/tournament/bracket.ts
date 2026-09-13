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

/**
 * En deltager, der endnu skal rykke videre til en senere runde.
 * `knownId` er sat, hvis identiteten allerede er kendt (fx en bye-vinder) --
 * ellers afhænger den af en kamp, der endnu ikke er spillet. `proven`
 * fortæller, om deltageren allerede har vundet en rigtig kamp for at nå
 * hertil: kun det gør dem kvalificeret til at få endnu en bye, se
 * `buildRound` nedenfor. `sourceRound`/`sourceIndex` peger på den kamp, der
 * frembragte denne deltager -- bruges til at sætte dens `nextMatch*`-felter,
 * når vi finder ud af, hvor deltageren skal hen.
 */
interface EntrantToken {
  knownId: string | null
  proven: boolean
  sourceRound: number
  sourceIndex: number
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
 * `preferredByeId` lader turneringens opretter selv vælge, hvem der sidder
 * over i runde 1, i stedet for at det trækkes tilfældigt -- ignoreres, hvis
 * runde 1 slet ikke har en bye (lige antal deltagere), eller id'et ikke
 * matcher en af deltagerne.
 *
 * En bye i runde 1 -- den eneste runde, hvor vi kender de rigtige deltagere
 * ved oprettelsen -- afgøres med det samme (`status: 'completed'`), og dens
 * vinder rykker videre til næste runde. En senere runde kan også få en bye
 * (er entrants(r) ulige), men den skal ALDRIG gives til en deltager, der
 * ikke selv har vundet en rigtig kamp endnu -- ellers ville den samme
 * deltager kunne gå direkte til finalen uden at spille en eneste kamp.
 * `buildRound` foretrækker derfor altid en deltager, der allerede er
 * "bevist" (proven), til den næste bye, og tvinger en endnu ubevist
 * bye-vinder ind i en rigtig kamp i stedet. Kan en bye-plads' eneste
 * fødekamp ikke afgøres her (den afhænger af en kamp, der endnu ikke er
 * spillet), oprettes den som en tom kamp med `bye: true` og afgøres
 * automatisk, når dens ene plads bliver udfyldt -- se den tilsvarende
 * kaskade i record_tournament_match_result
 * (20260913140000_tournament_bracket_byes.sql).
 */
export function generateSingleEliminationBracket(
  participants: BracketParticipant[],
  shuffle: <T>(items: T[]) => T[] = defaultShuffle,
  preferredByeId?: string,
): GeneratedMatch[] {
  if (participants.length < 2) {
    throw new Error('En bracket kræver mindst 2 deltagere')
  }

  const rounds = planRounds(participants.length)
  const totalRounds = rounds.length
  const matches: GeneratedMatch[] = []
  const byPosition = new Map<string, GeneratedMatch>()

  function pushMatch(row: GeneratedMatch): GeneratedMatch {
    matches.push(row)
    byPosition.set(`${row.round}:${row.matchIndex}`, row)
    return row
  }

  function linkFrom(
    token: EntrantToken,
    toRound: number,
    toIndex: number,
    toSlot: 1 | 2,
  ) {
    const source = byPosition.get(`${token.sourceRound}:${token.sourceIndex}`)!
    source.nextMatchRound = toRound
    source.nextMatchIndex = toIndex
    source.nextMatchSlot = toSlot
  }

  // === Runde 1: de eneste kampe, hvor vi kender de rigtige deltagere. ===
  const round1 = rounds[0]
  const shuffledIds = shuffle(participants.map((participant) => participant.id))
  let byeId: string | null = null
  let pairedIds = shuffledIds
  if (round1.hasBye) {
    const chosen =
      preferredByeId && shuffledIds.includes(preferredByeId)
        ? preferredByeId
        : shuffledIds[shuffledIds.length - 1]
    byeId = chosen
    pairedIds = shuffledIds.filter((id) => id !== chosen)
  }

  let entrants: EntrantToken[] = []
  let matchIndex = 0

  if (byeId) {
    pushMatch({
      round: 1,
      matchIndex,
      participant1Id: byeId,
      participant2Id: null,
      winnerId: byeId,
      status: 'completed',
      bye: true,
      nextMatchRound: null,
      nextMatchIndex: null,
      nextMatchSlot: null,
    })
    entrants.push({
      knownId: byeId,
      proven: false,
      sourceRound: 1,
      sourceIndex: matchIndex,
    })
    matchIndex++
  }
  for (let i = 0; i < pairedIds.length; i += 2) {
    pushMatch({
      round: 1,
      matchIndex,
      participant1Id: pairedIds[i],
      participant2Id: pairedIds[i + 1],
      winnerId: null,
      status: 'pending',
      bye: false,
      nextMatchRound: null,
      nextMatchIndex: null,
      nextMatchSlot: null,
    })
    entrants.push({
      knownId: null,
      proven: true,
      sourceRound: 1,
      sourceIndex: matchIndex,
    })
    matchIndex++
  }

  // === Runde 2 og frem. ===
  for (let round = 2; round <= totalRounds; round++) {
    const plan = rounds[round - 1]

    // Foretrækker en deltager, der allerede har vundet en rigtig kamp, til
    // denne rundes bye -- kun der er ingen risiko for, at nogen når finalen
    // uden nogensinde at have spillet. Findes der ingen (bør ikke kunne ske
    // i praksis, se planRounds), falder den tilbage til den første deltager
    // fremfor at fejle.
    let byeToken: EntrantToken | null = null
    let paired = entrants
    if (plan.hasBye) {
      const index = entrants.findIndex((entrant) => entrant.proven)
      const chosenIndex = index === -1 ? 0 : index
      byeToken = entrants[chosenIndex]
      paired = entrants.filter((_, i) => i !== chosenIndex)
    }

    const nextEntrants: EntrantToken[] = []
    let index = 0

    for (let i = 0; i < paired.length; i += 2) {
      const a = paired[i]
      const b = paired[i + 1]
      pushMatch({
        round,
        matchIndex: index,
        participant1Id: a.knownId,
        participant2Id: b.knownId,
        winnerId: null,
        status: 'pending',
        bye: false,
        nextMatchRound: null,
        nextMatchIndex: null,
        nextMatchSlot: null,
      })
      linkFrom(a, round, index, 1)
      linkFrom(b, round, index, 2)
      nextEntrants.push({
        knownId: null,
        proven: true,
        sourceRound: round,
        sourceIndex: index,
      })
      index++
    }

    if (byeToken) {
      const resolved = byeToken.knownId
      pushMatch({
        round,
        matchIndex: index,
        participant1Id: resolved,
        participant2Id: null,
        winnerId: resolved,
        status: resolved ? 'completed' : 'pending',
        bye: true,
        nextMatchRound: null,
        nextMatchIndex: null,
        nextMatchSlot: null,
      })
      linkFrom(byeToken, round, index, 1)
      nextEntrants.push({
        knownId: resolved,
        proven: byeToken.proven,
        sourceRound: round,
        sourceIndex: index,
      })
      index++
    }

    entrants = nextEntrants
  }

  return matches
}
