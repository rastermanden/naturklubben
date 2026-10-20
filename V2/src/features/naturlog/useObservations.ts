import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'

/**
 * Naturloggens dataadgang. Convex' `useQuery` er abonnementet, så listen
 * opdaterer sig selv, når nogen skriver -- der er intet at invalidationere.
 *
 * Slettetilladelsen regnes på serveren (`observations.list` returnerer
 * `isOwn`/`canDelete`), fordi kun serveren ved, hvem der spørger.
 */
export function useObservations() {
  return useQuery(api.observations.list)
}

export function useObservationActions() {
  const add = useMutation(api.observations.add)
  const update = useMutation(api.observations.update)
  const remove = useMutation(api.observations.remove)
  return { add, update, remove }
}

/**
 * Fejlkoderne fra `convex/observations.ts` oversat til noget, et medlem kan
 * bruge. Convex pakker serverfejlen ind i en tekst med kode og request-id, så
 * der matches på, om koden optræder i beskeden -- ikke på hele strengen.
 */
const MESSAGES: [code: string, message: string][] = [
  ['NOT_A_MEMBER', 'Du er ikke medlem af klubben endnu.'],
  [
    'ACCOUNT_DELETION_RESERVED',
    'Din konto er ved at blive slettet, så du kan ikke skrive i loggen.',
  ],
  ['OBSERVATION_SPECIES_REQUIRED', 'Skriv, hvad du så.'],
  [
    'OBSERVATION_SPECIES_TOO_LONG',
    'Artsnavnet er for langt. Brug det almindelige navn.',
  ],
  ['OBSERVATION_LOCATION_TOO_LONG', 'Stedet er for langt.'],
  ['OBSERVATION_NOTES_TOO_LONG', 'Noterne er for lange.'],
  ['OBSERVATION_DATE_INVALID', 'Vælg en rigtig dato.'],
  ['OBSERVATION_DATE_IN_FUTURE', 'Datoen kan ikke ligge i fremtiden.'],
  [
    'OBSERVATION_POSITION_INCOMPLETE',
    'Positionen skal have både bredde- og længdegrad.',
  ],
  ['OBSERVATION_POSITION_INVALID', 'Positionen er uden for kloden.'],
  ['OBSERVATION_NOT_OWNER', 'Du kan kun rette dine egne fund.'],
  ['OBSERVATION_NOT_ALLOWED', 'Du har ikke rettigheder til at ændre den.'],
]

export function observationErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  for (const [code, text] of MESSAGES) {
    if (message.includes(code)) return text
  }
  return 'Observationen kunne ikke gemmes. Prøv igen.'
}
