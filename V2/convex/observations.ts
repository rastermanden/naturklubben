import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import { requireProfile, requireWritableProfile } from './authz'

/**
 * Naturloggen: medlemmer skriver, hvad de har set -- art, sted, dato, noter,
 * valgfri position og et valgfrit billede fra galleriet.
 *
 * Oversat fra `20260829170000_observations.sql`. To ting er værd at bemærke:
 *
 * 1. Observationer er klubbens historie, ikke personlige data. Slettes
 *    observatørens konto, bliver fundet stående -- derfor er `createdById`
 *    valgfrit og navnet en kopi (`createdByName`), som i den gamle app hvor
 *    `created_by` faldt til null ved sletning.
 * 2. Convex kan ikke filtrere på `ilike` eller trigram. Søgningen i listen sker
 *    derfor i klienten over de hentede rækker; det er den samme adfærd som før
 *    (delsøgning i art, sted og note), men den ser kun de nyeste 100.
 */

const SPECIES_MAX_LENGTH = 120
const LOCATION_MAX_LENGTH = 200
const NOTES_MAX_LENGTH = 2000

/** Hvor mange observationer listen henter. Naturloggen er en log, ikke en tavle;
 *  de nyeste er dem, nogen leder efter. */
const LIST_LIMIT = 100

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

interface ObservationContent {
  species: string
  location: string | undefined
  observedOn: string
  notes: string | undefined
  latitude: number | undefined
  longitude: number | undefined
}

/**
 * Dagens dato set fra Danmark, ikke fra serveren. Kalenderdagen er den samme
 * som medlemmets, og derfor tillades også den næste UTC-dag: et medlem, der
 * skriver kl. 00:30 dansk tid, er stadig i går i UTC.
 */
function danishTodayCeiling(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function validateContent(input: ObservationContent): ObservationContent {
  const species = input.species.trim()
  if (species.length === 0) throw new Error('OBSERVATION_SPECIES_REQUIRED')
  if (species.length > SPECIES_MAX_LENGTH) {
    throw new Error('OBSERVATION_SPECIES_TOO_LONG')
  }

  const location = input.location?.trim() || undefined
  if (location !== undefined && location.length > LOCATION_MAX_LENGTH) {
    throw new Error('OBSERVATION_LOCATION_TOO_LONG')
  }

  const notes = input.notes?.trim() || undefined
  if (notes !== undefined && notes.length > NOTES_MAX_LENGTH) {
    throw new Error('OBSERVATION_NOTES_TOO_LONG')
  }

  if (!ISO_DATE.test(input.observedOn)) {
    throw new Error('OBSERVATION_DATE_INVALID')
  }
  if (input.observedOn > danishTodayCeiling()) {
    throw new Error('OBSERVATION_DATE_IN_FUTURE')
  }

  // Positionen er enten sat eller ikke sat. En halv position kan ikke vises på
  // et kort, og den gamle app afviste den også (`observations_position_
  // complete`).
  const hasLatitude = input.latitude !== undefined
  const hasLongitude = input.longitude !== undefined
  if (hasLatitude !== hasLongitude) {
    throw new Error('OBSERVATION_POSITION_INCOMPLETE')
  }
  if (
    input.latitude !== undefined &&
    (input.latitude < -90 || input.latitude > 90)
  ) {
    throw new Error('OBSERVATION_POSITION_INVALID')
  }
  if (
    input.longitude !== undefined &&
    (input.longitude < -180 || input.longitude > 180)
  ) {
    throw new Error('OBSERVATION_POSITION_INVALID')
  }

  return {
    species,
    location,
    observedOn: input.observedOn,
    notes,
    latitude: input.latitude,
    longitude: input.longitude,
  }
}

function displayNameOf(profile: Doc<'profiles'>): string {
  const name = profile.fullName?.trim()
  return name && name.length > 0 ? name : 'Unavngivet medlem'
}

/**
 * Naturloggen, nyeste først. `isOwn` og `canDelete` regnes her, fordi kun
 * serveren ved, hvem der spørger: ejeren må rette sit eget fund, og en admin
 * må slette alt som moderation -- samme regel som i den gamle app.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireProfile(ctx)

    const observations = await ctx.db
      .query('observations')
      .withIndex('by_observed_on')
      .order('desc')
      .take(LIST_LIMIT)

    return observations.map((observation) => ({
      ...observation,
      isOwn: observation.createdById === profile._id,
      canDelete:
        observation.createdById === profile._id || profile.isAdmin === true,
    }))
  },
})

/** Et nyt fund. Kun medlemmer, og kun i eget navn. */
export const add = mutation({
  args: {
    species: v.string(),
    location: v.optional(v.string()),
    observedOn: v.string(),
    notes: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    photoId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)
    const content = validateContent(args)

    const now = Date.now()
    return await ctx.db.insert('observations', {
      ...content,
      photoId: args.photoId,
      createdById: profile._id,
      createdByName: displayNameOf(profile),
      createdAt: now,
      updatedAt: now,
    })
  },
})

/**
 * Retter et fund. Kun observatøren selv -- ikke en admin: en admin må slette
 * som moderation, men ikke lægge ord i munden på en anden.
 *
 * Positionen kan rettes, men ikke fjernes her; det kraever et nyt fund. Det
 * er den samme begrænsning som kolonnegranten i den gamle app gav.
 */
export const update = mutation({
  args: {
    observationId: v.id('observations'),
    species: v.optional(v.string()),
    location: v.optional(v.string()),
    observedOn: v.optional(v.string()),
    notes: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)

    const observation = await ctx.db.get(args.observationId)
    if (observation === null) throw new Error('OBSERVATION_NOT_FOUND')
    if (observation.createdById !== profile._id) {
      throw new Error('OBSERVATION_NOT_OWNER')
    }

    const content = validateContent({
      species: args.species ?? observation.species,
      location: args.location ?? observation.location,
      observedOn: args.observedOn ?? observation.observedOn,
      notes: args.notes ?? observation.notes,
      latitude: args.latitude ?? observation.latitude,
      longitude: args.longitude ?? observation.longitude,
    })

    await ctx.db.patch(observation._id, {
      ...content,
      updatedAt: Date.now(),
    })
  },
})

/** Ejeren må slette sit eget fund; en admin må slette alt som moderation. */
export const remove = mutation({
  args: { observationId: v.id('observations') },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)

    const observation = await ctx.db.get(args.observationId)
    if (observation === null) throw new Error('OBSERVATION_NOT_FOUND')
    if (observation.createdById !== profile._id && !profile.isAdmin) {
      throw new Error('OBSERVATION_NOT_ALLOWED')
    }

    await ctx.db.delete(observation._id)
  },
})
