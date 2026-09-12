// Hvem skal have en notifikation ud over chatten (#216)?
//
// Ren logik uden Deno- eller npm-afhængigheder, så den kan testes med
// `deno test`. Selve databasekaldene -- præferencer, abonnementer, claim i
// leveringsloggen -- ligger i pushDelivery.ts; her er kun udvælgelsen.

export interface PushSubscriptionRow {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
}

/**
 * De medlemmer, der både vil have typen og har mindst én enhed at sende til.
 *
 * Et medlem uden en gemt præference behandles som "ja tak": tabellen har
 * ingen række, før man selv har rørt valget, og de tre typer er slået til
 * for alle fra start. Medlemmer uden abonnement udelades *før* claim'en i
 * leveringsloggen -- ellers ville en, der slår notifikationer til om
 * eftermiddagen, stå som "har fået" en påmindelse, der aldrig blev sendt.
 */
export function selectPushRecipients({
  userIds,
  preferences,
  subscriptions,
}: {
  userIds: readonly string[]
  preferences: ReadonlyMap<string, boolean>
  subscriptions: readonly PushSubscriptionRow[]
}): string[] {
  const subscribed = new Set(subscriptions.map((row) => row.user_id))
  const seen = new Set<string>()
  const recipients: string[] = []
  for (const userId of userIds) {
    if (seen.has(userId)) continue
    seen.add(userId)
    if (preferences.get(userId) === false) continue
    if (!subscribed.has(userId)) continue
    recipients.push(userId)
  }
  return recipients
}

/** Abonnementerne for netop de medlemmer, claim'en gav os. */
export function subscriptionsFor(
  claimedUserIds: readonly string[],
  subscriptions: readonly PushSubscriptionRow[],
): PushSubscriptionRow[] {
  const claimed = new Set(claimedUserIds)
  return subscriptions.filter((row) => claimed.has(row.user_id))
}
