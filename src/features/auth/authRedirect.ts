/**
 * Absolut URL til en side i appen -- den slags URL, Supabase skal sende folk
 * tilbage til fra bekræftelses- og nulstillingsmails.
 *
 * `BASE_URL` er `/naturklubben/` i produktion og
 * `/naturklubben/pr-preview/pr-<nr>/` på et preview-build, så et link, der er
 * udløst fra et preview, også fører tilbage til det preview -- ikke til
 * produktionsappen.
 *
 * Sætter vi den ikke, falder Supabase tilbage på projektets Site URL. Var den
 * sat til roden af GitHub Pages-domænet (uden `/naturklubben/`), landede alle
 * bekræftelsesmails på GitHubs "There isn't a GitHub Pages site here"-404.
 */
export function appUrl(path: string): string {
  return new URL(path, `${window.location.origin}${import.meta.env.BASE_URL}`)
    .href
}
