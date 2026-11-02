import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { MutationCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import {
  currentProfile,
  currentUserId,
  requireAdmin,
  requireProfile,
  requireWritableProfile,
} from './authz'

/**
 * Medlemmerne: egen profil, medlemslisten og adminrollerne.
 *
 * Oversat fra `profiles`, `allowed_emails` og `admin_role_changes` i den gamle
 * app plus RPC'en `set_admin_role` og de triggers, der beskyttede den. To ting
 * er værd at vide, før man retter i filen:
 *
 * 1. Reglerne, der før lå i RLS-politikker og triggere, ligger nu i hver
 *    funktion. Hver eksporteret funktion starter derfor med et `requireX`-kald
 *    fra `authz.ts` (undtagen `me` og `claimProfile`, som skal kunne kaldes
 *    før profilen findes) -- ellers er funktionen offentlig.
 * 2. Fejlkoder, som UI'et skal kunne oversætte, kastes som `ConvexError` med
 *    en fast streng. Almindelige `Error`-beskeder sløres i produktion, så en
 *    kode, der skal vises for et menneske, skal være data -- ikke tekst.
 *
 * Postgres' advisory-locks er ikke porteret: Convex kører hver mutation som en
 * transaktion og tager den om igen ved samtidige skrivninger, så "der er
 * stadig en anden admin" kan ikke blive sandt imellem læsningen og skrivningen
 * på samme måde som i den gamle app.
 */

const DEFAULT_CHAT_COLOR = '#16a34a'
const UNNAMED_MEMBER = 'Unavngivet medlem'
const PRONOUNS_MAX_LENGTH = 40
const ROLE_HISTORY_LIMIT = 20

/**
 * Hvor længe en sletningsreservation regnes som frisk. Samme 15 minutter som
 * `account_accepts_writes()` og `reserve_account_deletion()` i den gamle app:
 * er reservationen ældre, er den strandet og spærrer ikke længere.
 */
const DELETION_RESERVATION_MS = 15 * 60 * 1000

/** De kendte hjertesager. Skal følge `src/features/profile/causes.ts`. */
const CAUSE_SLUGS = [
  'ukraine',
  'regnbue',
  'vaccine',
  'trans',
  'klima',
  'biodiversitet',
  'dyrevelfaerd',
  'plantebaseret',
  'fred',
  'bloddonor',
  'organdonor',
  'cykel',
] as const

const chatNotificationPreference = v.union(
  v.literal('all'),
  v.literal('mentions'),
  v.literal('none'),
)

function displayName(profile: Doc<'profiles'>): string {
  const name = profile.fullName?.trim()
  return name && name.length > 0 ? name : UNNAMED_MEMBER
}

function hasFreshDeletionReservation(profile: Doc<'profiles'>): boolean {
  if (profile.deletionReservedAt === undefined) return false
  return Date.now() - profile.deletionReservedAt < DELETION_RESERVATION_MS
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * E-mailen på den auth-konto, brugeren loggede ind med.
 *
 * Convex Auth gemmer adgangskode-providerens adresse som `providerAccountId`
 * på `authAccounts` og (for de fleste providers) også på `users.email`. Vi
 * læser kontoen først og falder tilbage til `users`, så et biblioteksskift i
 * det ene felt ikke stiltiende åbner eller lukker allowlisten.
 *
 * Adgangskode-kontoen foretrækkes, hvis brugeren har flere: det er den,
 * vedkommende blev inviteret med.
 *
 * Opslaget bruger `filter` og ikke et indeks med et navn, som biblioteket selv
 * bestemmer: `authAccounts` er lille (én række pr. login-metode pr. bruger), og
 * et indeksnavn, der skifter mellem versioner af `@convex-dev/auth`, ville
 * fælde koden ved næste opgradering.
 */
async function emailForUser(
  ctx: MutationCtx,
  userId: Id<'users'>,
): Promise<string | null> {
  const accounts = await ctx.db
    .query('authAccounts')
    .filter((q) => q.eq(q.field('userId'), userId))
    .collect()

  const passwordAccount = accounts.find(
    (account) => account.provider === 'password',
  )
  const fromAccount =
    passwordAccount?.providerAccountId ?? accounts[0]?.providerAccountId

  if (typeof fromAccount === 'string' && fromAccount.includes('@')) {
    return normalizeEmail(fromAccount)
  }

  const user = await ctx.db.get(userId)
  const fromUser = user?.email
  return typeof fromUser === 'string' && fromUser.length > 0
    ? normalizeEmail(fromUser)
    : null
}

function normalizeName(input: string | null): string | undefined {
  if (input === null) return undefined
  const cleaned = input.trim()
  return cleaned.length === 0 ? undefined : cleaned
}

/**
 * Pronominer gemmes som fri tekst, som i den gamle app: listen i appen er et
 * tilbud, ikke en grænse. Tomt og `null` betyder "ikke udfyldt endnu".
 */
function normalizePronouns(input: string | null): string | undefined {
  if (input === null) return undefined
  const cleaned = input.replace(/\s+/g, ' ').trim()
  if (cleaned.length === 0) return undefined
  if (cleaned.length > PRONOUNS_MAX_LENGTH) {
    throw new ConvexError('INVALID_PROFILE')
  }
  return cleaned
}

/**
 * Et array af tekst kan ikke udtrykke den gamle check-constraint, så reglen
 * håndhæves her: kendte slugs, ingen dubletter, listens rækkefølge.
 */
function normalizeCauses(input: string[]): string[] {
  const chosen = new Set(input)
  if (chosen.size !== input.length) {
    throw new ConvexError('INVALID_PROFILE')
  }
  for (const slug of chosen) {
    if (!CAUSE_SLUGS.includes(slug as (typeof CAUSE_SLUGS)[number])) {
      throw new ConvexError('INVALID_PROFILE')
    }
  }
  return CAUSE_SLUGS.filter((slug) => chosen.has(slug))
}

function normalizeChatColor(input: string): string {
  const value = input.trim().toLowerCase()
  if (!/^#[0-9a-f]{6}$/.test(value)) {
    throw new ConvexError('INVALID_PROFILE')
  }
  return value
}

/** Samme loft som den gamle avatars-bucket: 5 MB. Browseren skalerer ned før upload. */
const MAX_AVATAR_BYTES = 5 * 1024 * 1024

function compareNames(
  left: string | undefined,
  right: string | undefined,
): number {
  const a = left?.trim().toLocaleLowerCase('da') ?? ''
  const b = right?.trim().toLocaleLowerCase('da') ?? ''
  if (a === b) return 0
  // Tomt navn sidst, så listen ikke begynder med de unavngivne.
  if (a === '') return 1
  if (b === '') return -1
  return a.localeCompare(b, 'da')
}

/**
 * Kræver ingen rolle: uden session svarer den `null`. Det er den ene af to
 * funktioner, klienten må kalde, før der findes en profil -- ellers kunne
 * appen ikke se forskel på "ikke logget ind" og "ikke medlem endnu".
 */
export const me = query({
  args: {},
  handler: async (ctx) => {
    return await currentProfile(ctx)
  },
})

/**
 * Kræver en session, men ingen profil: opretter `profiles`-rækken for den
 * netop indloggede auth-bruger.
 *
 * Adgangskontrollen ligger her og ikke i `convex/auth.ts`: en e-mail, der
 * ikke står i `allowedEmails`, afvises med fejlkoden `EMAIL_NOT_ALLOWED`, så
 * UI'et kan forklare det med en dansk sætning i stedet for en kryptisk
 * auth-fejl. Er rækken allerede oprettet, returneres den uændret -- funktionen
 * er idempotent og kaldes også fra velkomstsiden.
 */
export const claimProfile = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await currentUserId(ctx)
    if (userId === null) {
      throw new ConvexError('NOT_AUTHENTICATED')
    }

    const existing = await ctx.db
      .query('profiles')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique()
    if (existing !== null) return existing

    const email = await emailForUser(ctx, userId)
    if (email === null) {
      throw new ConvexError('EMAIL_NOT_ALLOWED')
    }

    const allowed = await ctx.db
      .query('allowedEmails')
      .withIndex('by_email', (q) => q.eq('email', email))
      .unique()
    if (allowed === null) {
      throw new ConvexError('EMAIL_NOT_ALLOWED')
    }

    const user = await ctx.db.get(userId)
    const profileId = await ctx.db.insert('profiles', {
      userId,
      fullName: normalizeName(user?.name ?? null),
      isAdmin: allowed.isAdmin ?? false,
      chatColor: DEFAULT_CHAT_COLOR,
      causes: [],
      chatNotificationPreference: 'all',
      featureNotificationsEnabled: true,
      createdAt: Date.now(),
    })

    const profile = await ctx.db.get(profileId)
    if (profile === null) {
      throw new ConvexError('PROFILE_NOT_CREATED')
    }
    return profile
  },
})

