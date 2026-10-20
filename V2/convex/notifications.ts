import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import { requireProfile, requireWritableProfile } from './authz'
import {
  NOTIFICATION_KINDS,
  notificationKind,
  type NotificationKind,
} from './tables/notifications'

/**
 * Medlemmets egne til/fra-valg pr. notifikationstype.
 *
 * Portet fra `set_notification_preference` og `notification_preferences` i
 * 20260913150000_push_notification_types.sql og
 * `src/features/notifications/useNotificationPreferences.ts`.
 *
 * Valget hører til personen og ikke til installationen, ligesom
 * `chatNotificationPreference`: slår man påmindelser fra på telefonen, skal
 * computeren også tie. Filtreringen sker på serveren i
 * `convex/push.ts` (`prepareDeliveries`) -- en klient kan ikke undlade at
 * modtage en notifikation, den allerede har fået.
 *
 * Ingen række betyder "ja tak": typerne er slået til for alle, også dem der var
 * medlem før typen fandtes.
 */

function allEnabled(): Record<NotificationKind, boolean> {
  const preferences = {} as Record<NotificationKind, boolean>
  for (const kind of NOTIFICATION_KINDS) preferences[kind] = true
  return preferences
}

/**
 * Medlemmets egne valg. Der er ingen parameter for hvem: svaret er altid den
 * indloggedes. Det er hele pointen -- i den gamle app var det en RLS-politik,
 * her er det, at funktionen ikke kan spørge om nogen anden.
 */
export const preferences = query({
  args: {},
  handler: async (ctx): Promise<Record<NotificationKind, boolean>> => {
    const profile = await requireProfile(ctx)
    const rows = await ctx.db
      .query('notificationPreferences')
      .withIndex('by_profile_and_kind', (q) => q.eq('profileId', profile._id))
      .collect()

    const preferences = allEnabled()
    for (const row of rows) {
      preferences[row.kind] = row.enabled !== false
    }
    return preferences
  },
})

/**
 * Gemmer ét valg. Skrivningen går gennem denne mutation og ikke gennem en
 * tabel-adgang, så en klient aldrig kan sætte et valg for nogen anden -- samme
 * grund som den gamle RPC med `auth.uid()` i kroppen.
 *
 * `badge_nomination_review` sendes kun til admins; et almindeligt medlem kan
 * gemme valget, men får alligevel aldrig den type.
 */
export const setPreference = mutation({
  args: {
    kind: notificationKind,
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)
    const existing = await ctx.db
      .query('notificationPreferences')
      .withIndex('by_profile_and_kind', (q) =>
        q.eq('profileId', profile._id).eq('kind', args.kind),
      )
      .unique()

    if (existing) {
      await ctx.db.patch(existing._id, {
        enabled: args.enabled,
        updatedAt: Date.now(),
      })
      return null
    }

    await ctx.db.insert('notificationPreferences', {
      profileId: profile._id,
      kind: args.kind,
      enabled: args.enabled,
      updatedAt: Date.now(),
    })
    return null
  },
})
