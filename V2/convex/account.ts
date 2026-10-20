import { internalMutation, mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { internal } from './_generated/api'
import { v } from 'convex/values'
import { requireProfile } from './authz'
import type { Id } from './_generated/dataModel'

/**
 * Konto: dataudlevering og selvbetjent sletning.
 *
 * Portet fra `supabase/functions/export-account/`,
 * `supabase/functions/delete-account/` og
 * 20260823170000_account_deletion.sql, plus
 * `src/features/account/{exportAccount,deleteAccount}.ts`.
 *
 * Produktbeslutningen er den samme som i #86, og den er en hybrid:
 *
 * - **Personligt indhold slettes permanent:** profil, avatar og billeder (når
 *   galleriet er portet), kalendertilmeldinger, push-abonnementer, præferencer,
 *   leveringslog, nyhedslæsning, egen plads på allowlisten og en eventuel
 *   prøvemedlemsansøgning.
 * - **Fælles historik bevares, men anonymiseres:** begivenheder og
 *   chatbeskeder mister referencen til medlemmet. De tabeller findes ikke i
 *   V2's skema endnu; se `PERSONAL_TABLES` herunder og `deleteAccount` for
 *   listen over, hvad der stadig mangler.
 *
 * Rækkefølgen er også den samme: reservationen sættes *straks* (så profilen
 * ikke kan redigeres, mens sletningen løber), og selve sletningen gennemføres
 * af en planlagt kørsel -- se `convex/crons.ts`. Det er en ændring fra den
 * gamle app, hvor Edge Function'en gjorde det hele i ét kald; her er der ingen
 * Edge Function at gøre det i, og en cron kan genoptage en sletning, der døde
 * midt i.
 */

/** Sætningen, der skal skrives for at bekræfte -- samme som i den gamle app. */
export const ACCOUNT_DELETION_CONFIRMATION = 'SLET MIN KONTO'

/**
 * Hvor længe en reservation gælder. En strandet reservation (providerfejl,
 * afbrudt kørsel) må ikke låse kontoen permanent, så efter 15 minutter regnes
 * den som udløbet og må tages igen -- samme TTL som i den gamle app.
 */
const RESERVATION_TTL_MS = 15 * 60 * 1000

/**
 * Tabeller, hvis rækker er entydigt personlige og skal slettes med kontoen.
 * Listen er den samme, som `20260823170000_account_deletion.sql` fjernede via
 * `on delete cascade`, oversat til Convex, hvor der ikke findes cascade.
 *
 * `events.createdBy` og `messages.userId` står bevidst ikke her: de skal
 * *nulstilles*, ikke slettes, fordi de er klubbens fælles historik. Begge
 * tabeller mangler i V2's skema endnu.
 */
export const PERSONAL_TABLES = [
  'pushSubscriptions',
  'notificationPreferences',
  'pushDeliveries',
  'featureAnnouncementReads',
  'featureAnnouncementPushDeliveries',
] as const

/**
 * Eksporten samler det, medlemmet selv har skrevet eller valgt. Rækkefølgen og
 * feltnavnene følger `export-account/handler.ts`, så et medlem kan genkende sin
 * gamle udlevering -- men kun de dele, V2 har tabeller til endnu.
 *
 * Mangler fra den gamle udlevering, fordi domænet ikke er portet: `messages`,
 * `photos` (med signerede download-URL'er), `photo_comments`,
 * `activity_registrations`, `poll_votes` og `observations`. De tilføjes her, når
 * deres tabeller findes; filerne skal hentes som Convex storage-URL'er i
 * stedet for Supabase-signerede URL'er.
 */
export const exportData = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireProfile(ctx)

    const preferences = await ctx.db
      .query('notificationPreferences')
      .withIndex('by_profile_and_kind', (q) => q.eq('profileId', profile._id))
      .collect()
    const reads = await ctx.db
      .query('featureAnnouncementReads')
      .withIndex('by_profile', (q) => q.eq('profileId', profile._id))
      .collect()
    const email = await profileEmail(ctx, profile)
    const applications =
      email === ''
        ? []
        : await ctx.db
            .query('probationApplications')
            .withIndex('by_email', (q) => q.eq('email', email))
            .collect()

    const exportedAt = Date.now()
    return {
      format: 'naturklubben-account-export',
      version: 1,
      exportedAt,
      account: {
        profileId: profile._id,
        createdAt: profile.createdAt,
      },
      profile: {
        fullName: profile.fullName,
        pronouns: profile.pronouns,
        causes: profile.causes,
        avatarUrl: profile.avatarUrl,
        chatColor: profile.chatColor,
        isAdmin: profile.isAdmin,
        chatNotificationPreference: profile.chatNotificationPreference,
        featureNotificationsEnabled: profile.featureNotificationsEnabled,
      },
      notificationPreferences: preferences.map((row) => ({
        kind: row.kind,
        enabled: row.enabled,
        updatedAt: row.updatedAt,
      })),
      featureAnnouncementReads: reads.map((row) => ({
        announcementId: row.announcementId,
        readAt: row.readAt,
      })),
      probationApplications: applications.map((row) => ({
        fullName: row.fullName,
        email: row.email,
        motivation: row.motivation,
        status: row.status,
        createdAt: row.createdAt,
        reviewedAt: row.reviewedAt,
      })),
      messages: [],
      photos: [],
      photoComments: [],
      activityRegistrations: [],
      pollVotes: [],
      observations: [],
    }
  },
})

