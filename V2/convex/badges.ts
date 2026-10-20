import { v } from 'convex/values'
import { internalMutation, mutation, query } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import { requireAdmin, requireProfile, requireWritableProfile } from './authz'

/**
 * Badges: admins bestemmer kataloget, medlemmerne indstiller hinanden, og to
 * *forskellige* admins skal godkende, før en badge tildeles. Ved tildelingen
 * starter et 24-timers ur på at producere det fysiske badge.
 *
 * Reglerne er de samme som i Postgres-versionen (se migrationen
 * `20260826120000_badges.sql` og den nyere `20260829080000_badge_print_stale_
 * claim.sql`). Det, der var en `security definer`-RPC med advisory locks, er
 * her en mutation: en Convex-mutation er serialiserbar, så to samtidige stemmer
 * kan hverken tilegne badgen to gange eller begge nå at se "nul stemmer" og
 * løbe forbi to-admin-kravet.
 *
 * Fejlteksterne er faste koder, ikke danske sætninger -- klienten oversætter
 * dem, ligesom `authz.ts` gør med `NOT_A_MEMBER`.
 */

/** Kravet om to stemmer. */
const APPROVALS_NEEDED = 2

/** Produktionsopgaven skal være færdig inden for dette tidsrum. */
const PRODUCTION_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * Hvor længe et tryk-claim må være i live, før et nyt forsøg må overhale det.
 * To minutter, som i den nyere migration: en Edge Function, der stadig kører
 * efter to minutter, kommer ikke i mål alligevel.
 */
const PRINT_CLAIM_STALE_MS = 2 * 60 * 1000

/** Grænsen på indstillinger pr. indstiller, som i den gamle app. */
const NOMINATIONS_PER_HOUR = 5
const NOMINATIONS_PER_DAY = 20

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

const imageMimeType = v.union(
  v.literal('image/png'),
  v.literal('image/jpeg'),
  v.literal('image/webp'),
)

function displayNameOf(profile: Doc<'profiles'>): string {
  const name = profile.fullName?.trim()
  return name && name.length > 0 ? name : 'Unavngivet medlem'
}

/** Slug skrives i små bogstaver med bindestreger; den er stabil og bruges i
 *  links, så den må ikke være tom eller indeholde mellemrum. */
function validateSlug(slug: string): string {
  const trimmed = slug.trim()
  if (!SLUG_PATTERN.test(trimmed) || trimmed.length > 60) {
    throw new Error('BADGE_SLUG_INVALID')
  }
  return trimmed
}

function validateName(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length === 0) throw new Error('BADGE_NAME_REQUIRED')
  if (trimmed.length > 80) throw new Error('BADGE_NAME_TOO_LONG')
  return trimmed
}

function validateCrop(
  imageWidth: number,
  imageHeight: number,
  cropX: number,
  cropY: number,
  cropSize: number,
) {
  if (imageWidth <= 0 || imageHeight <= 0) {
    throw new Error('BADGE_IMAGE_SIZE_INVALID')
  }
  if (cropSize <= 0 || cropX < 0 || cropY < 0) {
    throw new Error('BADGE_CROP_INVALID')
  }
  // Udsnittet skal ligge inden for originalen. Ellers ville trykfilen mangle
  // billede i kanten, præcis dér hvor knapmaskinen folder om.
  if (cropX + cropSize > imageWidth || cropY + cropSize > imageHeight) {
    throw new Error('BADGE_CROP_OUTSIDE_IMAGE')
  }
}

function validatePhysical(diameterMm: number, bleedMm: number) {
  if (diameterMm < 10 || diameterMm > 200) {
    throw new Error('BADGE_DIAMETER_INVALID')
  }
  if (bleedMm < 0 || bleedMm > 20) {
    throw new Error('BADGE_BLEED_INVALID')
  }
}

/**
 * Kataloget, som medlemmerne ser det: kun aktive badges, alfabetisk.
 *
 * Billedet er et fil-id i Convex' storage, ikke en sti i en bucket, så URL'en
 * slås op her. `getUrl` giver null, hvis filen er væk -- så viser klienten
 * initialer i stedet for et knækket billede.
 */
