import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * Notifikationer ud over chatten: præferencer pr. type, leveringslog og
 * push-abonnementer.
 *
 * Oversat fra `notification_preferences`, `push_deliveries`,
 * `feature_announcement_push_deliveries`, `push_subscriptions` og
 * `push_vapid_keys`. Tom indtil domænet portes -- se `convex/notifications.ts`.
 *
 * To ting fra den gamle model, som skal bevares, når filen fyldes:
 * `kind` skal være en union og ikke en fri streng (den gamle app havde et
 * `check`-constraint), og leveringsloggen skal have et unikt nøglepar, så den
 * samme begivenhed ikke kan sendes to gange til samme medlem.
 */
export const notificationTables = {}
