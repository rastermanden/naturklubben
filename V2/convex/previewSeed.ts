import {
  createAccount,
  modifyAccountCredentials,
  retrieveAccount,
} from '@convex-dev/auth/server'
import { v } from 'convex/values'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import {
  env,
  internalAction,
  internalMutation,
  internalQuery,
} from './_generated/server'

/**
 * Testbruger til PR-preview.
 *
 * Køres kun fra `pr-preview-v2.yml` med `npx convex run previewSeed:ensure`
 * mod preview-deploymentet. Funktionen er intern, så klienten kan ikke kalde
 * den, og den nægter at køre, medmindre deploymentet selv er markeret som
 * preview (`PREVIEW_SEED=1`) og ikke er produktion.
 *
 * Adgangskoden læses fra deploymentets miljø, ikke fra argumenterne: `convex
 * run` skriver returværdien i loggen, og argumenter kan havne samme sted.
 * Returværdien er derfor kun `{ ok: true }`.
 */

/** Produktions-deploymentet. Preview må aldrig seede her. */
export const PROD_DEPLOYMENT_SLUG = 'quaint-parakeet-652'

export const PREVIEW_MEMBER_NAME = 'Preview-tester'

/**
 * Adresser, der selv må oprette sig i previewet.
 * Seedet lægger dem kun på adgangslisten. Der oprettes ingen bruger,
 * og der sendes ingen mail.
 */
export const PREVIEW_AGENTMAIL_ADDRESS = 'naturklubben-test@agentmail.to'

export const PREVIEW_GUEST_ALLOWLIST = [
  'kaspermoller@gmail.com',
  'kaspermoller+test@gmail.com',
  PREVIEW_AGENTMAIL_ADDRESS,
] as const

/**
 * Klubbens egne aktiviteter, som migrationerne i den nuværende app lægger ind.
 * Linket til bral.dk og BøsseTennisGolf-siden er data, ikke en hårdkodet knap.
 * Rækkefølgen er `sortOrder`, den samme som på naturklubben.dk.
 *
 * Ældre preview-builds lagde Skovtur og Fuglekiggeri ind foran. De er ikke
 * klubbens aktiviteter og fjernes, så siden viser det samme som den nuværende app.
 */
export const RETIRED_PREVIEW_ACTIVITIES = ['Skovtur', 'Fuglekiggeri'] as const
export const CLUB_ACTIVITIES = [
  {
    title: 'Design af Mønter',
    description:
      'Vi udvikler idéer og udtryk til klubbens egne mønter og finpudser design sammen.',
    icon: 'footprints',
    sortOrder: 1,
    linkUrl: 'https://bral.dk',
    linkLabel: 'Læs om valutaen på bral.dk',
  },
  {
    title: 'Udvikling af brænder til Aluminium',
    description:
      'Vi tester løsninger og materialer til en brænder, der kan bruges i arbejdet med aluminium.',
    icon: 'binoculars',
    sortOrder: 2,
    linkUrl: 'https://bral.dk',
    linkLabel: 'Læs om valutaen på bral.dk',
  },
  {
    title: 'Madkoordinering',
    description:
      'Vi planlægger indkøb, menuer og fordeling af madopgaver til fælles arrangementer.',
    icon: undefined,
    sortOrder: 3,
    linkUrl: undefined,
    linkLabel: undefined,
  },
  {
    title: 'BøsseTennisGolf',
    description:
      'Vi arrangerer BøsseTennisGolf med plads til både konkurrence, grin og skæve regler.',
    icon: 'footprints',
    sortOrder: 4,
    linkUrl: 'https://rastermanden.github.io/btg/',
    linkLabel: 'Se BøsseTennisGolf-siden',
  },
  {
    title: 'Hornfisk',
    description:
      'Vi mødes om hornfisketure, grej og gode historier fra kysten.',
    icon: 'binoculars',
    sortOrder: 5,
    linkUrl: undefined,
    linkLabel: undefined,
  },
] as const

export const PREVIEW_EVENT_TITLE = 'Preview-tur'

/** Stabilt klient-id, så seedet ikke lægger den samme besked ind to gange. */
export const PREVIEW_CHAT_CLIENT_ID = 'preview-seed-chat'
export const PREVIEW_CHAT_TEXT = 'Hej fra previewet. Skoven er grøn i dag.'