export const catalog = query({
  args: {},
  handler: async (ctx) => {
    await requireProfile(ctx)

    const badges = await ctx.db
      .query('badges')
      .withIndex('by_active_name', (q) => q.eq('isActive', true))
      .take(200)

    return await Promise.all(
      badges.map(async (badge) => ({
        ...badge,
        imageUrl: await ctx.storage.getUrl(badge.imageStorageId),
      })),
    )
  },
})

/** Kataloget som admin ser det: også de deaktiverede, så de kan tages op igen. */
export const adminCatalog = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx)

    const active = await ctx.db
      .query('badges')
      .withIndex('by_active_name', (q) => q.eq('isActive', true))
      .take(200)
    const inactive = await ctx.db
      .query('badges')
      .withIndex('by_active_name', (q) => q.eq('isActive', false))
      .take(200)

    return await Promise.all(
      [...active, ...inactive].map(async (badge) => ({
        ...badge,
        imageUrl: await ctx.storage.getUrl(badge.imageStorageId),
        printUrl: badge.printStorageId
          ? await ctx.storage.getUrl(badge.printStorageId)
          : null,
      })),
    )
  },
})

/**
 * Medlemmerne, der kan indstilles til en badge. Læser `profiles` direkte, fordi
 * medlemsdomænet i V2 endnu ikke har en liste at låne; kaldet kræver et
 * medlemskab, og svaret er kun navn og id.
 */
export const nomineeCandidates = query({
  args: {},
  handler: async (ctx) => {
    await requireProfile(ctx)

    const profiles = await ctx.db.query('profiles').take(300)
    return profiles.map((profile) => ({
      profileId: profile._id,
      fullName: displayNameOf(profile),
    }))
  },
})

/**
 * En medlems badgevitrine: de tildelte badges med billede og udsnit, nyeste
 * først. Badge-dokumentet slås op pr. række -- det er et opslag på id, ikke en
 * gennemlæsning, og der er højst 50 rækker.
 */
export const memberBadgesFor = query({
  args: { profileId: v.id('profiles') },
  handler: async (ctx, args) => {
    await requireProfile(ctx)

    const awarded = await ctx.db
      .query('memberBadges')
      .withIndex('by_profile_awarded', (q) => q.eq('profileId', args.profileId))
      .order('desc')
      .take(50)

    return await Promise.all(
      awarded.map(async (row) => {
        const badge = await ctx.db.get(row.badgeId)
        return {
          ...row,
          imageUrl: badge
            ? await ctx.storage.getUrl(badge.imageStorageId)
            : null,
          cropX: badge?.cropX ?? 0,
          cropY: badge?.cropY ?? 0,
          cropSize: badge?.cropSize ?? 1,
        }
      }),
    )
  },
})

/** De badges den indloggede selv har fået. */
export const myBadges = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireProfile(ctx)

    const awarded = await ctx.db
      .query('memberBadges')
      .withIndex('by_profile_awarded', (q) => q.eq('profileId', profile._id))
      .order('desc')
      .take(50)

    return await Promise.all(
      awarded.map(async (row) => {
        const badge = await ctx.db.get(row.badgeId)
        return {
          ...row,
          imageUrl: badge
            ? await ctx.storage.getUrl(badge.imageStorageId)
            : null,
          cropX: badge?.cropX ?? 0,
          cropY: badge?.cropY ?? 0,
          cropSize: badge?.cropSize ?? 1,
        }
      }),
    )
  },
})

/**
 * Ens egne indstillinger, også de afviste -- den, der har indstillet, må følge
 * sin sag. Den indstillede får først noget at vide, når badgen er tildelt:
 * ellers ville en afvist indstilling være synlig for modtageren.
 */
export const myNominations = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireProfile(ctx)

    return await ctx.db
      .query('badgeNominations')
      .withIndex('by_nominator_created', (q) =>
        q.eq('nominatedById', profile._id),
      )
      .order('desc')
      .take(50)
  },
})

/**
 * Køen af indstillinger, der venter på en stemme. Kun admins.
 *
 * `myVote` er med, så knapperne kan vise, om man allerede har stemt -- uden at
 * klienten skal hente alle stemmer for alle indstillinger.
 */