/**
 * Auth-brugerens e-mail i små bogstaver, eller en tom streng. Profilen har den
 * ikke selv i V2's skema -- den ligger på `users`, som Convex Auth skriver.
 * Bruges til at finde medlemmets allowlist-række og prøveansøgning.
 */
async function profileEmail(
  ctx: QueryCtx | MutationCtx,
  profile: { userId: Id<'users'> },
): Promise<string> {
  const user = await ctx.db.get(profile.userId)
  return (user?.email ?? '').trim().toLowerCase()
}

/** Findes der en anden administrator, hvis reservation ikke er udløbet? */
async function anotherAdminExists(
  ctx: QueryCtx | MutationCtx,
  profileId: Id<'profiles'>,
  now: number,
) {
  const admins = await ctx.db
    .query('profiles')
    .withIndex('by_admin', (q) => q.eq('isAdmin', true))
    .collect()
  return admins.some(
    (admin) =>
      admin._id !== profileId &&
      (admin.deletionReservedAt === undefined ||
        admin.deletionReservedAt < now - RESERVATION_TTL_MS),
  )
}

/**
 * Reserverer sletningen med det samme og lægger selve arbejdet i køen.
 *
 * Reservationen er det, der gør sidste-admin-tjekket sikkert: en
 * administrator, der er ved at blive slettet, tæller ikke længere som "en
 * anden administrator" for et samtidigt forsøg. Uden det kunne to admins begge
 * læse "der er en anden" og begge forsætte, så klubben stod uden nogen.
 *
 * Kræver kun et medlem og ikke et skrivbart medlem: et gentaget kald efter en
 * strandet sletning skal kunne sætte en ny reservation.
 *
 * **Usikkert punkt:** den gamle app krævede et friskt genlogin, fordi
 * `auth.admin.deleteUser` blev kaldt med en service-nøgle. Convex Auth giver
 * ikke et `last_sign_in_at` på samme måde, så serveren kan ikke selv efterprøve
 * hvor nyligt, adgangskoden blev bekræftet. Indtil det er afklaret, er
 * bekræftelsessætningen det eneste server-side værn, og klienten bør stadig
 * bede om adgangskoden først (se `V2/src/features/account/deleteAccount.ts`).
 */
export const requestDeletion = mutation({
  args: { confirmation: v.string() },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx)
    if (args.confirmation !== ACCOUNT_DELETION_CONFIRMATION) {
      throw new Error('INVALID_CONFIRMATION')
    }

    const now = Date.now()
    if (profile.isAdmin && !(await anotherAdminExists(ctx, profile._id, now))) {
      throw new Error('LAST_ADMIN')
    }

    await ctx.db.patch(profile._id, { deletionReservedAt: now })
    await ctx.scheduler.runAfter(0, internal.account.completeDeletion, {
      profileId: profile._id,
    })
    return null
  },
})

