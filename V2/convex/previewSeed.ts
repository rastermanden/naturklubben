import {
  createAccount,
  modifyAccountCredentials,
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

export const PREVIEW_ACTIVITIES = [
  {
    title: 'Skovtur',
    description: 'En tur i skoven, så aktivitetssiden har noget at vise.',
    icon: 'leaf',
    sortOrder: 1,
  },
  {
    title: 'Fuglekiggeri',
    description: 'En tur med kikkert, så listen har mere end ét punkt.',
    icon: 'binoculars',
    sortOrder: 2,
  },
] as const

export const PREVIEW_EVENT_TITLE = 'Preview-tur'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const TWO_HOURS_MS = 2 * 60 * 60 * 1000

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

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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

  const allowed = await ctx.db
    .query('allowedEmails')
    .withIndex('by_email', (q) => q.eq('email', email))
    .unique()
  if (allowed === null) {
    await ctx.db.insert('allowedEmails', { email, isAdmin: false })
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

  for (const sample of PREVIEW_ACTIVITIES) {
    const existing = await ctx.db
      .query('activities')
      .filter((q) => q.eq(q.field('title'), sample.title))
      .first()
    if (existing !== null) continue
    await ctx.db.insert('activities', {
      title: sample.title,
      description: sample.description,
      icon: sample.icon,
      sortOrder: sample.sortOrder,
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

export const ensure = internalAction({
  args: {},
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx): Promise<{ ok: true }> => {
    assertAllowedOnThisDeployment()

    const email = env.PREVIEW_TEST_EMAIL?.trim() ?? ''
    const password = env.PREVIEW_TEST_PASSWORD ?? ''
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

    await ctx.runMutation(internal.previewSeed.applySample, { userId })
    return { ok: true }
  },
})