/**
 * Kræver et medlem, hvis konto ikke er under sletning
 * (`requireWritableProfile`). Skriver kun på kalderens egen profil --
 * `isAdmin` kan ikke sættes her, den går gennem `setAdmin`.
 */
export const updateProfile = mutation({
  args: {
    fullName: v.optional(v.union(v.string(), v.null())),
    pronouns: v.optional(v.union(v.string(), v.null())),
    causes: v.optional(v.array(v.string())),
    chatColor: v.optional(v.string()),
    chatNotificationPreference: v.optional(chatNotificationPreference),
    featureNotificationsEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)

    const patch: {
      fullName?: string
      pronouns?: string
      causes?: string[]
      chatColor?: string
      chatNotificationPreference?: Doc<'profiles'>['chatNotificationPreference']
      featureNotificationsEnabled?: boolean
    } = {}

    if (args.fullName !== undefined) {
      patch.fullName = normalizeName(args.fullName)
    }
    if (args.pronouns !== undefined) {
      // `undefined` i et patch fjerner feltet, så "ikke udfyldt" kan gemmes.
      patch.pronouns = normalizePronouns(args.pronouns)
    }
    if (args.causes !== undefined) {
      patch.causes = normalizeCauses(args.causes)
    }
    if (args.chatColor !== undefined) {
      patch.chatColor = normalizeChatColor(args.chatColor)
    }
    if (args.chatNotificationPreference !== undefined) {
      patch.chatNotificationPreference = args.chatNotificationPreference
    }
    if (args.featureNotificationsEnabled !== undefined) {
      patch.featureNotificationsEnabled = args.featureNotificationsEnabled
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(profile._id, patch)
    }

    const updated = await ctx.db.get(profile._id)
    if (updated === null) {
      throw new ConvexError('PROFILE_NOT_FOUND')
    }
    return updated
  },
})

