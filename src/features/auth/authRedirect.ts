/**
 * Absolut URL til en side i appen -- den slags URL, Supabase skal sende folk
 * tilbage til fra bekræftelses- og nulstillingsmails.
 *
 * `BASE_URL` er `/` i produktion (naturklubben.dk) og
 * `/pr-preview/pr-<nr>/` på et preview-build, så et link, der er
 * udløst fra et preview, også fører tilbage til det preview -- ikke til
 * produktionsappen.
 *
 * Sætter vi den ikke, falder Supabase tilbage på projektets Site URL. Var den
 * forkert -- fx til roden af GitHub Pages-domænet, da appen lå under
 * `/naturklubben/` -- lander alle bekræftelsesmails på en 404.
 */
export function appUrl(path: string): string {
  return new URL(path, `${window.location.origin}${import.meta.env.BASE_URL}`)
    .href
}
