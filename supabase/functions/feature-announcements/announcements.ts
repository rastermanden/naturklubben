// Hvem skal have besked om en ny funktion -- og hvordan ser beskeden ud?
//
// Ligesom chat-push/recipients.ts ligger valget her på serveren og i sin egen
// fil uden Deno- eller npm-afhængigheder, så det kan testes med vitest. En
// klient kan ikke lade være med at modtage en notifikation, den allerede har
// fået; det eneste sted, der kan lade være med at sende, er her.

export interface PushSubscriptionRow {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
}

export interface FeatureAnnouncement {
  id: string
  slug: string
  title: string
  body: string
  path: string | null
}

/** Siden, en nyhed åbner, når notifikationen ikke selv peger et bedre sted hen. */
export const ANNOUNCEMENT_PATH = 'nyheder'

/**
 * Hver nyhed har sit eget tag. Med ét fælles tag ville nyhed nummer to
 * erstatte den første i notifikationsskuffen, og et medlem, der ikke havde set
 * den endnu, ville aldrig få den at se.
 */
export function announcementTag(slug: string) {
  return `naturklubben-nyhed-${slug}`
}

/**
 * Abonnementerne, der skal have besked. Et medlem uden en gemt præference
 * behandles som "ja tak" -- kolonnen har default true, så en manglende værdi
 * betyder, at profilen ikke kunne læses, ikke at medlemmet har sagt nej.
 */
export function selectAnnouncementRecipients({
  subscriptions,
  preferences,
}: {
  subscriptions: readonly PushSubscriptionRow[]
  preferences: ReadonlyMap<string, boolean>
}): PushSubscriptionRow[] {
  return subscriptions.filter(
    (subscription) => preferences.get(subscription.user_id) !== false,
  )
}

export function announcementPayload(announcement: FeatureAnnouncement): string {
  return JSON.stringify({
    title: announcement.title,
    body: announcement.body,
    tag: announcementTag(announcement.slug),
    path: announcement.path ?? ANNOUNCEMENT_PATH,
  })
}

/**
 * Af de abonnementer, der vil have nyheder, dem der ikke allerede har fået
 * netop denne.
 *
 * Et forsøg nummer to findes, fordi ét dødt endpoint kan vælte hele
 * udsendelsen -- ikke fordi de andre skal have beskeden igen. Uden det her
 * ville en nyhed, der fejlede for én enhed, blive gentaget for alle de andre,
 * hver gang udsendelsen blev forsøgt.
 */
export function selectUndeliveredRecipients(
  recipients: readonly PushSubscriptionRow[],
  deliveredSubscriptionIds: ReadonlySet<string>,
): PushSubscriptionRow[] {
  return recipients.filter(
    (subscription) => !deliveredSubscriptionIds.has(subscription.id),
  )
}
