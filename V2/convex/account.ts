import { internalMutation, mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { internal } from './_generated/api'
import { ConvexError, v } from 'convex/values'
import { requireProfile } from './authz'
import type { Doc, Id } from './_generated/dataModel'

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
 * - **Personligt indhold slettes permanent:** profil, billeder (både rækkerne
 *   og filerne i Convex' fillager), kommentarer, kalendertilmeldinger, opgaver
 *   medlemmet har oprettet, reaktioner, afstemningsstemmer, tilstedeværelse,
 *   ulæst-markering, spillenes resultater, push-abonnementer, præferencer,
 *   leveringslog, nyhedslæsning, egen plads på allowlisten og en eventuel
 *   prøvemedlemsansøgning.
 * - **Fælles historik bevares, men anonymiseres:** begivenheder, chatbeskeder,
 *   afstemninger, naturloggen, de tildelte badges og turneringsstillingerne
 *   mister referencen til medlemmet, men bliver stående. Revisionssporene
 *   (`adminRoleChanges`, `photoModerationLog`) bevares af samme grund, med
 *   navnene erstattet af "Tidligere medlem".
 *
 * Alle domæner er nu portet, så sletningen dækker dem alle. Det er den
 * vigtigste egenskab ved filen: en ny tabel med en `profileId` skal føjes til
 * her i samme ændring, der opretter den -- Convex har ingen `on delete
 * cascade`, og en glemt tabel er et brud på dataopbevaringspolitikken, ikke
 * bare en losrevet reference.
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
 * `eventTasks` og `badgeNominations` er kun delvist personlige: opgaven
 * slettes, når medlemmet har *oprettet* den (en opgave, vedkommende blot var
 * ansvarlig for, bliver stående uden ansvarlig), og indstillingen slettes kun,
 * mens den er `pending` -- en afgjort indstilling er historikken bag et badge,
 * nogen har fået. Se `clearMemberCalendar` og `clearMemberCommunity`.
 *
 * `badgeNominationApprovals.adminId` er et obligatorisk felt, så en slettet
 * administrators stemme kan ikke "nulstilles" -- den slettes, og
 * `approveCount`/`rejectCount` regnes om bagefter, præcis som den gamle app
 * gjorde ved hvert stemme.
 *
 * `events.createdBy`, `messages.authorId`, `observations.createdById`,
 * `chatPolls.createdBy` og `tournaments.*` står bevidst ikke her: de skal
 * *nulstilles*, ikke slettes, fordi de er klubbens fælles historik.
 */
export const PERSONAL_TABLES = [
  'photos',
  'photoComments',
  'eventAttendance',
  'messageReactions',
  'pollVotes',
  'chatPresence',
  'chatReads',
  'gameScores',
  'badgeNominationApprovals',
  'pushSubscriptions',
  'notificationPreferences',
  'pushDeliveries',
  'featureAnnouncementReads',
  'featureAnnouncementPushDeliveries',
] as const

/**
 * Eksporten samler det, medlemmet selv har skrevet eller valgt. Rækkefølgen og
 * feltnavnene følger `export-account/handler.ts`, så et medlem kan genkende sin
 * gamle udlevering -- oversat til de tabeller, V2 nu har.
 *
 * To ting er anderledes end den gamle fil, og det er ikke til at ændre:
 *
 * 1. Der er ingen `signed_urls_expire_at`: Convex' `getUrl` giver faste
 *    adresser uden udløb. De virker, så længe filen findes, og kan kun
 *    trækkes tilbage ved at slette filen -- se sikkerhedsnoten i
 *    `convex/gallery.ts`.
 * 2. `exportedAt` er et tal (ms) og ikke en ISO-streng. Resten af V2 bruger
 *    ms, og filen er en JSON-download, ikke et svar fra en Edge Function.
 *
 * Stadig ikke med, fordi V2 ikke har data til det: `account.email` og
 * `account.lastSignInAt` fra den gamle fil. Convex Auth gemmer adressen på
 * `authAccounts`/`users`, og der findes intet `last_sign_in_at` at udlevere --
 * se den samme usikkerhed i `requestDeletion`.
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

    // Rækkefølgen fra den gamle fil: profil, beskeder, billeder, kommentarer,
    // kalendertilmeldinger, afstemningsstemmer, naturlog -- og derefter det,
    // V2 har mere: spillenes resultater og de tildelte badges.
    const messages = await exportMessages(ctx, profile._id)
    const photos = await exportPhotos(ctx, profile._id)
    const photoComments = await exportPhotoComments(ctx, profile._id)
    const attendance = await exportAttendance(ctx, profile._id)
    const pollVotes = await exportPollVotes(ctx, profile._id)
    const observations = await exportObservations(ctx, profile._id)
    const gameScores = await exportGameScores(ctx, profile._id)
    const memberBadges = await exportMemberBadges(ctx, profile._id)

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
      messages,
      photos,
      photoComments,
      activityRegistrations: attendance,
      pollVotes,
      observations,
      gameScores,
      memberBadges,
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
      throw new ConvexError('INVALID_CONFIRMATION')
    }

    const now = Date.now()
    if (profile.isAdmin && !(await anotherAdminExists(ctx, profile._id, now))) {
      throw new ConvexError('LAST_ADMIN')
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
 * `PERSONAL_TABLES` i filens hovedkommentar er facitlisten fra
 * 20260823170000_account_deletion.sql. Bemærk, at Convex ikke har
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

  // 4. Afgørelser, medlemmet har truffet som administrator, peger på en profil.
  // I den gamle app var `reviewed_by` en fremmednøgle til auth-brugeren med
  // `on delete set null`, så pegepinden forsvandt med kontoen -- her gøres det
  // samme eksplicit, for begge de to ansøgningstabeller.
  const reviewedApplications = await ctx.db
    .query('probationApplications')
    .collect()
  for (const application of reviewedApplications) {
    if (application.reviewedBy === profileId) {
      await ctx.db.patch(application._id, { reviewedBy: undefined })
    }
  }

  // 5. Galleriet: filerne i Convex' fillager, rækkerne, albumtallene,
  //    kommentarerne og moderationsloggen. Bemærk, at avataren ikke har en
  //    fil at slette: `profiles.avatarUrl` er en adresse, ikke et
  //    `Id<'_storage'>` (se skemaet i `tables/members.ts`).
  await deleteMemberGallery(ctx, profileId)

  // 6. Kalenderen: tilmeldinger, opgaver og begivenhedernes ophav.
  await clearMemberCalendar(ctx, profileId)

  // 7. Chatten: beskederne anonymiseres, det personlige ryddes.
  await clearMemberChat(ctx, profileId)

  // 8. Fællesskabet: spillenes resultater slettes, resten anonymiseres.
  await clearMemberCommunity(ctx, profileId)

  // 9. Revisionssporet bevares som fælles sikkerhedshistorik, men navnene
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

  // 10. Auth-brugeren til sidst: sessioner, tokens, login-konti og til sidst
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

  // 11. Profilen og til sidst auth-brugeren.
  await ctx.db.delete(profile._id)
  await ctx.db.delete(profile.userId)

  return { deleted: true, reason: 'deleted' as const }
}

// ---------------------------------------------------------------------------
// Hjælperne, ét domæne ad gangen
//
// Hver hjælper tåler at blive kørt igen: rækkerne findes ved opslag på
// profil-id, og et tomt opslag er ikke en fejl. Det er forudsætningen for, at
// en sletning, der døde midt i, kan genoptages af
// `completeReservedDeletions`.
// ---------------------------------------------------------------------------

/** Navnet, der står i et snapshot i stedet for et slettet medlem. */
const FORMER_MEMBER_NAME = 'Tidligere medlem'

async function albumByKey(ctx: MutationCtx, albumKey: string) {
  return await ctx.db
    .query('photoAlbums')
    .withIndex('by_album_key', (q) => q.eq('albumKey', albumKey))
    .unique()
}

/**
 * Albumtallene efter et slettet billede.
 *
 * **Skal følges ad med `removePhotoFromAlbum` i `convex/gallery.ts`.** Den
 * ligger her som en kopi, fordi den ikke er eksporteret, og fordi en eksport
 * ville gøre galleriet tilgængeligt fra kontosletningen -- men reglerne er de
 * samme: tællingen falder med én, et tomt "Uden begivenhed"-album slettes, og
 * et cover, der pegede på det slettede billede, flyttes til det nyeste `ready`
 * billede i albummet, så albumforsiden aldrig viser en fil, der er væk.
 */
async function removePhotoFromAlbum(ctx: MutationCtx, photo: Doc<'photos'>) {
  const album = await albumByKey(ctx, photo.albumKey)
  if (album === null) return

  const photoCount = Math.max(0, album.photoCount - 1)
  if (photoCount === 0 && album.eventId === undefined) {
    // Et tomt "Uden begivenhed"-album er støj; det oprettes igen ved næste
    // upload. Album med en begivenhed bliver stående som tomt, så det stadig
    // kan findes fra kalenderen.
    await ctx.db.delete(album._id)
    return
  }

  const coverBelongsToPhoto = album.coverPhotoId === photo._id
  const nextCover = coverBelongsToPhoto
    ? await ctx.db
        .query('photos')
        .withIndex('by_album', (q) => q.eq('albumKey', photo.albumKey))
        .order('desc')
        .filter((q) =>
          q.and(
            q.eq(q.field('optimizationStatus'), 'ready'),
            q.neq(q.field('_id'), photo._id),
          ),
        )
        .first()
    : null

  await ctx.db.patch(album._id, {
    photoCount,
    coverPhotoId: coverBelongsToPhoto ? nextCover?._id : album.coverPhotoId,
    coverThumbnailStorageId: coverBelongsToPhoto
      ? nextCover?.thumbnailStorageId
      : album.coverThumbnailStorageId,
    coverOptimizedStorageId: coverBelongsToPhoto
      ? nextCover?.optimizedStorageId
      : album.coverOptimizedStorageId,
    coverCreatedAt: coverBelongsToPhoto
      ? nextCover?.createdAt
      : album.coverCreatedAt,
  })
}

/**
 * Galleriet: medlemmets billeder, filerne bag dem, kommentarerne og
 * moderationsloggen.
 *
 * Rækkefølgen er den samme som i `gallery.deletePhoto`: kommentarerne og
 * albumtallene rettes, filerne slettes gennem `ctx.storage.delete`, og rækken
 * forsvinder til sidst. Convex' mutation er atomisk, så der findes ingen
 * mellemtilstand at prøve igen -- modsat den gamle apps `deleting`-status.
 */
async function deleteMemberGallery(
  ctx: MutationCtx,
  profileId: Id<'profiles'>,
) {
  const photos = await ctx.db
    .query('photos')
    .withIndex('by_uploader', (q) => q.eq('uploaderId', profileId))
    .collect()

  for (const photo of photos) {
    // Kommentarer på medlemmets egne billeder kaskaderede i Postgres og skal
    // væk her, uanset hvem der skrev dem -- billedet findes ikke længere.
    const comments = await ctx.db
      .query('photoComments')
      .withIndex('by_photo', (q) => q.eq('photoId', photo._id))
      .collect()
    for (const comment of comments) {
      await ctx.db.delete(comment._id)
    }

    await removePhotoFromAlbum(ctx, photo)

    // Originalen og de afledte filer. `Set` gør det harmløst, hvis to felter
    // peger på samme fil.
    const storageIds = new Set<Id<'_storage'>>([photo.storageId])
    if (photo.optimizedStorageId !== undefined) {
      storageIds.add(photo.optimizedStorageId)
    }
    if (photo.thumbnailStorageId !== undefined) {
      storageIds.add(photo.thumbnailStorageId)
    }
    for (const storageId of storageIds) {
      await ctx.storage.delete(storageId)
    }

    await ctx.db.delete(photo._id)
  }

  // Medlemmets egne kommentarer på andres billeder. `photos.commentCount` er et
  // vedligeholdt felt og ikke en optælling, så det rettes i samme mutation --
  // se `gallery.addComment`.
  const ownComments = await ctx.db
    .query('photoComments')
    .withIndex('by_author', (q) => q.eq('authorId', profileId))
    .collect()
  for (const comment of ownComments) {
    await ctx.db.delete(comment._id)
    const photo = await ctx.db.get(comment.photoId)
    if (photo !== null) {
      await ctx.db.patch(photo._id, {
        commentCount: Math.max(0, photo.commentCount - 1),
      })
    }
  }

  await anonymizeModerationLog(ctx, profileId)
}

/**
 * Moderationsloggen bliver stående: den er revisionssporet om, hvad
 * administratorer har slettet, og skal kunne læses bagefter. Referencerne til
 * medlemmet fjernes, og navnene erstattes -- samme regel som for
 * `adminRoleChanges` og som i den gamle apps trigger.
 */
async function anonymizeModerationLog(
  ctx: MutationCtx,
  profileId: Id<'profiles'>,
) {
  // Intet indeks på `actorId`/`uploaderId`: loggen er lille, og den læses kun
  // én gang pr. slettet konto.
  const rows = await ctx.db.query('photoModerationLog').collect()
  for (const row of rows) {
    const asActor = row.actorId === profileId
    const asUploader = row.uploaderId === profileId
    if (!asActor && !asUploader) continue
    await ctx.db.patch(row._id, {
      ...(asActor
        ? { actorId: undefined, actorName: FORMER_MEMBER_NAME }
        : {}),
      ...(asUploader
        ? { uploaderId: undefined, uploaderName: FORMER_MEMBER_NAME }
        : {}),
    })
  }
}

/** Ventelistens rækkefølge. Kopi af `byQueue` i `convex/calendar.ts`. */
function byQueue(left: Doc<'eventAttendance'>, right: Doc<'eventAttendance'>) {
  if (left.queuedAt !== right.queuedAt) return left.queuedAt - right.queuedAt
  return left.profileId < right.profileId
    ? -1
    : left.profileId > right.profileId
      ? 1
      : 0
}

/**
 * Retter tællingerne og ventelistens placeringer på en begivenhed.
 *
 * **Skal følges ad med `syncEventCounts` i `convex/calendar.ts`** -- den ligger
 * her som en kopi af samme grund som `removePhotoFromAlbum`: de to steder
 * regner den samme sandhed ud, og ændrer det ene, skal det andet følge med.
 */
async function syncEventCounts(ctx: MutationCtx, eventId: Id<'events'>) {
  const event = await ctx.db.get(eventId)
  if (event === null) return

  const rows = await ctx.db
    .query('eventAttendance')
    .withIndex('by_event', (q) => q.eq('eventId', eventId))
    .collect()
  const attending = rows.filter((row) => row.status === 'attending').length
  const waiting = rows
    .filter((row) => row.status === 'waitlisted')
    .sort(byQueue)

  for (const [index, row] of waiting.entries()) {
    if (row.waitlistPosition !== index + 1) {
      await ctx.db.patch(row._id, { waitlistPosition: index + 1 })
    }
  }
  for (const row of rows) {
    if (row.status !== 'waitlisted' && row.waitlistPosition !== undefined) {
      await ctx.db.patch(row._id, { waitlistPosition: undefined })
    }
  }

  if (
    event.attendingCount !== attending ||
    event.waitlistedCount !== waiting.length
  ) {
    await ctx.db.patch(eventId, {
      attendingCount: attending,
      waitlistedCount: waiting.length,
    })
  }
}

/**
 * Kalenderen: tilmeldingerne slettes, opgaverne ryddes, og begivenhederne
 * bliver stående uden arrangør.
 *
 * Ventelisten rykkes *ikke* op her. Det er samme valg som i
 * `calendar.respondToEvent`, hvor kommentaren siger, at ledige pladser også
 * fyldes op efter "noget, der aldrig gik gennem denne mutation (fx en slettet
 * konto)" -- oprykningen sker ved næste svar, og indtil da står tællingen
 * korrekt.
 */
async function clearMemberCalendar(
  ctx: MutationCtx,
  profileId: Id<'profiles'>,
) {
  const attendance = await ctx.db
    .query('eventAttendance')
    .withIndex('by_profile', (q) => q.eq('profileId', profileId))
    .collect()

  const affectedEvents = new Set<Id<'events'>>()
  for (const row of attendance) {
    affectedEvents.add(row.eventId)
    await ctx.db.delete(row._id)
  }
  for (const eventId of affectedEvents) {
    await syncEventCounts(ctx, eventId)
  }

  // Opgaver: den, medlemmet har *oprettet*, slettes (cascade i den gamle app),
  // mens den, vedkommende blot var ansvarlig for, bliver stående uden
  // ansvarlig -- opgaven hører til begivenheden, ikke til personen.
  const tasks = await ctx.db.query('eventTasks').collect()
  for (const task of tasks) {
    if (task.createdBy === profileId) {
      await ctx.db.delete(task._id)
      continue
    }
    if (task.assignedTo === profileId) {
      await ctx.db.patch(task._id, { assignedTo: undefined })
    }
  }

  // Begivenhederne er klubbens historik og bliver stående. `createdBy` er
  // valgfrit netop for at gøre dette muligt.
  const events = await ctx.db
    .query('events')
    .withIndex('by_creator', (q) => q.eq('createdBy', profileId))
    .collect()
  for (const event of events) {
    await ctx.db.patch(event._id, { createdBy: undefined })
  }

  // Gæsteansøgninger, medlemmet har afgjort som arrangør eller admin.
  const guestRequests = await ctx.db.query('eventGuestRequests').collect()
  for (const request of guestRequests) {
    if (request.reviewedBy === profileId) {
      await ctx.db.patch(request._id, { reviewedBy: undefined })
    }
  }
}

/**
 * Chatten: beskederne anonymiseres, og det, der kun findes som medlemmets eget,
 * slettes.
 *
 * Der findes ikke indeks på `messages.authorId`, `messages.mentions` eller
 * `messages.deletedBy` -- og `tables/chat.ts` hører ikke til denne opgave. Opslaget er
 * derfor en fuld gennemlæsning af `messages`, som kører én gang pr. slettet
 * konto. Kommer der et indeks senere, er det stedet at bruge det.
 */
async function clearMemberChat(ctx: MutationCtx, profileId: Id<'profiles'>) {
  const messages = await ctx.db.query('messages').collect()
  for (const message of messages) {
    const asAuthor = message.authorId === profileId
    const asDeleter = message.deletedBy === profileId
    const mentions = message.mentions.filter((id) => id !== profileId)
    const mentionsChanged = mentions.length !== message.mentions.length
    if (!asAuthor && !asDeleter && !mentionsChanged) continue

    await ctx.db.patch(message._id, {
      // Indholdet bliver stående: beskeden er fælles historik, og uden
      // `authorId` peger den ikke på nogen.
      ...(asAuthor ? { authorId: undefined } : {}),
      ...(asDeleter ? { deletedBy: undefined } : {}),
      ...(mentionsChanged ? { mentions } : {}),
    })
  }

  // Reaktioner, stemmer, tilstedeværelse og ulæst-markering er entydigt
  // personlige og findes ikke uden medlemmet.
  const reactions = await ctx.db.query('messageReactions').collect()
  for (const reaction of reactions) {
    if (reaction.profileId === profileId) {
      await ctx.db.delete(reaction._id)
    }
  }

  const votes = await ctx.db.query('pollVotes').collect()
  for (const vote of votes) {
    if (vote.profileId === profileId) {
      await ctx.db.delete(vote._id)
    }
  }

  const presence = await ctx.db
    .query('chatPresence')
    .withIndex('by_profile_and_room', (q) => q.eq('profileId', profileId))
    .collect()
  for (const row of presence) {
    await ctx.db.delete(row._id)
  }

  const reads = await ctx.db
    .query('chatReads')
    .withIndex('by_profile_and_room', (q) => q.eq('profileId', profileId))
    .collect()
  for (const row of reads) {
    await ctx.db.delete(row._id)
  }

  // Afstemningerne består -- de andres stemmer skal stadig kunne ses -- men
  // ophavet nulstilles, som da kolonnen var `on delete set null`.
  const polls = await ctx.db.query('chatPolls').collect()
  for (const poll of polls) {
    const asCreator = poll.createdBy === profileId
    const asCloser = poll.closedBy === profileId
    if (!asCreator && !asCloser) continue
    await ctx.db.patch(poll._id, {
      ...(asCreator ? { createdBy: undefined } : {}),
      ...(asCloser ? { closedBy: undefined } : {}),
    })
  }
}

/**
 * Fællesskabet: spillenes resultater slettes, mens naturloggen, badges og
 * turneringer bliver stående med referencen fjernet.
 *
 * Tre ting er værd at bemærke, fordi de er valg og ikke glemsel:
 *
 * 1. `memberBadges` bliver stående. Badgen er udleveret fysisk, og en slettet
 *    konto gør den ikke mindre udleveret.
 * 2. En *åben* indstilling, hvor medlemmet var modtager, slettes, fordi der
 *    ikke længere er nogen at tildele badgen til. En afgjort indstilling er
 *    historik og bliver stående.
 * 3. `badgeNominationApprovals.adminId` er obligatorisk, så en slettet
 *    administrators stemme slettes. Tællingerne på indstillingen regnes om
 *    bagefter, så `approveCount`/`rejectCount` stadig passer med rækkerne --
 *    den gamle app talte dem ved hvert stemme og fik derfor det samme.
 */
async function clearMemberCommunity(
  ctx: MutationCtx,
  profileId: Id<'profiles'>,
) {
  const scores = await ctx.db
    .query('gameScores')
    .withIndex('by_player_game_score', (q) => q.eq('playerId', profileId))
    .collect()
  for (const score of scores) {
    await ctx.db.delete(score._id)
  }

  // Naturloggen er klubbens fund, ikke medlemmets data. `createdByName` er et
  // snapshot og bliver stående.
  const observations = await ctx.db
    .query('observations')
    .withIndex('by_created_by', (q) => q.eq('createdById', profileId))
    .collect()
  for (const observation of observations) {
    await ctx.db.patch(observation._id, { createdById: undefined })
  }

  const badges = await ctx.db.query('badges').collect()
  for (const badge of badges) {
    if (badge.createdByProfileId === profileId) {
      await ctx.db.patch(badge._id, { createdByProfileId: undefined })
    }
  }

  const memberBadges = await ctx.db.query('memberBadges').collect()
  for (const memberBadge of memberBadges) {
    if (memberBadge.nominatedById === profileId) {
      await ctx.db.patch(memberBadge._id, { nominatedById: undefined })
    }
  }

  const productions = await ctx.db.query('badgeProductions').collect()
  for (const production of productions) {
    const asClaimer = production.claimedById === profileId
    const asCompleter = production.completedById === profileId
    if (!asClaimer && !asCompleter) continue
    await ctx.db.patch(production._id, {
      ...(asClaimer ? { claimedById: undefined } : {}),
      ...(asCompleter ? { completedById: undefined } : {}),
    })
  }

  const droppedNominations = new Set<Id<'badgeNominations'>>()
  const nominations = await ctx.db.query('badgeNominations').collect()
  for (const nomination of nominations) {
    if (nomination.nomineeId === profileId && nomination.status === 'pending') {
      droppedNominations.add(nomination._id)
      await ctx.db.delete(nomination._id)
      continue
    }
    if (nomination.nominatedById === profileId) {
      await ctx.db.patch(nomination._id, { nominatedById: undefined })
    }
  }

  const approvals = await ctx.db.query('badgeNominationApprovals').collect()
  const recounted = new Set<Id<'badgeNominations'>>()
  for (const approval of approvals) {
    const belongsToDropped = droppedNominations.has(approval.nominationId)
    if (approval.adminId !== profileId && !belongsToDropped) continue
    if (!belongsToDropped) recounted.add(approval.nominationId)
    await ctx.db.delete(approval._id)
  }

  for (const nominationId of recounted) {
    const nomination = await ctx.db.get(nominationId)
    if (nomination === null) continue
    const remaining = await ctx.db
      .query('badgeNominationApprovals')
      .withIndex('by_nomination', (q) => q.eq('nominationId', nominationId))
      .collect()
    await ctx.db.patch(nominationId, {
      approveCount: remaining.filter((row) => row.vote === 'approve').length,
      rejectCount: remaining.filter((row) => row.vote === 'reject').length,
    })
  }

  const tournaments = await ctx.db.query('tournaments').collect()
  for (const tournament of tournaments) {
    if (tournament.createdByProfileId === profileId) {
      await ctx.db.patch(tournament._id, { createdByProfileId: undefined })
    }
  }

  // Deltageren bliver stående i stillingen: kampene er spillet, og
  // `displayName` er et snapshot netop for at kunne vise den bagefter.
  const participants = await ctx.db
    .query('tournamentParticipants')
    .withIndex('by_profile', (q) => q.eq('profileId', profileId))
    .collect()
  for (const participant of participants) {
    await ctx.db.patch(participant._id, { profileId: undefined })
  }
}

// ---------------------------------------------------------------------------
// Hjælpere til dataudleveringen
// ---------------------------------------------------------------------------

/**
 * Medlemmets egne beskeder, ældste først. Anonymiserede beskeder fra en
 * tidligere konto kan ikke findes her -- de peger ikke på nogen.
 */
async function exportMessages(ctx: QueryCtx, profileId: Id<'profiles'>) {
  const messages = await ctx.db
    .query('messages')
    .filter((q) => q.eq(q.field('authorId'), profileId))
    .collect()

  return messages
    .sort((left, right) => left.createdAt - right.createdAt)
    .map((message) => ({
      id: message._id,
      room: message.room,
      content: message.content,
      createdAt: message.createdAt,
      writtenAt: message.writtenAt ?? null,
      replyToMessageId: message.replyToId ?? null,
      deletedAt: message.deletedAt ?? null,
    }))
}

/**
 * Medlemmets billeder med en download-adresse pr. fil.
 *
 * Der er ingen signeret URL med udløb som i den gamle app: Convex' `getUrl`
 * giver en fast adresse, der virker, så længe filen findes. `null` betyder, at
 * filen er væk -- ikke at adressen er udløbet.
 */
async function exportPhotos(ctx: QueryCtx, profileId: Id<'profiles'>) {
  const photos = await ctx.db
    .query('photos')
    .withIndex('by_uploader', (q) => q.eq('uploaderId', profileId))
    .collect()

  const rows = await Promise.all(
    photos.map(async (photo) => ({
      id: photo._id,
      caption: photo.caption ?? null,
      createdAt: photo.createdAt,
      eventId: photo.eventId ?? null,
      albumKey: photo.albumKey,
      optimizationStatus: photo.optimizationStatus,
      downloadUrls: {
        original: await ctx.storage.getUrl(photo.storageId),
        optimized:
          photo.optimizedStorageId === undefined
            ? null
            : await ctx.storage.getUrl(photo.optimizedStorageId),
        thumbnail:
          photo.thumbnailStorageId === undefined
            ? null
            : await ctx.storage.getUrl(photo.thumbnailStorageId),
      },
    })),
  )

  return rows.sort((left, right) => left.createdAt - right.createdAt)
}

/** Medlemmets egne kommentarer på billeder, ældste først. */
async function exportPhotoComments(
  ctx: QueryCtx,
  profileId: Id<'profiles'>,
) {
  const comments = await ctx.db
    .query('photoComments')
    .withIndex('by_author', (q) => q.eq('authorId', profileId))
    .collect()

  return comments
    .sort((left, right) => left.createdAt - right.createdAt)
    .map((comment) => ({
      id: comment._id,
      photoId: comment.photoId,
      body: comment.body,
      createdAt: comment.createdAt,
    }))
}

/** Medlemmets svar på begivenheder, med begivenhedens titel og tid. */
async function exportAttendance(ctx: QueryCtx, profileId: Id<'profiles'>) {
  const rows = await ctx.db
    .query('eventAttendance')
    .withIndex('by_profile', (q) => q.eq('profileId', profileId))
    .collect()

  const entries = await Promise.all(
    rows.map(async (row) => {
      const event = await ctx.db.get(row.eventId)
      return {
        eventId: row.eventId,
        status: row.status,
        queuedAt: row.queuedAt,
        event:
          event === null
            ? null
            : {
                id: event._id,
                title: event.title,
                startAt: event.startAt,
                endAt: event.endAt ?? null,
              },
      }
    }),
  )

  return entries.sort((left, right) => left.queuedAt - right.queuedAt)
}

/**
 * Medlemmets afstemningsstemmer, med spørgsmålet og svarets tekst.
 *
 * `pollVotes` har intet indeks på `profileId`, så det er en gennemlæsning af
 * stemmerne -- de er små, og udleveringen kører sjældent.
 */
async function exportPollVotes(ctx: QueryCtx, profileId: Id<'profiles'>) {
  const votes = await ctx.db
    .query('pollVotes')
    .filter((q) => q.eq(q.field('profileId'), profileId))
    .collect()

  const entries = await Promise.all(
    votes.map(async (vote) => {
      const poll = await ctx.db.get(vote.pollId)
      const option = await ctx.db.get(vote.optionId)
      const pollView =
        poll === null ? null : { id: poll._id, question: poll.question }
      const optionView =
        option === null ? null : { id: option._id, label: option.label }
      return {
        pollId: vote.pollId,
        optionId: vote.optionId,
        createdAt: vote.createdAt,
        poll: pollView,
        option: optionView,
      }
    }),
  )

  return entries.sort((left, right) => left.createdAt - right.createdAt)
}

/** Medlemmets fund i naturloggen, ældste først. */
async function exportObservations(ctx: QueryCtx, profileId: Id<'profiles'>) {
  const observations = await ctx.db
    .query('observations')
    .withIndex('by_created_by', (q) => q.eq('createdById', profileId))
    .collect()

  return observations
    .sort((left, right) => left.createdAt - right.createdAt)
    .map((observation) => ({
      id: observation._id,
      species: observation.species,
      location: observation.location ?? null,
      observedOn: observation.observedOn,
      notes: observation.notes ?? null,
      latitude: observation.latitude ?? null,
      longitude: observation.longitude ?? null,
      photoId: observation.photoId ?? null,
      createdAt: observation.createdAt,
      updatedAt: observation.updatedAt,
    }))
}

/** Medlemmets resultater i spillene, ældste først. */
async function exportGameScores(ctx: QueryCtx, profileId: Id<'profiles'>) {
  const scores = await ctx.db
    .query('gameScores')
    .withIndex('by_player_game_score', (q) => q.eq('playerId', profileId))
    .collect()

  return scores
    .sort((left, right) => left.createdAt - right.createdAt)
    .map((score) => ({
      id: score._id,
      game: score.game,
      score: score.score,
      lines: score.lines,
      level: score.level,
      durationSeconds: score.durationSeconds,
      createdAt: score.createdAt,
    }))
}

/** De badges, medlemmet har fået -- de bliver stående efter en sletning. */
async function exportMemberBadges(ctx: QueryCtx, profileId: Id<'profiles'>) {
  const rows = await ctx.db
    .query('memberBadges')
    .withIndex('by_profile_awarded', (q) => q.eq('profileId', profileId))
    .collect()

  return rows
    .sort((left, right) => left.awardedAt - right.awardedAt)
    .map((row) => ({
      id: row._id,
      badgeName: row.badgeName,
      badgeSlug: row.badgeSlug,
      nominatedByName: row.nominatedByName ?? null,
      reason: row.reason ?? null,
      awardedAt: row.awardedAt,
    }))
}