export const PREVIEW_PHOTO_CAPTION = 'Et blad fra previewet'

export const PREVIEW_OBSERVATION_SPECIES = 'Rød ræv'

/** Et vundet prøveparti: træk 1, 40 træk, under kabalens loft. */
export const PREVIEW_KABALE_SCORE = 120

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const TWO_HOURS_MS = 2 * 60 * 60 * 1000

/** Samme regler som smoke-testen: uden dem rammer login en anden streng, end den der blev gemt. */
export function normalizePreviewEmail(value: string | undefined): string {
  return (value ?? '')
    .replace(/[\r\n]/g, '')
    .trim()
    .toLowerCase()
}

export function normalizePreviewPassword(value: string | undefined): string {
  return (value ?? '').replace(/[\r\n]+$/g, '')
}

export function assertPreviewSeedAllowed(input: {
  previewSeed: string | undefined
  cloudUrl: string | undefined
}): void {
  if (input.previewSeed !== '1') {
    throw new Error('PREVIEW_SEED_DISABLED')
  }
  const url = input.cloudUrl ?? ''
  if (url.length === 0 || url.includes(PROD_DEPLOYMENT_SLUG)) {
    throw new Error('PREVIEW_SEED_REFUSED_PROD')
  }
}

function assertAllowedOnThisDeployment(): void {
  assertPreviewSeedAllowed({
    previewSeed: env.PREVIEW_SEED,
    cloudUrl: env.CONVEX_CLOUD_URL,
  })
}

async function ensureAllowedEmail(
  ctx: MutationCtx,
  email: string,
): Promise<void> {
  const existing = await ctx.db
    .query('allowedEmails')
    .withIndex('by_email', (q) => q.eq('email', email))
    .unique()
  if (existing !== null) return
  await ctx.db.insert('allowedEmails', { email, isAdmin: false })
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 1×1 PNG, så preview-profilen har et rigtigt billede i fillageret. */
const PREVIEW_AVATAR_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function previewAvatarBlob(): Blob {
  const binary = atob(PREVIEW_AVATAR_PNG_BASE64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: 'image/png' })
}

/**
 * Medlemskab og prøvedata. Kaldes kun fra `applySample` (som har vagten) og
 * fra testen. Titlerne er stabile, så et nyt preview-build ikke lægger
 * dubletter ind.
 */
