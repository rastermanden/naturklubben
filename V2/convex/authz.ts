import { getAuthUserId } from '@convex-dev/auth/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'

/**
 * Al autorisation i V2 går gennem denne fil.
 *
 * Den gamle app havde 115 RLS-politikker, som databasen håndhævede, uanset
 * hvilken kode der spurgte. Convex har ingen RLS: en query eller mutation ser
 * præcis de rækker, den selv læser. Sikkerheden ligger derfor i, at *hver*
 * offentlig funktion kalder en af hjælperne herunder, før den rører data.
 *
 * To regler, som ikke er til forhandling:
 *
 * 1. En funktion, der eksporteres fra `convex/*.ts` med `query` eller
 *    `mutation`, kan kaldes af enhver, der kender navnet -- også uden login.
 *    Mangler der et `requireX`-kald, er data offentlige.
 * 2. `ctx.auth.getUserIdentity()` må ikke bruges direkte til at afgøre
 *    adgang. Den siger kun, *hvem* der kalder. Om personen er medlem, er
 *    administrator eller er ved at få slettet sin konto, står i `profiles`, og
 *    det er den vurdering, hjælperne herunder laver.
 */

type Ctx = QueryCtx | MutationCtx

/** Auth-brugerens id, eller null hvis ingen er logget ind. */
export async function currentUserId(ctx: Ctx): Promise<Id<'users'> | null> {
  return await getAuthUserId(ctx)
}

/**
 * Profilen for den indloggede bruger, eller null. Bruges hvor en side også
 * findes for ikke-medlemmer (fx den offentlige kalender).
 */
export async function currentProfile(
  ctx: Ctx,
): Promise<Doc<'profiles'> | null> {
  const userId = await getAuthUserId(ctx)
  if (userId === null) return null
  return await ctx.db
    .query('profiles')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique()
}

/**
 * Kræver et logget-ind medlem. Kaster, hvis der ikke er nogen session, eller
 * hvis brugeren endnu ikke har fået en profil (se `members.claimProfile`).
 *
 * Fejlteksten er en fast kode og ikke en dansk sætning: klienten oversætter
 * den, så en fejl ikke bliver vist på et sprog, brugeren ikke forstår.
 */
export async function requireProfile(ctx: Ctx): Promise<Doc<'profiles'>> {
  const profile = await currentProfile(ctx)
  if (profile === null) {
    throw new Error('NOT_A_MEMBER')
  }
  return profile
}

/**
 * Kræver et medlem, der ikke er på vej til at blive slettet. Bruges af alt,
 * der skriver: den gamle app spærrede profilopdateringer, mens en sletning var
 * reserveret, og den spærring skal bestå.
 */
export async function requireWritableProfile(
  ctx: Ctx,
): Promise<Doc<'profiles'>> {
  const profile = await requireProfile(ctx)
  if (profile.deletionReservedAt !== undefined) {
    throw new Error('ACCOUNT_DELETION_RESERVED')
  }
  return profile
}

/** Kræver administrator. Bruges af alt under `/admin` og af moderatorværktøj. */
export async function requireAdmin(ctx: Ctx): Promise<Doc<'profiles'>> {
  const profile = await requireProfile(ctx)
  if (!profile.isAdmin) {
    throw new Error('NOT_ADMIN')
  }
  return profile
}
