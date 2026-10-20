import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * Medlemmer, adgangskontrol og administratormarked.
 *
 * Oversat fra de Postgres-tabeller, der havde samme rolle: `profiles`,
 * `allowed_emails` og `admin_role_changes`. Feltnavnene er camelCase, fordi
 * Convex-dokumenter er JavaScript-objekter hele vejen igennem -- der er ingen
 * databasekolonne at oversætte til.
 *
 * Bemærk hvad der *ikke* findes her: ingen rolle-kolonne på auth-brugeren, ingen
 * politikker. `profiles` er stedet, al autorisation læser fra, og reglerne står
 * i `convex/authz.ts` -- se V2/README.md, "Autorisation".
 */
export const memberTables = {
  profiles: defineTable({
    /** Auth-brugeren (Convex Auth's `users`). 1:1. */
    userId: v.id('users'),
    fullName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    isAdmin: v.boolean(),
    /** Boblefarve i chatten. Default som i den gamle app: #16a34a. */
    chatColor: v.string(),
    pronouns: v.optional(v.string()),
    causes: v.array(v.string()),
    chatNotificationPreference: v.union(
      v.literal('all'),
      v.literal('mentions'),
      v.literal('none'),
    ),
    featureNotificationsEnabled: v.boolean(),
    /**
     * Sat, når en sletning er reserveret. Brugeren må ikke redigere sin profil
     * derefter, og en cron fjerner kontoen. Erstatter den gamle app's
     * `deletion_reserved_at`.
     */
    deletionReservedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_admin', ['isAdmin']),

  /**
   * Medlemslisten. Signup afvises, hvis e-mailen ikke står her -- i den gamle
   * app var det en trigger på `auth.users`, her er det et opslag i
   * `members.signUp`/(se `convex/members.ts`). Adressen gemmes i små bogstaver;
   * Postgres brugte `citext`, Convex har ingen typespecifikke kollationer.
   */
  allowedEmails: defineTable({
    email: v.string(),
  }).index('by_email', ['email']),

  /** Revisionsspor for "gør X til admin / fjern admin". */
  adminRoleChanges: defineTable({
    actorId: v.id('profiles'),
    actorName: v.string(),
    targetId: v.id('profiles'),
    targetName: v.string(),
    oldIsAdmin: v.boolean(),
    newIsAdmin: v.boolean(),
    changedAt: v.number(),
  }).index('by_changed_at', ['changedAt']),
}
