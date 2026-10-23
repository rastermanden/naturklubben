import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

/**
 * Turneringsdata. Convex' `useQuery` er abonnementet, så en kamp, en anden
 * taster ind fra sin telefon, dukker op af sig selv her -- det er hele pointen
 * med et fælles værktøj til én turneringsdag.
 *
 * `detail` springes over, når ingen turnering er valgt (`'skip'`), så siden
 * ikke spørger efter noget, den ikke skal vise.
 */
export function useTournaments() {
  return useQuery(api.tournaments.list)
}

export function useTournament(tournamentId: Id<'tournaments'> | undefined) {
  return useQuery(
    api.tournaments.detail,
    tournamentId === undefined ? 'skip' : { tournamentId },
  )
}

export function useParticipantCandidates() {
  return useQuery(api.tournaments.participantCandidates)
}

export function useTournamentActions() {
  const create = useMutation(api.tournaments.create)
  const record = useMutation(api.tournaments.record)
  const undo = useMutation(api.tournaments.undo)
  const removeTournament = useMutation(api.tournaments.removeTournament)
  return { create, record, undo, removeTournament }
}

/**
 * Fejlkoderne fra `convex/tournaments.ts` oversat til noget, der kan læses
 * midt i en turnering. Convex pakker serverfejlen ind i en tekst med kode og
 * request-id, så der matches på, om koden optræder i beskeden.
 */
const MESSAGES: [code: string, message: string][] = [
  ['NOT_A_MEMBER', 'Du er ikke medlem af klubben endnu.'],
  [
    'ACCOUNT_DELETION_RESERVED',
    'Din konto er ved at blive slettet, så du kan ikke ændre turneringen.',
  ],
  ['TOURNAMENT_TOO_FEW_PARTICIPANTS', 'Vælg mindst to deltagere.'],
  ['TOURNAMENT_TOO_MANY_PARTICIPANTS', 'Der kan højst være 16 deltagere.'],
  ['TOURNAMENT_DUPLICATE_PARTICIPANT', 'En deltager er valgt to gange.'],
  ['TOURNAMENT_PARTICIPANT_NOT_FOUND', 'En af deltagerne findes ikke længere.'],
  ['TOURNAMENT_NOT_FOUND', 'Turneringen findes ikke.'],
  ['TOURNAMENT_NOT_ALLOWED', 'Kun opretteren eller en admin kan slette den.'],
  ['MATCH_NOT_FOUND', 'Kampen findes ikke.'],
  ['MATCH_NOT_COMPLETED', 'Kampen er ikke afgjort endnu.'],
  ['MATCH_ALREADY_COMPLETED', 'Kampen er allerede afgjort.'],
  ['MATCH_IS_BYE', 'En bye afgøres automatisk og kan ikke tastes ind.'],
  ['MATCH_MISSING_PARTICIPANT', 'Kampen mangler stadig en deltager.'],
  ['MATCH_NO_MAJORITY', 'Der mangler en vinder af kampen.'],
  ['MATCH_TOO_MANY_GAMES', 'Der er tastet flere spil, end kampen går over.'],
  ['MATCH_NEXT_COMPLETED', 'Den næste kamp er allerede afgjort -- fortryd den først.'],
  ['GAME_WINNER_NOT_IN_MATCH', 'Et af spillene er vundet af en fremmed.'],
]

export function tournamentErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  for (const [code, text] of MESSAGES) {
    if (message.includes(code)) return text
  }
  return 'Turneringen kunne ikke gemmes. Prøv igen.'
}