/**
 * Upload-URL til et profilbillede. Selve filen postes direkte til Convex'
 * fillager; `saveAvatar` tjekker bagefter, at det er et billede under loftet.
 */
export const generateAvatarUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireWritableProfile(ctx)
    return { uploadUrl: await ctx.storage.generateUploadUrl() }
  },
})

/**
 * Gemmer det uploadede profilbillede på kalderens egen profil og sletter
 * det forrige. Klienten kan ikke sætte en vilkårlig adresse: URL'en kommer
 * fra fillageret.
 */
export const saveAvatar = mutation({
  args: { storageId: v.id('_storage') },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)
    if (profile.avatarStorageId === args.storageId) return null

    const metadata = await ctx.db.system.get(args.storageId)
    if (metadata === null) {
      throw new ConvexError('AVATAR_UPLOAD_NOT_FOUND')
    }
    // En kastet fejl ruller også `storage.delete` tilbage. Derfor kommer
    // afvisningen tilbage som data, så den dårlige fil faktisk bliver slettet.
    if (!(metadata.contentType ?? '').startsWith('image/')) {
      await ctx.storage.delete(args.storageId)
      return { error: 'AVATAR_NOT_AN_IMAGE' as const }
    }
    if (metadata.size > MAX_AVATAR_BYTES) {
      await ctx.storage.delete(args.storageId)
      return { error: 'AVATAR_TOO_LARGE' as const }
    }

    const avatarUrl = await ctx.storage.getUrl(args.storageId)
    if (avatarUrl === null) {
      throw new ConvexError('AVATAR_UPLOAD_NOT_FOUND')
    }

    const previous = profile.avatarStorageId
    await ctx.db.patch(profile._id, {
      avatarStorageId: args.storageId,
      avatarUrl,
    })
    if (previous !== undefined) {
      await ctx.storage.delete(previous)
    }
    return null
  },
})

/**
 * Kræver et medlem: medlemslisten er intern.
 *
 * Returnerer kun de felter, listen viser. `userId` og en eventuel
 * sletningsreservation bliver liggende i databasen -- hvem der er ved at
 * slette sig selv, er ikke noget de andre medlemmer skal kunne se.
 */
export const listMembers = query({
  args: {},
  handler: async (ctx) => {
    await requireProfile(ctx)

    const profiles = await ctx.db.query('profiles').collect()
    return profiles
      .map((profile) => ({
        _id: profile._id,
        fullName: profile.fullName,
        pronouns: profile.pronouns,
        causes: profile.causes,
        avatarUrl: profile.avatarUrl,
        chatColor: profile.chatColor,
        isAdmin: profile.isAdmin,
        createdAt: profile.createdAt,
      }))
      .sort(
        (a, b) =>
          compareNames(a.fullName, b.fullName) ||
          a.createdAt - b.createdAt ||
          String(a._id).localeCompare(String(b._id)),
      )
  },
})

