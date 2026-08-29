/**
 * Ikonerne, en aktivitet kan bruge. De lå før som en lukket opslagstabel inde i
 * ActivitiesPage, hvor kun koden kunne se dem. Nu skal admin kunne vælge et
 * ikon i panelet, så listen ligger her -- ét sted, som både aktivitetssiden og
 * admin-formularen læser, så de to aldrig kan komme til at kende hver sit sæt.
 *
 * `id` er præcis den værdi, der står i `activities.icon`. Selve stregerne
 * ligger i ActivityIcon.tsx og er typet efter listen her, så et ikon uden
 * tegning (eller omvendt) er en oversætterfejl.
 */
export const ACTIVITY_ICONS = [
  { id: 'leaf', label: 'Blad' },
  { id: 'footprints', label: 'Fodspor' },
  { id: 'binoculars', label: 'Kikkert' },
  { id: 'trash-2', label: 'Affald' },
] as const

export type ActivityIconId = (typeof ACTIVITY_ICONS)[number]['id']

export const DEFAULT_ACTIVITY_ICON: ActivityIconId = 'leaf'

/**
 * Et ukendt eller manglende ikonnavn falder tilbage til bladet frem for at stå
 * tomt: en aktivitet, der er lagt ind før et ikon fandtes -- eller efter et er
 * fjernet igen -- skal stadig kunne vises, og admin-formularens vælger skal
 * lande på noget, der findes i listen.
 */
export function normalizeActivityIcon(name: string | null): ActivityIconId {
  return (
    ACTIVITY_ICONS.find((icon) => icon.id === name)?.id ?? DEFAULT_ACTIVITY_ICON
  )
}

export function activityIconLabel(name: string | null): string {
  const id = normalizeActivityIcon(name)
  return ACTIVITY_ICONS.find((icon) => icon.id === id)!.label
}