export const pendingNominations = query({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx)

    const nominations = await ctx.db
      .query('badgeNominations')
      .withIndex('by_status_created', (q) => q.eq('status', 'pending'))
      .order('asc')
      .take(50)

    return await Promise.all(
      nominations.map(async (nomination) => {
        const myVote = await ctx.db
          .query('badgeNominationApprovals')
          .withIndex('by_nomination_admin', (q) =>
            q.eq('nominationId', nomination._id).eq('adminId', admin._id),
          )
          .unique()
        return {
          ...nomination,
          myVote: myVote?.vote ?? null,
          isOwnNomination: nomination.nominatedById === admin._id,
        }
      }),
    )
  },
})

/**
 * De produktionsopgaver, der ikke er færdige, tidligste deadline først. Kun
 * admins: medlemmerne ser badgen på profilen, ikke hvem der står med
 * limpistolen.
 *
 * Der læses to snævre indeksområder ('pending' og 'in_progress') frem for
 * hele tabellen, fordi 'done' hurtigt bliver den største del af den.
 */
export const openProductions = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx)

    const pending = await ctx.db
      .query('badgeProductions')
      .withIndex('by_status_due', (q) => q.eq('status', 'pending'))
      .order('asc')
      .take(100)
    const inProgress = await ctx.db
      .query('badgeProductions')
      .withIndex('by_status_due', (q) => q.eq('status', 'in_progress'))
      .order('asc')
      .take(100)

    return [...pending, ...inProgress].sort((a, b) => a.dueAt - b.dueAt)
  },
})

/** Opretter en badge. Kun admins; kataloget er admins' redskab. */
export const createBadge = mutation({
  args: {
    slug: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    imageStorageId: v.id('_storage'),
    imageWidth: v.number(),
    imageHeight: v.number(),
    imageMimeType,
    cropX: v.number(),
    cropY: v.number(),
    cropSize: v.number(),
    diameterMm: v.number(),
    bleedMm: v.number(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx)

    const slug = validateSlug(args.slug)
    const name = validateName(args.name)
    if (args.description !== undefined && args.description.length > 2000) {
      throw new Error('BADGE_DESCRIPTION_TOO_LONG')
    }
    validateCrop(
      args.imageWidth,
      args.imageHeight,
      args.cropX,
      args.cropY,
      args.cropSize,
    )
    validatePhysical(args.diameterMm, args.bleedMm)

    const taken = await ctx.db
      .query('badges')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique()
    if (taken !== null) throw new Error('BADGE_SLUG_TAKEN')

    const now = Date.now()
    return await ctx.db.insert('badges', {
      slug,
      name,
      description: args.description?.trim() || undefined,
      imageStorageId: args.imageStorageId,
      imageWidth: args.imageWidth,
      imageHeight: args.imageHeight,
      imageMimeType: args.imageMimeType,
      cropX: args.cropX,
      cropY: args.cropY,
      cropSize: args.cropSize,
      diameterMm: args.diameterMm,
      bleedMm: args.bleedMm,
      printStatus: 'pending',
      printAttempts: 0,
      isActive: true,
      createdByProfileId: admin._id,
      createdAt: now,
      updatedAt: now,
      awardedCount: 0,
    })
  },
})

/**
 * Retter en badge. Kun admins.
 *
 * Skifter billedet, beskæringen eller de fysiske mål, falder trykstatus tilbage
 * til 'pending' -- den gamle trykfil er forkert, og en badge må ikke se
 * trykklar ud med en forældet fil. Det svarer til triggeren
 * `reset_badge_print_on_change` i den gamle app.
 */
