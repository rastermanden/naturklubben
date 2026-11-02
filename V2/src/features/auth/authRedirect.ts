/**
 * Absolut URL til en side i appen -- den adresse, et link i en
 * bekræftelses- eller nulstillingsmail skal føre tilbage til.
 *
 * `BASE_URL` er `/` i produktion og `/pr-preview/pr-<nr>/` på et preview,
 * så et link, der er udløst fra et preview, også fører tilbage til det
 * preview.
 */
export function appUrl(path: string): string {
  return new URL(path, `${window.location.origin}${import.meta.env.BASE_URL}`)
    .href
}