export async function writePreviewSample(
  ctx: MutationCtx,
  userId: Id<'users'>,
): Promise<void> {
  const user = await ctx.db.get(userId)
  const account = await ctx.db
    .query('authAccounts')
    .withIndex('userIdAndProvider', (q) =>
      q.eq('userId', userId).eq('provider', 'password'),
    )
    .unique()
  const rawEmail = account?.providerAccountId ?? user?.email
  if (typeof rawEmail !== 'string' || !rawEmail.includes('@')) {
    throw new Error('PREVIEW_SEED_FAILED')
  }
  const email = rawEmail.trim().toLowerCase()

  await ensureAllowedEmail(ctx, email)
  for (const guest of PREVIEW_GUEST_ALLOWLIST) {
    await ensureAllowedEmail(ctx, guest)
  }

  const existingProfile = await ctx.db
    .query('profiles')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique()
  let profileId = existingProfile?._id
  if (profileId === undefined) {
    profileId = await ctx.db.insert('profiles', {
      userId,
      fullName: PREVIEW_MEMBER_NAME,
      isAdmin: false,
      chatColor: '#16a34a',
      causes: [],
      chatNotificationPreference: 'all',
      featureNotificationsEnabled: true,
      createdAt: Date.now(),
    })
  }

  const retiredTitles = new Set<string>(RETIRED_PREVIEW_ACTIVITIES)
  const existingActivities = await ctx.db.query('activities').collect()
  for (const row of existingActivities) {
    if (retiredTitles.has(row.title)) await ctx.db.delete(row._id)
  }

  for (const sample of CLUB_ACTIVITIES) {
    const existing = await ctx.db
      .query('activities')
      .filter((q) => q.eq(q.field('title'), sample.title))
      .first()
    // Et ældre preview kan have rækken med forkert rækkefølge, ikon eller
    // uden link. Felterne skrives om, så siden matcher den nuværende app.
    // `undefined` fjerner et felt, der ikke hører til aktiviteten.
    // `undefined` på et patch fjerner feltet. På insert skal feltet udelades.
    const fields = {
      description: sample.description,
      sortOrder: sample.sortOrder,
      icon: sample.icon,
      linkUrl: sample.linkUrl,
      linkLabel: sample.linkLabel,
    }
    if (existing !== null) {
      await ctx.db.patch(existing._id, fields)
      continue
    }
    await ctx.db.insert('activities', {
      title: sample.title,
      description: sample.description,
      sortOrder: sample.sortOrder,
      ...(sample.icon ? { icon: sample.icon } : {}),
      ...(sample.linkUrl
        ? { linkUrl: sample.linkUrl, linkLabel: sample.linkLabel }
        : {}),
      createdAt: Date.now(),
    })
  }

  const existingEvent = await ctx.db
    .query('events')
    .filter((q) => q.eq(q.field('title'), PREVIEW_EVENT_TITLE))
    .first()
  const startAt = Date.now() + WEEK_MS
  const endsAt = startAt + TWO_HOURS_MS
  if (existingEvent === null) {
    await ctx.db.insert('events', {
      title: PREVIEW_EVENT_TITLE,
      description: 'En åben tur, så kalenderen kan prøves i previewet.',
      location: 'Skoven',
      startAt,
      endAt: endsAt,
      endsAt,
      createdBy: profileId,
      isPublic: true,
      attendingCount: 0,
      waitlistedCount: 0,
      approvedGuestCount: 0,
      createdAt: Date.now(),
    })
  } else if (existingEvent.endsAt < Date.now()) {
    // Previewet kan leve længere end den uge, turen blev lagt en uge ud.
    // Uden et nyt tidspunkt forsvinder den fra den offentlige kalender.
    await ctx.db.patch(existingEvent._id, {
      startAt,
      endAt: endsAt,
      endsAt,
    })
  }

  const existingKabale = await ctx.db
    .query('gameScores')
    .withIndex('by_player_game_score', (q) =>
      q.eq('playerId', profileId).eq('game', 'kabale'),
    )
    .first()
  if (existingKabale === null) {
    await ctx.db.insert('gameScores', {
      game: 'kabale',
      playerId: profileId,
      playerName: PREVIEW_MEMBER_NAME,
      score: PREVIEW_KABALE_SCORE,
      lines: 40,
      level: 1,
      durationSeconds: 180,
      createdAt: Date.now(),
    })
  }

  const existingObservation = await ctx.db
    .query('observations')
    .filter((q) => q.eq(q.field('species'), PREVIEW_OBSERVATION_SPECIES))
    .first()
  if (existingObservation === null) {
    const now = Date.now()
    const day = new Date(now).toISOString().slice(0, 10)
    await ctx.db.insert('observations', {
      species: PREVIEW_OBSERVATION_SPECIES,
      location: 'Skovstien',
      observedOn: day,
      notes: 'Så den krydse stien i previewet.',
      latitude: 55.67,
      longitude: 12.52,
      createdById: profileId,
      createdByName: PREVIEW_MEMBER_NAME,
      createdAt: now,
      updatedAt: now,
    })
  }

  const existingPhoto = await ctx.db
    .query('photos')
    .filter((q) => q.eq(q.field('caption'), PREVIEW_PHOTO_CAPTION))
    .first()
  if (existingPhoto === null) {
    const storageId = await ctx.storage.store(previewAvatarBlob())
    const now = Date.now()
    const photoId = await ctx.db.insert('photos', {
      storageId,
      optimizedStorageId: storageId,
      thumbnailStorageId: storageId,
      width: 1,
      height: 1,
      caption: PREVIEW_PHOTO_CAPTION,
      albumKey: 'without-event',
      uploaderId: profileId,
      createdAt: now,
      optimizationStatus: 'ready',
      optimizationAttempts: 0,
      optimizationCompletedAt: now,
      commentCount: 0,
    })
    const album = await ctx.db
      .query('photoAlbums')
      .withIndex('by_album_key', (q) => q.eq('albumKey', 'without-event'))
      .unique()
    if (album === null) {
      await ctx.db.insert('photoAlbums', {
        albumKey: 'without-event',
        photoCount: 1,
        latestPhotoAt: now,
        coverPhotoId: photoId,
        coverThumbnailStorageId: storageId,
        coverOptimizedStorageId: storageId,
        coverCreatedAt: now,
      })
    }
  }

  const existingChat = await ctx.db
    .query('messages')
    .withIndex('by_client_id', (q) => q.eq('clientId', PREVIEW_CHAT_CLIENT_ID))
    .unique()
  if (existingChat === null) {
    await ctx.db.insert('messages', {
      room: 'general',
      authorId: profileId,
      content: PREVIEW_CHAT_TEXT,
      messageType: 'text',
      mentions: [],
      createdAt: Date.now(),
      clientId: PREVIEW_CHAT_CLIENT_ID,
    })
  }

  const profile = await ctx.db.get(profileId)
  if (profile !== null && profile.avatarStorageId === undefined) {
    const storageId = await ctx.storage.store(previewAvatarBlob())
    const avatarUrl = await ctx.storage.getUrl(storageId)
    if (avatarUrl !== null) {
      await ctx.db.patch(profileId, { avatarStorageId: storageId, avatarUrl })
    }
  }
}

