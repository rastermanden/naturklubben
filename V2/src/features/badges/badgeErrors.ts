/**
 * En fejl, hvis besked allerede er skrevet til et menneske -- så
 * `badgeErrorMessage` lader den gå igennem uændret i stedet for at pakke den
 * ind i en generisk fejltekst.
 */
export class BadgeUserFacingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BadgeUserFacingError'
  }
}
