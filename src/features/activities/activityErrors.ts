/**
 * Oversætter Postgres-fejl fra aktiviteterne til danske beskeder. En rå
 * fejlkode siger ikke den administrator, der sidder med formularen, noget.
 */
export function toFriendlyActivityError(error: unknown): string {
  const property = (name: 'code' | 'message') =>
    typeof error === 'object' && error !== null && name in error
      ? String((error as Record<string, unknown>)[name] ?? '')
      : ''

  const code = property('code')
  const message = property('message')

  if (code === '42501' || code === 'PGRST301') {
    return 'Du har ikke rettigheder til at ændre aktiviteterne. Prøv at logge ind igen.'
  }
  // activities_link_complete: et link uden linktekst -- eller omvendt.
  if (code === '23514' && message.includes('activities_link_complete')) {
    return 'Et link skal have både en adresse og en linktekst -- eller ingen af delene.'
  }
  if (code === '23514') {
    return 'Værdierne kunne ikke gemmes. Tjek felterne og prøv igen.'
  }
  if (code === '23502') {
    return 'Både titel og beskrivelse skal være udfyldt.'
  }
  if (error instanceof Error) return error.message
  return 'Handlingen kunne ikke gennemføres. Prøv igen om lidt.'
}
