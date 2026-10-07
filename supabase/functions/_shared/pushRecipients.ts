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
 * ingen række, før man selv har rørt valget, og typerne er slået til
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

/**
 * Medlemmerne, claim_push_deliveries gav os. PostgREST leverer en
 * `returns setof uuid` som en liste af strenge -- alt andet er en fejl, der
 * skal standse sendingen: rækkerne i loggen er allerede skrevet, så en
 * fejllæsning her ville stå som "leveret" uden at nogen fik noget.
 */
export function parseClaimedUserIds(data: unknown): string[] {
  if (!Array.isArray(data)) {
    throw new Error(
      `claim_push_deliveries svarede ikke med en liste: ${JSON.stringify(data)}`,
    )
  }
  return data.map((row) => {
    if (typeof row !== 'string') {
      throw new Error(
        `claim_push_deliveries svarede med andet end uuid-strenge: ${JSON.stringify(row)}`,
      )
    }
    return row
  })
}
