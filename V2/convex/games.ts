import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import { gameIdValidator } from './tables/community'
import { requireProfile, requireWritableProfile } from './authz'

/**
 * Spillenes resultatliste. Convex-udgaven af `game_scores` fra den gamle app
 * (se migrationerne `20260906090000_game_scores.sql` og de fem udvidelser, der
 * fulgte: kaper, 2048, naturquiz, sti og fugletraek).
 *
 * Der er ingen `count(*)` og ingen joins her. Derfor:
 *
 * - Spillerens navn kopieres ind i rækken ved indsendelsen (`playerName`), så
 *   en resultatliste kan vises uden et opslag pr. række.
 * - Resultatlisten læses som et **bounded vindue** af indekset
 *   `by_game_score` på (game, score), aldrig som en gennemlæsning af tabellen.
 *   Vinduet er nok, fordi et medlems bedste resultat *er* deres højeste: er det
 *   ikke blandt de hentede point, er medlemmet heller ikke på listen. Det er
 *   den samme begrundelse som `rankLeaderboard` havde i klienten før.
 * - Rimelighedsgrænserne fra databasens check-constraints er flyttet til
 *   `validateScore`. Der er ingen database til at afvise vrøvl i Convex, så
 *   mutationen skal selv gøre det.
 */

/** Toppen af listen. Et medlems bedste resultat kan per definition ikke ligge
 *  uden for, hvis medlemmet skal være blandt de bedste 200. */
const LEADERBOARD_LIMIT = 200
const LEADERBOARD_MAX = 500

/** Hvor mange spil "Seneste spil" viser. */
const RECENT_LIMIT = 12

const SCORE_MAX = 9_999_999
const LINES_MAX = 99_999
const LEVEL_MAX = 99
const DURATION_MAX = 86_400

function displayNameOf(profile: Doc<'profiles'>): string {
  const name = profile.fullName?.trim()
  return name && name.length > 0 ? name : 'Ukendt medlem'
}

/**
 * Afviser resultater, som det pågældende spil umuligt kan give.
 *
 * Formlerne er de samme som `game_scores_score_plausible` i den gamle database,
 * og de er skrevet med `lines`/`level` frem for faste tal, så de også afviser
 * vrøvl som "800 point og 2 rigtige svar". Resultatlisten er tillidsbaseret --
 * pointene tælles i browseren og kan ikke bevises herfra -- men et tal, der er
 * umuligt for antallet af ryddede rækker, skal ikke kunne lande på listen.
 */
function validateScore(
  game: Doc<'gameScores'>['game'],
  score: number,
  lines: number,
  level: number,
  durationSeconds: number,
) {
  if (!Number.isInteger(score) || score < 0 || score > SCORE_MAX) {
    throw new Error('SCORE_OUT_OF_RANGE')
  }
  if (!Number.isInteger(lines) || lines < 0 || lines > LINES_MAX) {
    throw new Error('SCORE_LINES_OUT_OF_RANGE')
  }
  if (!Number.isInteger(level) || level < 1 || level > LEVEL_MAX) {
    throw new Error('SCORE_LEVEL_OUT_OF_RANGE')
  }
  if (
    !Number.isInteger(durationSeconds) ||
    durationSeconds < 0 ||
    durationSeconds > DURATION_MAX
  ) {
    throw new Error('SCORE_DURATION_OUT_OF_RANGE')
  }

  let plausible: boolean
  switch (game) {
    case 'tetris':
      plausible = score <= 5000 + lines * (1000 + lines * 60)
      break
    case 'kaper':
      plausible = score <= 500 * (lines + 1)
      break
    case '2048':
      plausible = score <= 4_000_000
      break
    case 'naturquiz':
      plausible = score <= 150 * lines + 5 * lines * (lines - 1)
      break
    case 'sti':
      // En klaret bane har netop det antal poster, klassen lover, og pointene
      // kan ikke overstige klassens loft (CLASS_MAX_SCORE i motoren).
      plausible =
        (level === 1 && lines === 5 && score <= 1200) ||
        (level === 2 && lines === 8 && score <= 3600) ||
        (level === 3 && lines === 12 && score <= 6000)
      break
    case 'fugletraek':
      // Et parti rammer færrest mulige vendinger -- antallet af par -- så
      // lines skal mindst være klassens par. Et perfekt parti giver loftet.
      plausible =
        (level === 1 && lines >= 6 && score <= 1200) ||
        (level === 2 && lines >= 8 && score <= 3600) ||
        (level === 3 && lines >= 10 && score <= 6000)
      break
  }

  if (!plausible) throw new Error('SCORE_NOT_PLAUSIBLE')
}

