/**
 * Ikonerne, en aktivitet kan bruge.
 *
 * Listen ligger her og ikke inde i en side, så aktivitetssiden og en kommende
 * admin-formular læser det samme sæt. `id` er præcis den værdi, der står i
 * `activities.icon`. Selve stregerne ligger i ActivityIcon.tsx og er typet efter
 * listen her, så et ikon uden tegning (eller omvendt) er en oversætterfejl.
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
 * tomt: en aktivitet, der er lagt ind før et ikon fandtes -- eller efter det er
 * fjernet igen -- skal stadig kunne vises.
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
