/**
 * Turneringens RPC'er bruger sqlstate 22023 til det, der ikke giver mening
 * lige nu -- "Kampen er allerede afgjort", "En bye kan ikke fortrydes" og så
 * videre. De beskeder er skrevet til medlemmerne og siger noget, et "prøv
 * igen" ikke gør, så de vises, som de er. Alt andet (netværk, rettigheder,
 * en rå databasefejl) får den generelle besked: den slags skal medlemmerne
 * ikke læse.
 */
export function messageForMember(error: unknown, fallback: string): string {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === '22023' &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message.trim().length > 0
  ) {
    return error.message
  }
  return fallback
}