export const updateBadge = mutation({
  args: {
    badgeId: v.id('badges'),
    slug: v.optional(v.string()),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    imageStorageId: v.optional(v.id('_storage')),
    imageWidth: v.optional(v.number()),
    imageHeight: v.optional(v.number()),
    imageMimeType: v.optional(imageMimeType),
    cropX: v.optional(v.number()),
    cropY: v.optional(v.number()),
    cropSize: v.optional(v.number()),
    diameterMm: v.optional(v.number()),
    bleedMm: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)

    const badge = await ctx.db.get(args.badgeId)
    if (badge === null) throw new Error('BADGE_NOT_FOUND')

    const slug = args.slug === undefined ? badge.slug : validateSlug(args.slug)
    if (slug !== badge.slug) {
      const taken = await ctx.db
        .query('badges')
        .withIndex('by_slug', (q) => q.eq('slug', slug))
        .unique()
      if (taken !== null && taken._id !== badge._id) {
        throw new Error('BADGE_SLUG_TAKEN')
      }
    }

    const name = args.name === undefined ? badge.name : validateName(args.name)
    const description =
      args.description === undefined
        ? badge.description
        : args.description.trim() || undefined
    if (description !== undefined && description.length > 2000) {
      throw new Error('BADGE_DESCRIPTION_TOO_LONG')
    }

    if (args.imageStorageId !== undefined) {
      if (args.imageWidth === undefined || args.imageHeight === undefined) {
        throw new Error('BADGE_IMAGE_INCOMPLETE')
      }
      if (args.imageMimeType === undefined) {
        throw new Error('BADGE_IMAGE_INCOMPLETE')
      }
    }

    const imageStorageId = args.imageStorageId ?? badge.imageStorageId
    const imageWidth = args.imageWidth ?? badge.imageWidth
    const imageHeight = args.imageHeight ?? badge.imageHeight
    const imageMimeType = args.imageMimeType ?? badge.imageMimeType
    const cropX = args.cropX ?? badge.cropX
    const cropY = args.cropY ?? badge.cropY
    const cropSize = args.cropSize ?? badge.cropSize
    const diameterMm = args.diameterMm ?? badge.diameterMm
    const bleedMm = args.bleedMm ?? badge.bleedMm

    validateCrop(imageWidth, imageHeight, cropX, cropY, cropSize)
    validatePhysical(diameterMm, bleedMm)

    const resetsPrint =
      imageStorageId !== badge.imageStorageId ||
      cropX !== badge.cropX ||
      cropY !== badge.cropY ||
      cropSize !== badge.cropSize ||
      diameterMm !== badge.diameterMm ||
      bleedMm !== badge.bleedMm

    await ctx.db.patch(badge._id, {
      slug,
      name,
      description,
      imageStorageId,
      imageWidth,
      imageHeight,
      imageMimeType,
      cropX,
      cropY,
      cropSize,
      diameterMm,
      bleedMm,
      isActive: args.isActive ?? badge.isActive,
      updatedAt: Date.now(),
      ...(resetsPrint
        ? {
            printStatus: 'pending' as const,
            printStorageId: undefined,
            printError: undefined,
            printCompletedAt: undefined,
          }
        : {}),
    })
  },
})

/**
 * Sletter en badge. Kun admins -- og kun hvis ingen har fået den.
 *
 * En tildelt badge deaktiveres i stedet (`isActive: false`): ellers ville
 * historikken forsvinde. Convex har ingen `on delete cascade`, så
 * indstillingerne og deres stemmer ryddes her; de peger ellers på en badge,
 * der ikke findes.
 */
export const removeBadge = mutation({
  args: { badgeId: v.id('badges') },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)

    const badge = await ctx.db.get(args.badgeId)
    if (badge === null) throw new Error('BADGE_NOT_FOUND')
    if (badge.awardedCount > 0) throw new Error('BADGE_DELETE_AWARDED')

    const nominations = await ctx.db
      .query('badgeNominations')
      .withIndex('by_badge_nominee', (q) => q.eq('badgeId', badge._id))
      .take(200)
    for (const nomination of nominations) {
      const approvals = await ctx.db
        .query('badgeNominationApprovals')
        .withIndex('by_nomination', (q) => q.eq('nominationId', nomination._id))
        .take(20)
      for (const approval of approvals) {
        await ctx.db.delete(approval._id)
      }
      await ctx.db.delete(nomination._id)
    }

    if (badge.printStorageId !== undefined) {
      await ctx.storage.delete(badge.printStorageId)
    }
    await ctx.storage.delete(badge.imageStorageId)
    await ctx.db.delete(badge._id)
  },
})

/**
 * Et medlem indstiller et andet medlem til en badge. Erstatter RPC'en
 * `nominate_member_for_badge`.
 *
 * Reglerne, i den rækkefølge den gamle funktion tjekkede dem: begrundelse på
 * plads, ikke sig selv, badgen findes og er aktiv, modtageren findes, badgen er
 * ikke allerede tildelt, der er ikke en åben indstilling i forvejen, og
 * indstilleren har ikke brugt sin dagskvote.
 */
