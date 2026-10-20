import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

/**
 * Badges i klienten. Al reglen -- to adminstemmer, "ikke sig selv", rate
 * limit, 24-timers uret -- ligger i `convex/badges.ts`; her hentes og sendes
 * bare. En Convex-query er et abonnement, så kataloget og køen opdaterer sig
 * selv, når en kollega stemmer.
 */
export function useBadgeCatalog() {
  return useQuery(api.badges.catalog)
}

export function useAdminBadgeCatalog() {
  return useQuery(api.badges.adminCatalog)
}

export function useMyBadges() {
  return useQuery(api.badges.myBadges)
}

/** En andens badgevitrine. Profilsiden og medlemslisten kan vise den. */
export function useBadgesFor(profileId: Id<'profiles'>) {
  return useQuery(api.badges.memberBadgesFor, { profileId })
}

export function useMyNominations() {
  return useQuery(api.badges.myNominations)
}

export function usePendingNominations() {
  return useQuery(api.badges.pendingNominations)
}

export function useOpenProductions() {
  return useQuery(api.badges.openProductions)
}

export function useNomineeCandidates() {
  return useQuery(api.badges.nomineeCandidates)
}

export function useBadgeActions() {
  const nominate = useMutation(api.badges.nominate)
  const vote = useMutation(api.badges.vote)
  const claimProduction = useMutation(api.badges.claimProduction)
  const completeProduction = useMutation(api.badges.completeProduction)
  return { nominate, vote, claimProduction, completeProduction }
}

/**
 * Fejlkoderne fra `convex/badges.ts` paa dansk. Convex pakker serverfejlen ind
 * i en tekst med kode og request-id, så der matches på, om koden optræder.
 */
const MESSAGES: [code: string, message: string][] = [
  ['NOT_A_MEMBER', 'Du er ikke medlem af klubben endnu.'],
  ['NOT_ADMIN', 'Kun admins kan gøre det her.'],
  ['BADGE_SELF_NOMINATION', 'Du kan ikke indstille dig selv.'],
  ['BADGE_ALREADY_AWARDED', 'Vedkommende har allerede fået den badge.'],
  ['BADGE_ALREADY_PENDING', 'Der ligger allerede en åben indstilling.'],
  ['BADGE_NOMINATE_RATE_LIMITED', 'Du har indstillet mange på kort tid. Vent lidt.'],
  ['BADGE_REASON_REQUIRED', 'Skriv en begrundelse.'],
  ['BADGE_REASON_TOO_LONG', 'Begrundelsen er for lang.'],
  ['BADGE_INACTIVE', 'Den badge er ikke i brug længere.'],
  ['BADGE_VOTE_NOMINATOR', 'Den, der har indstillet, tæller ikke med.'],
  ['BADGE_VOTE_ALREADY_VOTED', 'Du har allerede stemt på den indstilling.'],
  ['BADGE_VOTE_ALREADY_RESOLVED', 'Indstillingen er allerede afgjort.'],
  [
    'BADGE_PRODUCTION_CLAIMED_BY_OTHER',
    'En anden admin står allerede med opgaven.',
  ],
  ['BADGE_PRODUCTION_ALREADY_DONE', 'Opgaven er allerede markeret færdig.'],
  ['BADGE_DELETE_AWARDED', 'Badgen er delt ud og kan ikke slettes.'],
  ['BADGE_SLUG_TAKEN', 'Der findes allerede en badge med det navn.'],
]

export function badgeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  for (const [code, text] of MESSAGES) {
    if (message.includes(code)) return text
  }
  return 'Badgen kunne ikke gemmes. Prøv igen.'
}