export const userIdForAccount = internalQuery({
  args: { accountId: v.string() },
  returns: v.union(v.id('users'), v.null()),
  handler: async (ctx, args): Promise<Id<'users'> | null> => {
    assertAllowedOnThisDeployment()
    const account = await ctx.db
      .query('authAccounts')
      .withIndex('providerAndAccountId', (q) =>
        q.eq('provider', 'password').eq('providerAccountId', args.accountId),
      )
      .unique()
    return account?.userId ?? null
  },
})

export const applySample = internalMutation({
  args: { userId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    assertAllowedOnThisDeployment()
    await writePreviewSample(ctx, args.userId)
    return null
  },
})

/**
 * Fjerner en auth-bruger, så adressen kan oprettes forfra.
 * Adgangslisten røres ikke, og der sendes ingen mail.
 */
export async function removePasswordSignup(
  ctx: MutationCtx,
  email: string,
): Promise<boolean> {
  const account = await ctx.db
    .query('authAccounts')
    .withIndex('providerAndAccountId', (q) =>
      q.eq('provider', 'password').eq('providerAccountId', email),
    )
    .unique()
  const byEmail = await ctx.db
    .query('users')
    .withIndex('email', (q) => q.eq('email', email))
    .unique()
  const userId = account?.userId ?? byEmail?._id
  if (userId === undefined) return false

  const sessions = await ctx.db
    .query('authSessions')
    .withIndex('userId', (q) => q.eq('userId', userId))
    .collect()
  for (const session of sessions) {
    const tokens = await ctx.db
      .query('authRefreshTokens')
      .withIndex('sessionId', (q) => q.eq('sessionId', session._id))
      .collect()
    for (const token of tokens) await ctx.db.delete(token._id)
    await ctx.db.delete(session._id)
  }

  const accounts = await ctx.db
    .query('authAccounts')
    .withIndex('userIdAndProvider', (q) => q.eq('userId', userId))
    .collect()
  for (const row of accounts) {
    const codes = await ctx.db
      .query('authVerificationCodes')
      .withIndex('accountId', (q) => q.eq('accountId', row._id))
      .collect()
    for (const code of codes) await ctx.db.delete(code._id)
    await ctx.db.delete(row._id)
  }

  const profile = await ctx.db
    .query('profiles')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique()
  if (profile !== null) await ctx.db.delete(profile._id)

  const user = await ctx.db.get(userId)
  if (user !== null) await ctx.db.delete(userId)
  return true
}

export const forgetAgentmailSignup = internalMutation({
  args: {},
  returns: v.object({ removed: v.boolean() }),
  handler: async (ctx): Promise<{ removed: boolean }> => {
    assertAllowedOnThisDeployment()
    const removed = await removePasswordSignup(ctx, PREVIEW_AGENTMAIL_ADDRESS)
    return { removed }
  },
})