export const nominate = mutation({
  args: {
    badgeId: v.id('badges'),
    nomineeId: v.id('profiles'),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const me = await requireWritableProfile(ctx)

    const reason = args.reason.trim()
    if (reason.length === 0) throw new Error('BADGE_REASON_REQUIRED')
    if (reason.length > 2000) throw new Error('BADGE_REASON_TOO_LONG')

    if (args.nomineeId === me._id) throw new Error('BADGE_SELF_NOMINATION')

    const badge = await ctx.db.get(args.badgeId)
    if (badge === null) throw new Error('BADGE_NOT_FOUND')
    if (!badge.isActive) throw new Error('BADGE_INACTIVE')

    const nominee = await ctx.db.get(args.nomineeId)
    if (nominee === null) throw new Error('BADGE_NOMINEE_NOT_FOUND')

    const alreadyAwarded = await ctx.db
      .query('memberBadges')
      .withIndex('by_badge_profile', (q) =>
        q.eq('badgeId', badge._id).eq('profileId', nominee._id),
      )
      .unique()
    if (alreadyAwarded !== null) throw new Error('BADGE_ALREADY_AWARDED')

    // Det delvist unikke indeks fra Postgres findes ikke her, så "én åben
    // indstilling ad gangen" tjekkes her. Mutationen er serialiserbar, så to
    // samtidige kald kan ikke begge se "ingen åben indstilling".
    const existing = await ctx.db
      .query('badgeNominations')
      .withIndex('by_badge_nominee', (q) =>
        q.eq('badgeId', badge._id).eq('nomineeId', nominee._id),
      )
      .take(10)
    if (existing.some((row) => row.status === 'pending')) {
      throw new Error('BADGE_ALREADY_PENDING')
    }

    const now = Date.now()
    const lastHour = await ctx.db
      .query('badgeNominations')
      .withIndex('by_nominator_created', (q) =>
        q.eq('nominatedById', me._id).gt('createdAt', now - 60 * 60 * 1000),
      )
      .take(NOMINATIONS_PER_HOUR)
    if (lastHour.length >= NOMINATIONS_PER_HOUR) {
      throw new Error('BADGE_NOMINATE_RATE_LIMITED')
    }
    const lastDay = await ctx.db
      .query('badgeNominations')
      .withIndex('by_nominator_created', (q) =>
        q.eq('nominatedById', me._id).gt('createdAt', now - 24 * 60 * 60 * 1000),
      )
      .take(NOMINATIONS_PER_DAY)
    if (lastDay.length >= NOMINATIONS_PER_DAY) {
      throw new Error('BADGE_NOMINATE_RATE_LIMITED')
    }

    return await ctx.db.insert('badgeNominations', {
      badgeId: badge._id,
      badgeName: badge.name,
      nomineeId: nominee._id,
      nomineeName: displayNameOf(nominee),
      nominatedById: me._id,
      nominatedByName: displayNameOf(me),
      reason,
      status: 'pending',
      approveCount: 0,
      rejectCount: 0,
      createdAt: now,
    })
  },
})

/**
 * En admin stemmer på en indstilling. Erstatter `vote_on_badge_nomination`.
 *
 * To *forskellige* admins skal godkende, og den admin, der selv har indstillet,
 * tæller ikke med -- ellers ville to-admin-kravet i praksis være ét: indstil,
 * godkend, vent på en kollega. En afvisning lukker sagen med det samme.
 *
 * Tildelingen sker i samme mutation som den anden godkendelse: badgen, dens
 * aggregat og produktionsopgaven med 24-timers uret skrives i ét hug, så en
 * halvt gennemført tildeling ikke kan opstå.
 */
