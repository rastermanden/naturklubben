/**
 * Hjertesager: små mærker ved navnet, som medlemmet selv vælger på profilen.
 *
 * Sættet er lukket og spejler check-constrainten profiles_causes_known --
 * databasen kender kun slugs, tegnet og navnet bor her, så de kan rettes uden
 * en migration.
 */
export interface Cause {
  slug: string
  emoji: string
  /** Det, skærmlæseren og tooltippet siger. */
  label: string
}

export const CAUSES: readonly Cause[] = [
  { slug: 'ukraine', emoji: '🇺🇦', label: 'Støtter Ukraine' },
  { slug: 'regnbue', emoji: '🏳️‍🌈', label: 'Regnbueflag' },
  { slug: 'vaccine', emoji: '💉', label: 'Vaccineret' },
]

const bySlug = new Map(CAUSES.map((cause) => [cause.slug, cause]))

/** De valgte mærker i listens faste rækkefølge; ukendte slugs springes over. */
export function selectedCauses(slugs: readonly string[] | null | undefined) {
  if (!slugs) return []
  const chosen = new Set(slugs)
  return CAUSES.filter((cause) => chosen.has(cause.slug))
}

/** Det, der gemmes: kendte slugs, uden dubletter, i listens rækkefølge. */
export function normalizeCauses(slugs: readonly string[]): string[] {
  return selectedCauses(slugs).map((cause) => cause.slug)
}

export function isCause(slug: string): boolean {
  return bySlug.has(slug)
}