/** Om test-indbakken kan oprettes forfra: på listen, uden bruger. */
export const agentmailSignupReady = internalQuery({
  args: {},
  returns: v.object({
    listed: v.boolean(),
    hasAccount: v.boolean(),
  }),
  handler: async (ctx): Promise<{ listed: boolean; hasAccount: boolean }> => {
    assertAllowedOnThisDeployment()
    const allowed = await ctx.db
      .query('allowedEmails')
      .withIndex('by_email', (q) => q.eq('email', PREVIEW_AGENTMAIL_ADDRESS))
      .unique()
    const account = await ctx.db
      .query('authAccounts')
      .withIndex('providerAndAccountId', (q) =>
        q
          .eq('provider', 'password')
          .eq('providerAccountId', PREVIEW_AGENTMAIL_ADDRESS),
      )
      .unique()
    return { listed: allowed !== null, hasAccount: account !== null }
  },
})

export const ensure = internalAction({
  args: {},
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx): Promise<{ ok: true }> => {
    assertAllowedOnThisDeployment()
    // En tidligere oprettelse med test-indbakken må ikke spærre en ny.
    // Returværdien logges ikke her, og kaldet sender ingen mail.
    await ctx.runMutation(internal.previewSeed.forgetAgentmailSignup, {})

    const email = normalizePreviewEmail(env.PREVIEW_TEST_EMAIL)
    const password = normalizePreviewPassword(env.PREVIEW_TEST_PASSWORD)
    if (!/^[^@\s]+@[^@\s]+$/.test(email) || password.length < 8) {
      throw new Error('PREVIEW_SEED_INVALID')
    }

    let userId: Id<'users'>
    try {
      const created = await createAccount(ctx, {
        provider: 'password',
        account: { id: email, secret: password },
        profile: { email, name: PREVIEW_MEMBER_NAME },
        shouldLinkViaEmail: false,
        shouldLinkViaPhone: false,
      })
      userId = created.user._id
    } catch (error) {
      // "already exists" rummer adressen. Den må ikke videre ud i loggen.
      if (!errorText(error).includes('already exists')) {
        throw new Error('PREVIEW_SEED_FAILED')
      }
      try {
        await modifyAccountCredentials(ctx, {
          provider: 'password',
          account: { id: email, secret: password },
        })
      } catch {
        throw new Error('PREVIEW_SEED_FAILED')
      }
      const found: Id<'users'> | null = await ctx.runQuery(
        internal.previewSeed.userIdForAccount,
        { accountId: email },
      )
      if (found === null) throw new Error('PREVIEW_SEED_FAILED')
      userId = found
    }

    try {
      const retrieved = await retrieveAccount(ctx, {
        provider: 'password',
        account: { id: email, secret: password },
      })
      if (retrieved.user._id !== userId) throw new Error('PREVIEW_SEED_FAILED')
    } catch (error) {
      if (errorText(error) === 'PREVIEW_SEED_FAILED') throw error
      throw new Error('PREVIEW_SEED_FAILED')
    }

    await ctx.runMutation(internal.previewSeed.applySample, { userId })
    // Bekræftelse er slået til. Testbrugeren skal kunne logge ind, selv om
    // previewet ikke sender mails.
    await ctx.runMutation(internal.previewSeed.markAccountVerified, { email })
    return { ok: true }
  },
})

export const markAccountVerified = internalMutation({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    assertAllowedOnThisDeployment()
    await markPasswordAccountVerified(ctx, normalizePreviewEmail(args.email))
    return null
  },
})

/** Sætter e-mailen som bekræftet på adgangskode-kontoen. */
export async function markPasswordAccountVerified(
  ctx: MutationCtx,
  email: string,
): Promise<void> {
  const account = await ctx.db
    .query('authAccounts')
    .withIndex('providerAndAccountId', (q) =>
      q.eq('provider', 'password').eq('providerAccountId', email),
    )
    .unique()
  if (account === null) return
  await ctx.db.patch(account._id, { emailVerified: email })
  const user = await ctx.db.get(account.userId)
  if (user !== null && user.emailVerificationTime === undefined) {
    await ctx.db.patch(user._id, { emailVerificationTime: Date.now() })
  }
}
