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
    /**
     * Kun preview-deploymentet. `previewSeed:ensure` nægter at oprette
     * testbrugeren, medmindre denne er præcis `1`. Sættes ikke i produktion.
     */
    PREVIEW_SEED: v.optional(v.string()),
    PREVIEW_TEST_EMAIL: v.optional(v.string()),
    PREVIEW_TEST_PASSWORD: v.optional(v.string()),
    /** Resend. Uden den logges auth-mailen i stedet for at blive sendt. */
    RESEND_API_KEY: v.optional(v.string()),
    /** Afsender, fx `Naturklubben <noreply@naturklubben.dk>`. */
    AUTH_EMAIL_FROM: v.optional(v.string()),
  },
})

export default app