/**
 * Kræver administrator. Erstatter RPC'en `set_admin_role` og den trigger, der
 * beskyttede `is_admin`.
 *
 * Reglerne er de samme som før: rollen skal faktisk ændre sig, den sidste
 * administrator kan ikke nedgraderes, og en konto midt i en sletning kan ikke
 * få sin rolle flyttet. Hver ændring skrives i `adminRoleChanges`, og
 * allowlistens flag følger med, så en forfremmelse overlever, at medlemmet
 * opretter en ny konto med samme adresse.
 */
export const setAdmin = mutation({
  args: {
    targetId: v.id('profiles'),
    makeAdmin: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx)

    if (hasFreshDeletionReservation(actor)) {
      throw new ConvexError('ADMIN_ROLE_DURING_DELETION')
    }

    const target = await ctx.db.get(args.targetId)
    if (target === null) {
      throw new ConvexError('ADMIN_ROLE_TARGET_NOT_FOUND')
    }

    if (target.isAdmin === args.makeAdmin) {
      throw new ConvexError('ADMIN_ROLE_UNCHANGED')
    }

    if (!args.makeAdmin) {
      const admins = await ctx.db
        .query('profiles')
        .withIndex('by_admin', (q) => q.eq('isAdmin', true))
        .collect()
      const remaining = admins.filter(
        (candidate) =>
          candidate._id !== target._id &&
          !hasFreshDeletionReservation(candidate),
      )
      if (remaining.length === 0) {
        throw new ConvexError('ADMIN_ROLE_LAST_ADMIN')
      }
    }

    await ctx.db.patch(target._id, { isAdmin: args.makeAdmin })

    // Allowlistens is_admin bruges til at bootstrappe ved signup. Rækken
    // oprettes ikke her -- en rolleændring må ikke samtidig ændre, hvem der
    // kan oprette en konto.
    const targetEmail = await emailForUser(ctx, target.userId)
    if (targetEmail !== null) {
      const allowed = await ctx.db
        .query('allowedEmails')
        .withIndex('by_email', (q) => q.eq('email', targetEmail))
        .unique()
      if (allowed !== null) {
        await ctx.db.patch(allowed._id, { isAdmin: args.makeAdmin })
      }
    }

    await ctx.db.insert('adminRoleChanges', {
      actorId: actor._id,
      actorName: displayName(actor),
      targetId: target._id,
      targetName: displayName(target),
      oldIsAdmin: target.isAdmin,
      newIsAdmin: args.makeAdmin,
      changedAt: Date.now(),
    })

    return { targetId: target._id, isAdmin: args.makeAdmin }
  },
})

/** Kræver administrator: revisionssporet er kun for administratorer. */
export const listAdminRoleChanges = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx)

    return await ctx.db
      .query('adminRoleChanges')
      .withIndex('by_changed_at')
      .order('desc')
      .take(ROLE_HISTORY_LIMIT)
  },
})

/** Adgangslisten. Kun admins. Nyeste invitation først. */
export const listAllowedEmails = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx)
    const rows = await ctx.db.query('allowedEmails').collect()
    return rows
      .map((row) => ({
        email: row.email,
        note: row.note ?? null,
        createdAt: row.createdAt ?? 0,
        isAdmin: row.isAdmin === true,
      }))
      .sort((a, b) => b.createdAt - a.createdAt)
  },
})

export const addAllowedEmail = mutation({
  args: {
    email: v.string(),
    note: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx)
    const email = normalizeEmail(args.email)
    if (!email.includes('@')) throw new ConvexError('ALLOWED_EMAIL_INVALID')
    const existing = await ctx.db
      .query('allowedEmails')
      .withIndex('by_email', (q) => q.eq('email', email))
      .unique()
    if (existing !== null) throw new ConvexError('ALLOWED_EMAIL_EXISTS')
    await ctx.db.insert('allowedEmails', {
      email,
      note: args.note?.trim() || undefined,
      createdAt: Date.now(),
      invitedBy: admin._id,
      isAdmin: false,
    })
    return null
  },
})

export const removeAllowedEmail = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    const email = normalizeEmail(args.email)
    const existing = await ctx.db
      .query('allowedEmails')
      .withIndex('by_email', (q) => q.eq('email', email))
      .unique()
    if (existing === null) throw new ConvexError('ALLOWED_EMAIL_NOT_FOUND')
    await ctx.db.delete(existing._id)
    return null
  },
})
