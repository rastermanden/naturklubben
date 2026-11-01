import { defineApp } from 'convex/server'
import { v } from 'convex/values'

/**
 * Miljøvariabler, funktionerne læser via `env` fra `_generated/server`.
 * De er valgfrie: mangler de, gælder standarden i koden (feed-token, VAPID)
 * eller svarer den pågældende funktion, at den ikke kan fortsætte
 * (rate-limit-hemmeligheden).
 */
const app = defineApp({
  env: {
    CALENDAR_FEED_TOKEN: v.optional(v.string()),
    RATE_LIMIT_HASH_SECRET: v.optional(v.string()),
    VAPID_SUBJECT: v.optional(v.string()),
    VAPID_PUBLIC_KEY: v.optional(v.string()),
    VAPID_PRIVATE_KEY: v.optional(v.string()),
  },
})

export default app