export const vote = mutation({
  args: {
    nominationId: v.id('badgeNominations'),
    vote: v.union(v.literal('approve'), v.literal('reject')),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx)

    const comment = args.comment?.trim() || undefined
    if (comment !== undefined && comment.length > 2000) {
      throw new Error('BADGE_COMMENT_TOO_LONG')
    }

    const nomination = await ctx.db.get(args.nominationId)
    if (nomination === null) throw new Error('BADGE_NOMINATION_NOT_FOUND')
    if (nomination.status !== 'pending') {
      throw new Error('BADGE_VOTE_ALREADY_RESOLVED')
    }
    if (nomination.nominatedById === admin._id) {
      throw new Error('BADGE_VOTE_NOMINATOR')
    }

    const existing = await ctx.db
      .query('badgeNominationApprovals')
      .withIndex('by_nomination_admin', (q) =>
        q.eq('nominationId', nomination._id).eq('adminId', admin._id),
      )
      .unique()
    if (existing !== null) throw new Error('BADGE_VOTE_ALREADY_VOTED')

    const now = Date.now()
    await ctx.db.insert('badgeNominationApprovals', {
      nominationId: nomination._id,
      adminId: admin._id,
      adminName: displayNameOf(admin),
      vote: args.vote,
      comment,
      createdAt: now,
    })

    if (args.vote === 'reject') {
      await ctx.db.patch(nomination._id, {
        status: 'rejected',
        resolvedAt: now,
        rejectCount: nomination.rejectCount + 1,
      })
      return {
        status: 'rejected' as const,
        approveCount: nomination.approveCount,
        memberBadgeId: null,
      }
    }

    const approveCount = nomination.approveCount + 1
    if (approveCount < APPROVALS_NEEDED) {
      await ctx.db.patch(nomination._id, { approveCount })
      return { status: 'pending' as const, approveCount, memberBadgeId: null }
    }

    const badge = await ctx.db.get(nomination.badgeId)
    if (badge === null) throw new Error('BADGE_NOT_FOUND')

    await ctx.db.patch(nomination._id, {
      status: 'approved',
      resolvedAt: now,
      approveCount,
    })

    const alreadyAwarded = await ctx.db
      .query('memberBadges')
      .withIndex('by_badge_profile', (q) =>
        q.eq('badgeId', nomination.badgeId).eq(
          'profileId',
          nomination.nomineeId,
        ),
      )
      .unique()
    if (alreadyAwarded !== null) {
      return {
        status: 'approved' as const,
        approveCount,
        memberBadgeId: alreadyAwarded._id,
      }
    }

    const memberBadgeId = await ctx.db.insert('memberBadges', {
      badgeId: badge._id,
      badgeName: badge.name,
      badgeSlug: badge.slug,
      profileId: nomination.nomineeId,
      profileName: nomination.nomineeName,
      nominationId: nomination._id,
      nominatedById: nomination.nominatedById,
      nominatedByName: nomination.nominatedByName,
      reason: nomination.reason,
      awardedAt: now,
    })
    await ctx.db.patch(badge._id, { awardedCount: badge.awardedCount + 1 })

    // Produktionsuret starter ved tildelingen, ikke ved den første stemme.
    await ctx.db.insert('badgeProductions', {
      memberBadgeId,
      badgeId: badge._id,
      badgeName: badge.name,
      profileId: nomination.nomineeId,
      profileName: nomination.nomineeName,
      dueAt: now + PRODUCTION_WINDOW_MS,
      status: 'pending',
      createdAt: now,
    })

    return { status: 'approved' as const, approveCount, memberBadgeId }
  },
})

/** Tager produktionsopgaven. Kun admins. Erstatter `claim_badge_production`. */
export const claimProduction = mutation({
  args: { productionId: v.id('badgeProductions') },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx)

    const production = await ctx.db.get(args.productionId)
    if (production === null) throw new Error('BADGE_PRODUCTION_NOT_FOUND')
    if (production.status === 'done') {
      throw new Error('BADGE_PRODUCTION_ALREADY_DONE')
    }
    // To admins må ikke tro, at de hver står med opgaven. Den, der tog den
    // først, ejer den.
    if (
      production.claimedById !== undefined &&
      production.claimedById !== admin._id
    ) {
      throw new Error('BADGE_PRODUCTION_CLAIMED_BY_OTHER')
    }

    await ctx.db.patch(production._id, {
      claimedById: admin._id,
      claimedByName: displayNameOf(admin),
      claimedAt: Date.now(),
      status: 'in_progress',
    })
  },
})