/**
 * Sletter alt, der hører til profilen, og til sidst selve auth-brugeren.
 *
 * Kaldes af `requestDeletion` (straks) og af cron-jobbet
 * `complete-reserved-account-deletions` (som samler op, hvis det første kald
 * døde). Derfor er den idempotent: hver sletning tåler, at rækken allerede er
 * væk, og en profil uden reservation røres ikke.
 */
export const completeDeletion = internalMutation({
  args: { profileId: v.id('profiles') },
  handler: async (ctx, args) => await deleteAccount(ctx, args.profileId),
})

/**
 * Erstatter den del af `delete-account`-functionen, der ikke havde en cron i
 * den gamle app, men som her *er* en cron: en sletning, der blev reserveret,
 * men aldrig gennemført (processen døde, Convex svarede ikke), skal ikke
 * hænge forever. Kører hvert femte minut, se `convex/crons.ts`.
 */
export const completeReservedDeletions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const reserved = await ctx.db
      .query('profiles')
      .filter((q) => q.neq(q.field('deletionReservedAt'), undefined))
      .collect()

    let deleted = 0
    for (const profile of reserved) {
      const result = await deleteAccount(ctx, profile._id)
      if (result.deleted) deleted += 1
    }
    return { deleted }
  },
})

/**
 * Selve sletningen. Rækkefølgen følger `delete-account/index.ts`: filer og
 * personlige rækker først, auth-brugeren til sidst -- så et afbrudt kald aldrig
 * efterlader en konto uden indhold, der stadig kan logge ind.
 *
 * `PERSONAL_TABLES` og `SHARED_TABLES` i filens hovedkommentar er facitlisten
 * fra 20260823170000_account_deletion.sql. Bemærk, at Convex ikke har
 * `on delete cascade`: hver tabel skal ryddes eksplicit, og en ny tabel med en
 * `profileId` skal føjes til her, når den oprettes.
 */