/** Hvem er jeg? Bruges af siderne til at vise "dig" og til at afgøre, om der
 *  må slettes -- spillene rører ikke profildata, kun dette ene opslag. */
export const myPlayer = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireProfile(ctx)
    return {
      profileId: profile._id,
      displayName: displayNameOf(profile),
      isAdmin: profile.isAdmin,
    }
  },
})

/**
 * Resultatlisten for ét spil: de bedste point først, hentet gennem indekset
 * `by_game_score` og begrænset til `limit` rækker (200 som standard, højst
 * 500). Rækkerne er ikke filtreret pr. medlem -- det gør `rankLeaderboard` i
 * klienten, som før.
 *
 * Ved lige mange point afgør `createdAt` i klienten, hvem der nåede tallet
 * først. Indekset sorterer nemlig faldende på score og derefter på sin egen
 * internrækkefølge, og Convex kan ikke vende to felter hver sin vej i ét
 * opslag.
 */
export const leaderboard = query({
  args: { game: gameIdValidator, limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireProfile(ctx)

    const requested = args.limit ?? LEADERBOARD_LIMIT
    const limit = Math.min(Math.max(Math.floor(requested), 1), LEADERBOARD_MAX)

    return await ctx.db
      .query('gameScores')
      .withIndex('by_game_score', (q) => q.eq('game', args.game))
      .order('desc')
      .take(limit)
  },
})

/** De seneste partier for ét spil -- mest for at vise, at nogen spiller. */
export const recent = query({
  args: { game: gameIdValidator },
  handler: async (ctx, args) => {
    await requireProfile(ctx)

    return await ctx.db
      .query('gameScores')
      .withIndex('by_game_created', (q) => q.eq('game', args.game))
      .order('desc')
      .take(RECENT_LIMIT)
  },
})

/**
 * Spillerens eget bedste resultat. Det hentes for sig, fordi et medlem, der
 * endnu ikke er inde på listen, stadig skal kunne se sin egen rekord -- og
 * fordi det er ét opslag på indekset `by_player_game_score`, ikke en
 * gennemlæsning.
 */
export const personalBest = query({
  args: { game: gameIdValidator },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx)

    const best = await ctx.db
      .query('gameScores')
      .withIndex('by_player_game_score', (q) =>
        q.eq('playerId', profile._id).eq('game', args.game),
      )
      .order('desc')
      .first()

    return best
  },
})

/**
 * Et nyt resultat. Spilleren er altid den indloggede -- der er ingen
 * `playerId`-parameter, så ingen kan lægge point på en andens navn.
 *
 * Et resultat er en kendsgerning om et spil, der er spillet: det kan ikke
 * rettes bagefter, hverken af spilleren selv eller af en admin. Kan man rette
 * sit eget resultat, er listen ingenting værd. Slettes kan det derimod.
 */
export const submit = mutation({
  args: {
    game: gameIdValidator,
    score: v.number(),
    lines: v.optional(v.number()),
    level: v.optional(v.number()),
    durationSeconds: v.number(),
  },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)

    // Kolonnerne betyder ikke noget for alle spil; databasen satte sine
    // standardværdier (0 og 1), og det gør vi også.
    const lines = args.lines ?? 0
    const level = args.level ?? 1

    validateScore(args.game, args.score, lines, level, args.durationSeconds)

    return await ctx.db.insert('gameScores', {
      game: args.game,
      playerId: profile._id,
      playerName: displayNameOf(profile),
      score: args.score,
      lines,
      level,
      durationSeconds: args.durationSeconds,
      createdAt: Date.now(),
    })
  },
})

/** Slettes må det: sit eget (fortrudt) og en admins (moderation). */
export const remove = mutation({
  args: { scoreId: v.id('gameScores') },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)

    const score = await ctx.db.get(args.scoreId)
    if (score === null) throw new Error('SCORE_NOT_FOUND')
    if (score.playerId !== profile._id && !profile.isAdmin) {
      throw new Error('SCORE_NOT_ALLOWED')
    }

    await ctx.db.delete(score._id)
  },
})