/** Marker produktionsopgaven som færdig. Kun admins. */
export const completeProduction = mutation({
  args: { productionId: v.id('badgeProductions') },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx)

    const production = await ctx.db.get(args.productionId)
    if (production === null) throw new Error('BADGE_PRODUCTION_NOT_FOUND')
    if (production.status === 'done') {
      throw new Error('BADGE_PRODUCTION_ALREADY_DONE')
    }

    const now = Date.now()
    await ctx.db.patch(production._id, {
      status: 'done',
      completedAt: now,
      completedById: admin._id,
      claimedById: production.claimedById ?? admin._id,
      claimedByName: production.claimedByName ?? displayNameOf(admin),
      claimedAt: production.claimedAt ?? now,
    })
  },
})

/**
 * Starter en rendering af trykfilen og returnerer de mål, der skal tegnes
 * efter. Erstatter RPC'en `claim_badge_print`.
 *
 * Det er en `internalMutation`, fordi den kun må kaldes af vores egen
 * baggrundskode (optimeringsjobbet), ikke af en browser. Admin-kravet fra den
 * gamle service-role-RPC består alligevel: aktøren slås op og skal være admin,
 * så en almindelig baggrundskørsel ikke kan sætte en badge i gang.
 *
 * "Stale claim": står badgen allerede som 'rendering', må den først overtages,
 * når claimet er ældre end PRINT_CLAIM_STALE_MS. Ellers ville en rendering,
 * der døde undervejs, låse badgen fast for evigt. `attempt` gør det sikkert at
 * overhale en rendering, der stadig lever: `completePrint` skriver kun, hvis
 * tælleren stadig er dens egen.
 */
export const claimPrint = internalMutation({
  args: { badgeId: v.id('badges'), actorProfileId: v.id('profiles') },
  handler: async (ctx, args) => {
    const actor = await ctx.db.get(args.actorProfileId)
    if (actor === null || !actor.isAdmin) throw new Error('NOT_ADMIN')

    const badge = await ctx.db.get(args.badgeId)
    if (badge === null) return null

    const now = Date.now()
    const claimable =
      badge.printStatus === 'pending' ||
      badge.printStatus === 'failed' ||
      badge.printStatus === 'ready' ||
      (badge.printStatus === 'rendering' &&
        (badge.printStartedAt === undefined ||
          badge.printStartedAt <= now - PRINT_CLAIM_STALE_MS))
    if (!claimable) return null

    const attempt = badge.printAttempts + 1
    await ctx.db.patch(badge._id, {
      printStatus: 'rendering',
      printAttempts: attempt,
      printStartedAt: now,
      printCompletedAt: undefined,
      printError: undefined,
    })

    return {
      badgeId: badge._id,
      attempt,
      imageStorageId: badge.imageStorageId,
      imageWidth: badge.imageWidth,
      imageHeight: badge.imageHeight,
      cropX: badge.cropX,
      cropY: badge.cropY,
      cropSize: badge.cropSize,
      diameterMm: badge.diameterMm,
      bleedMm: badge.bleedMm,
    }
  },
})

/**
 * Melder en rendering tilbage. Erstatter `complete_badge_print`.
 *
 * Skriver kun, hvis badgen stadig står som 'rendering' *og* tælleren matcher
 * det forsøg, den kalder sig selv. En rendering, der blev overhalet af et nyt
 * forsøg, får `false` tilbage og skal rydde sin egen fil op i stedet for at
 * overskrive den nyere.
 */
export const completePrint = internalMutation({
  args: {
    badgeId: v.id('badges'),
    expectedAttempt: v.number(),
    succeeded: v.boolean(),
    printStorageId: v.optional(v.id('_storage')),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.succeeded && args.printStorageId === undefined) {
      throw new Error('BADGE_PRINT_FILE_REQUIRED')
    }

    const badge = await ctx.db.get(args.badgeId)
    if (badge === null) return false
    if (
      badge.printAttempts !== args.expectedAttempt ||
      badge.printStatus !== 'rendering'
    ) {
      return false
    }

    await ctx.db.patch(badge._id, {
      printStatus: args.succeeded ? 'ready' : 'failed',
      // En fejl beholder den trykfil, der måtte findes i forvejen -- den er
      // ikke blevet dårligere af, at et nyt forsøg fejlede.
      printStorageId: args.succeeded
        ? args.printStorageId
        : badge.printStorageId,
      printError: args.succeeded ? undefined : (args.error ?? 'Ukendt fejl'),
      printCompletedAt: Date.now(),
    })
    return true
  },
})