async function deleteAccount(ctx: MutationCtx, profileId: Id<'profiles'>) {
  const profile = await ctx.db.get(profileId)
  if (!profile) return { deleted: false, reason: 'missing' as const }
  if (profile.deletionReservedAt === undefined) {
    return { deleted: false, reason: 'not_reserved' as const }
  }

  const now = Date.now()
  // Tjekket køres igen ved hver kørsel: en reservation kan være blevet
  // gennemført, mens en anden admin nåede at slette sig selv.
  if (profile.isAdmin && !(await anotherAdminExists(ctx, profileId, now))) {
    await ctx.db.patch(profileId, { deletionReservedAt: undefined })
    return { deleted: false, reason: 'last_admin' as const }
  }

  const email = await profileEmail(ctx, profile)

  // 1. Push-abonnementer og leveringslog. Leveringsloggen på abonnementet
  //    (nyhederne) hænger på abonnementet og skal derfor ryddes først.
  const subscriptions = await ctx.db
    .query('pushSubscriptions')
    .withIndex('by_profile', (q) => q.eq('profileId', profileId))
    .collect()
  for (const subscription of subscriptions) {
    const deliveries = await ctx.db
      .query('featureAnnouncementPushDeliveries')
      .withIndex('by_subscription', (q) =>
        q.eq('subscriptionId', subscription._id),
      )
      .collect()
    for (const delivery of deliveries) {
      await ctx.db.delete(delivery._id)
    }
    await ctx.db.delete(subscription._id)
  }

  // 2. Præferencer, leveringslog og nyhedslæsning.
  const preferences = await ctx.db
    .query('notificationPreferences')
    .withIndex('by_profile_and_kind', (q) => q.eq('profileId', profileId))
    .collect()
  for (const preference of preferences) {
    await ctx.db.delete(preference._id)
  }

  const deliveries = await ctx.db
    .query('pushDeliveries')
    .withIndex('by_profile', (q) => q.eq('profileId', profileId))
    .collect()
  for (const delivery of deliveries) {
    await ctx.db.delete(delivery._id)
  }

  const reads = await ctx.db
    .query('featureAnnouncementReads')
    .withIndex('by_profile', (q) => q.eq('profileId', profileId))
    .collect()
  for (const read of reads) {
    await ctx.db.delete(read._id)
  }

  // 3. Medlemsadgang og en eventuel prøveansøgning. Den gamle app gjorde det i
  //    en trigger på auth.users, fordi rækkerne er nøglet på e-mail og ikke på
  //    bruger-id; her gøres det samme her, i samme mutation som resten.
  if (email !== '') {
    const allowed = await ctx.db
      .query('allowedEmails')
      .withIndex('by_email', (q) => q.eq('email', email))
      .collect()
    for (const row of allowed) {
      await ctx.db.delete(row._id)
    }

    const applications = await ctx.db
      .query('probationApplications')
      .withIndex('by_email', (q) => q.eq('email', email))
      .collect()
    for (const application of applications) {
      const applicantSubscriptions = await ctx.db
        .query('probationPushSubscriptions')
        .withIndex('by_application', (q) =>
          q.eq('applicationId', application._id),
        )
        .collect()
      for (const subscription of applicantSubscriptions) {
        await ctx.db.delete(subscription._id)
      }
      await ctx.db.delete(application._id)
    }
  }

  // 4. Revisionssporet bevares som fælles sikkerhedshistorik, men navnene
  //    anonymiseres. Convex har ingen fremmednøgler, så id'et kan blive
  //    stående uden at pege på noget.
  const roleChanges = await ctx.db.query('adminRoleChanges').collect()
  for (const change of roleChanges) {
    const asActor = change.actorId === profileId
    const asTarget = change.targetId === profileId
    if (!asActor && !asTarget) continue
    await ctx.db.patch(change._id, {
      ...(asActor ? { actorName: 'Tidligere medlem' } : {}),
      ...(asTarget ? { targetName: 'Tidligere medlem' } : {}),
    })
  }

  // 5. Filer. TODO(storage): når galleriet og avataren er portet, skal
  //    `ctx.storage.delete(...)` kaldes for hvert storage-id, der hænger på
  //    medlemmets dokumenter -- i den gamle app var det præfikset
  //    `${userId}/` i buckets `avatars`, `photos-original` og
  //    `photos-optimized`. De tabeller findes ikke i V2's skema endnu, så der
  //    er intet at liste; se rapporten.

  // 6. Auth-brugeren til sidst: sessioner, tokens, login-konti og til sidst
  //    brugeren. Rækkefølgen er vigtig -- en session, der peger på en slettet
  //    bruger, er en fejl, Convex Auth ikke kan læse.
  //
  //    Opslagene bruger `filter` og ikke et indeks, fordi indeksnavnene hører
  //    til `@convex-dev/auth` og ikke til dette domæne. Det er en fuld
  //    gennemlæsning, men den kører én gang pr. konto.
  const sessions = await ctx.db
    .query('authSessions')
    .filter((q) => q.eq(q.field('userId'), profile.userId))
    .collect()
  for (const session of sessions) {
    const refreshTokens = await ctx.db
      .query('authRefreshTokens')
      .filter((q) => q.eq(q.field('sessionId'), session._id))
      .collect()
    for (const token of refreshTokens) {
      await ctx.db.delete(token._id)
    }
    await ctx.db.delete(session._id)
  }

  const accounts = await ctx.db
    .query('authAccounts')
    .filter((q) => q.eq(q.field('userId'), profile.userId))
    .collect()
  for (const account of accounts) {
    const codes = await ctx.db
      .query('authVerificationCodes')
      .filter((q) => q.eq(q.field('accountId'), account._id))
      .collect()
    for (const code of codes) {
      await ctx.db.delete(code._id)
    }
    await ctx.db.delete(account._id)
  }

  // 7. Profilen og til sidst auth-brugeren.
  await ctx.db.delete(profile._id)
  await ctx.db.delete(profile.userId)

  return { deleted: true, reason: 'deleted' as const }
}
