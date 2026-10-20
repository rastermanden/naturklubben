import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { requireProfile, requireWritableProfile } from './authz'
import { generateSingleEliminationBracket } from './bracket'
import {
  generateRoundRobinMatches,
  rankStandings,
  sharedLeaders,
  type Standing,
  type StandingsMatch,
} from './roundRobin'
import { gamesToWin } from './rules'

/**
 * Turneringsstyring: bøssetennisgolf med op til ca. 8 deltagere -- alle-mod-
 * alle med en løbende stillingstabel, eller udslagsrunder med bye i den runde,
 * hvor der er et ulige antal tilbage.
 *
 * Porten er tro mod `20260913100000_tournaments.sql` og de fire RPC-migrationer
 * efter den (`*_tournament_rpcs`, `*_bracket_byes`, `*_record_guards`,
 * `*_best_of_five_final`). Det, der var tre RPC'er med `security invoker`,
 * bliver her tre mutationer, som til gengæld også gør det, klienten før gjorde:
 * kampene laves af `bracket.ts`/`roundRobin.ts` -- de er kopieret uændret, med
 * deres tests -- og indsættes i samme mutation som turneringen.
 *
 * Aggregeringer (se `tables/community.ts`): `tournaments.pendingMatchCount`
 * gør "er turneringen færdig?" til et felt i stedet for en optælling, og
 * deltagernes `played`/`won`/`lost`/`gamesWon`/`gamesLost` er stillingen,
 * vedligeholdt i samme mutation som resultatet. Stillingen *sorteres* stadig
 * med `rankStandings`, så tiebreakerne er de samme som før.
 *
 * Et medlem kan læse og rette alt i en turnering -- det er et fælles værktøj
 * til én turneringsdag, hvor flere hjælper med at taste resultater ind. Kun
 * oprettelsen og sletningen er bundet til opretteren (eller en admin).
 */

const MIN_PARTICIPANTS = 2
const MAX_PARTICIPANTS = 16
const LIST_LIMIT = 20
const DETAIL_PARTICIPANTS_LIMIT = 64
const DETAIL_MATCHES_LIMIT = 128
const DETAIL_GAMES_LIMIT = 256

function displayNameOf(profile: Doc<'profiles'>): string {
  const name = profile.fullName?.trim()
  return name && name.length > 0 ? name : 'Unavngivet medlem'
}

/** Turneringerne, nyeste først. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireProfile(ctx)

    return await ctx.db
      .query('tournaments')
      .withIndex('by_created_at')
      .order('desc')
      .take(LIST_LIMIT)
  },
})

/**
 * En turnering med deltagere, kampe, enkeltspil og den sorterede stilling.
 *
 * Alle fire læsninger er bounded på deres eget indeks: deltagerne på seed,
 * kampene på (runde, kampnummer) og enkeltspillene på turneringen. Ingen af
 * dem læser hele tabellen, og ingen af dem tæller -- tallene står i
 * dokumenterne.
 */
export const detail = query({
  args: { tournamentId: v.id('tournaments') },
  handler: async (ctx, args) => {
    await requireProfile(ctx)

    const tournament = await ctx.db.get(args.tournamentId)
    if (tournament === null) throw new ConvexError('TOURNAMENT_NOT_FOUND')

    const participants = await ctx.db
      .query('tournamentParticipants')
      .withIndex('by_tournament_seed', (q) =>
        q.eq('tournamentId', tournament._id),
      )
      .take(DETAIL_PARTICIPANTS_LIMIT)

    const matches = await ctx.db
      .query('tournamentMatches')
      .withIndex('by_tournament_round_index', (q) =>
        q.eq('tournamentId', tournament._id),
      )
      .take(DETAIL_MATCHES_LIMIT)

    const games = await ctx.db
      .query('tournamentGames')
      .withIndex('by_tournament', (q) => q.eq('tournamentId', tournament._id))
      .take(DETAIL_GAMES_LIMIT)

    const participantById = new Map(
      participants.map((participant) => [participant._id as string, participant]),
    )

    // Stillingen er gemt som felter pr. deltager; her lægges den sammen med
    // kampene, så `rankStandings` kan bruge de samme tiebreakere som før
    // (indbyrdes opgør, derefter enkeltspilsforskel).
    const standingRows: Standing[] = participants.map((participant) => ({
      participantId: participant._id,
      played: participant.played,
      won: participant.won,
      lost: participant.lost,
      gamesWon: participant.gamesWon,
      gamesLost: participant.gamesLost,
    }))

    const gamesByMatch = new Map<string, { winnerId: string }[]>()
    for (const game of games) {
      const list = gamesByMatch.get(game.matchId) ?? []
      list.push({ winnerId: game.winnerId })
      gamesByMatch.set(game.matchId, list)
    }
    const standingMatches: StandingsMatch[] = matches.map((match) => ({
      participant1Id: match.participant1Id ?? '',
      participant2Id: match.participant2Id ?? '',
      winnerId: match.winnerId ?? null,
      games: gamesByMatch.get(match._id) ?? [],
    }))

    const ranked = rankStandings(standingRows, standingMatches)
    const leaderIds = new Set(
      sharedLeaders(ranked, standingMatches).map(
        (standing) => standing.participantId,
      ),
    )

    return {
      tournament,
      participants,
      matches,
      games,
      standings: ranked.map((standing) => ({
        ...standing,
        displayName:
          participantById.get(standing.participantId)?.displayName ?? 'Ukendt',
        seed: participantById.get(standing.participantId)?.seed ?? 0,
        isSharedLeader: leaderIds.has(standing.participantId),
      })),
    }
  },
})

/** Medlemmerne, der kan vælges som deltagere. Se den samme note i
 *  `badges.nomineeCandidates`: medlemsdomænet har endnu ingen liste at låne. */
export const participantCandidates = query({
  args: {},
  handler: async (ctx) => {
    await requireProfile(ctx)

    const profiles = await ctx.db.query('profiles').take(300)
    return profiles.map((profile) => ({
      profileId: profile._id,
      displayName: displayNameOf(profile),
    }))
  },
})

/** `GeneratedMatch` arbejder med strenge; indekseringen af vores indsatte
 *  dokumenter giver de rigtige id'er. */
function asParticipantId(
  value: string | null,
): Id<'tournamentParticipants'> | undefined {
  return value === null ? undefined : (value as Id<'tournamentParticipants'>)
}

/**
 * Opretter turneringen, dens deltagere og hele kampplanen i ét kald.
 * Erstatter `create_tournament_with_matches`.
 *
 * I den gamle app regnede klienten kampplanen ud og sendte den med til RPC'en.
 * Her gør mutationen det med de samme rene funktioner (`bracket.ts`,
 * `roundRobin.ts`), så en halv turnering ikke kan opstå, fordi klienten faldt
 * fra midt i indsættelsen. `nextMatchId` sættes i en anden gennemløb, fordi en
 * kamp først har et id, når den er indsat.
 */
export const create = mutation({
  args: {
    format: v.union(
      v.literal('round_robin'),
      v.literal('single_elimination'),
    ),
    participantProfileIds: v.array(v.id('profiles')),
  },
  handler: async (ctx, args) => {
    const creator = await requireWritableProfile(ctx)

    const profileIds = args.participantProfileIds
    if (new Set(profileIds).size !== profileIds.length) {
      throw new ConvexError('TOURNAMENT_DUPLICATE_PARTICIPANT')
    }
    if (profileIds.length < MIN_PARTICIPANTS) {
      throw new ConvexError('TOURNAMENT_TOO_FEW_PARTICIPANTS')
    }
    if (profileIds.length > MAX_PARTICIPANTS) {
      throw new ConvexError('TOURNAMENT_TOO_MANY_PARTICIPANTS')
    }

    const now = Date.now()
    const tournamentId = await ctx.db.insert('tournaments', {
      format: args.format,
      status: 'in_progress',
      createdByProfileId: creator._id,
      createdByName: displayNameOf(creator),
      createdAt: now,
      participantCount: profileIds.length,
      matchCount: 0,
      pendingMatchCount: 0,
    })

    const participantIds: Id<'tournamentParticipants'>[] = []
    for (const [index, profileId] of profileIds.entries()) {
      const profile = await ctx.db.get(profileId)
      // Et manglende medlem vælter hele mutationen, så turneringen ikke bliver
      // oprettet med en tom plads i bracketten.
      if (profile === null) throw new ConvexError('TOURNAMENT_PARTICIPANT_NOT_FOUND')

      participantIds.push(
        await ctx.db.insert('tournamentParticipants', {
          tournamentId,
          profileId: profile._id,
          displayName: displayNameOf(profile),
          seed: index + 1,
          played: 0,
          won: 0,
          lost: 0,
          gamesWon: 0,
          gamesLost: 0,
        }),
      )
    }

    const plan =
      args.format === 'round_robin'
        ? generateRoundRobinMatches(participantIds)
        : generateSingleEliminationBracket(
            participantIds.map((id, index) => ({ id, seed: index + 1 })),
          )

    const matchIds = new Map<string, Id<'tournamentMatches'>>()
    for (const match of plan) {
      const matchId = await ctx.db.insert('tournamentMatches', {
        tournamentId,
        round: match.round,
        matchIndex: match.matchIndex,
        participant1Id: asParticipantId(match.participant1Id),
        participant2Id: asParticipantId(match.participant2Id),
        winnerId: asParticipantId(match.winnerId),
        status: match.status,
        bye: match.bye,
        bestOf: match.bestOf,
      })
      matchIds.set(`${match.round}:${match.matchIndex}`, matchId)
    }

    for (const match of plan) {
      if (match.nextMatchRound === null || match.nextMatchIndex === null) {
        continue
      }
      const matchId = matchIds.get(`${match.round}:${match.matchIndex}`)
      const nextMatchId = matchIds.get(
        `${match.nextMatchRound}:${match.nextMatchIndex}`,
      )
      if (matchId === undefined || nextMatchId === undefined) {
        throw new ConvexError('TOURNAMENT_PLAN_INVALID')
      }
      await ctx.db.patch(matchId, {
        nextMatchId,
        nextMatchSlot: match.nextMatchSlot ?? undefined,
      })
    }

    // En bye i runde 1 er allerede afgjort ved oprettelsen og tæller derfor
    // ikke som ventende.
    const pendingMatchCount = plan.filter(
      (match) => match.status === 'pending',
    ).length
    await ctx.db.patch(tournamentId, {
      matchCount: plan.length,
      pendingMatchCount,
    })

    return tournamentId
  },
})

/**
 * Taster resultatet af en kamp ind: enkeltspillene i rækkefølge, hvorefter
 * vinderen rykker videre i bracketten. Erstatter
 * `record_tournament_match_result` i sin nyeste form (bedst af fem-finalen og
 * record-guards indregnet).
 *
 * Tjekkene kommer i samme rækkefølge som i migrationen: først det, der er galt
 * med selve indtastningen (ingen vinder af 2 eller 3 spil, for mange spil,
 * et spil vundet af en fremmed), derefter kampens tilstand. Så får en
 * dobbeltindtastning med et gyldigt resultat den rigtige besked.
 *
 * En bye afgøres aldrig ved indtastning. Den afgøres automatisk, når dens ene
 * plads bliver udfyldt -- og kaskaden herunder kan gå gennem flere byes i
 * træk, hvis de følger lige efter hinanden.
 */
export const record = mutation({
  args: {
    matchId: v.id('tournamentMatches'),
    gameWinnerIds: v.array(v.id('tournamentParticipants')),
  },
  handler: async (ctx, args) => {
    await requireWritableProfile(ctx)

    const match = await ctx.db.get(args.matchId)
    if (match === null) throw new ConvexError('MATCH_NOT_FOUND')

    const needed = gamesToWin(match.bestOf)

    const winsBy = new Map<string, number>()
    for (const id of args.gameWinnerIds) {
      winsBy.set(id, (winsBy.get(id) ?? 0) + 1)
    }
    const winnerId = args.gameWinnerIds.find(
      (id) => (winsBy.get(id) ?? 0) >= needed,
    )
    if (winnerId === undefined) throw new ConvexError('MATCH_NO_MAJORITY')
    if (args.gameWinnerIds.length > match.bestOf) {
      throw new ConvexError('MATCH_TOO_MANY_GAMES')
    }

    if (match.status !== 'pending') throw new ConvexError('MATCH_ALREADY_COMPLETED')
    if (match.bye) throw new ConvexError('MATCH_IS_BYE')

    const firstId = match.participant1Id
    const secondId = match.participant2Id
    if (firstId === undefined || secondId === undefined) {
      throw new ConvexError('MATCH_MISSING_PARTICIPANT')
    }

    // Samme regel som triggeren `tournament_games_winner_is_participant`:
    // et enkeltspil skal handle om kampens egne to deltagere.
    for (const id of args.gameWinnerIds) {
      if (id !== firstId && id !== secondId) {
        throw new ConvexError('GAME_WINNER_NOT_IN_MATCH')
      }
    }

    const tournament = await ctx.db.get(match.tournamentId)
    if (tournament === null) throw new ConvexError('TOURNAMENT_NOT_FOUND')

    const now = Date.now()
    for (const [index, id] of args.gameWinnerIds.entries()) {
      await ctx.db.insert('tournamentGames', {
        matchId: match._id,
        tournamentId: tournament._id,
        gameNumber: index + 1,
        winnerId: id,
        createdAt: now,
      })
    }

    await ctx.db.patch(match._id, { status: 'completed', winnerId })
    let pendingMatchCount = Math.max(tournament.pendingMatchCount - 1, 0)

    // Stillingen er et aggregat: den opdateres her, i samme mutation som
    // resultatet, så en side aldrig kan vise en kamp uden dens virkning.
    const loserId = winnerId === firstId ? secondId : firstId
    const winner = await ctx.db.get(winnerId)
    const loser = await ctx.db.get(loserId)
    const winnerGames = winsBy.get(winnerId) ?? 0
    const loserGames = args.gameWinnerIds.length - winnerGames
    if (winner !== null && loser !== null) {
      await ctx.db.patch(winner._id, {
        played: winner.played + 1,
        won: winner.won + 1,
        gamesWon: winner.gamesWon + winnerGames,
        gamesLost: winner.gamesLost + loserGames,
      })
      await ctx.db.patch(loser._id, {
        played: loser.played + 1,
        lost: loser.lost + 1,
        gamesWon: loser.gamesWon + loserGames,
        gamesLost: loser.gamesLost + winnerGames,
      })
    }

    // Ryk vinderen videre -- og gennem eventuelle byes, der nu er afgjort.
    let nextMatchId = match.nextMatchId ?? null
    let nextMatchSlot = match.nextMatchSlot ?? 1
    while (nextMatchId !== null) {
      const next = await ctx.db.get(nextMatchId)
      if (next === null) break

      await ctx.db.patch(
        next._id,
        nextMatchSlot === 1
          ? { participant1Id: winnerId }
          : { participant2Id: winnerId },
      )

      if (!next.bye) break

      await ctx.db.patch(next._id, { status: 'completed', winnerId })
      pendingMatchCount = Math.max(pendingMatchCount - 1, 0)
      nextMatchId = next.nextMatchId ?? null
      nextMatchSlot = next.nextMatchSlot ?? 1
    }

    let status = tournament.status
    if (tournament.format === 'single_elimination') {
      // Er der ingen næste kamp efter finalen, er turneringen slut.
      if (nextMatchId === null) status = 'completed'
    } else if (pendingMatchCount === 0) {
      status = 'completed'
    }

    await ctx.db.patch(tournament._id, { pendingMatchCount, status })

    return { winnerId }
  },
})

/**
 * Fortryder en afgjort kamp: sletter dens enkeltspil, sætter den tilbage til
 * 'pending' og trækker vinderen ud af den næste kamp igen. Erstatter
 * `undo_tournament_match_result`.
 *
 * Det må kun ske, når det er trygt: en bye kan ikke fortrydes (der er intet
 * resultat at fortryde), og er den kamp, vinderen er rykket videre til, selv
 * afgjort, skal den fortrydes først. Byes, der kun blev afgjort som en
 * automatisk følge af netop dette resultat, ryddes med i samme runde.
 *
 * Stillingen rulles tilbage med de samme tal, som `record` lagde til.
 */
export const undo = mutation({
  args: { matchId: v.id('tournamentMatches') },
  handler: async (ctx, args) => {
    await requireWritableProfile(ctx)

    const match = await ctx.db.get(args.matchId)
    if (match === null) throw new ConvexError('MATCH_NOT_FOUND')
    if (match.status !== 'completed') throw new ConvexError('MATCH_NOT_COMPLETED')
    if (match.participant2Id === undefined) throw new ConvexError('MATCH_IS_BYE')

    const tournament = await ctx.db.get(match.tournamentId)
    if (tournament === null) throw new ConvexError('TOURNAMENT_NOT_FOUND')
    let pendingMatchCount = tournament.pendingMatchCount

    let nextMatchId = match.nextMatchId ?? null
    let nextMatchSlot = match.nextMatchSlot ?? 1
    while (nextMatchId !== null) {
      const next = await ctx.db.get(nextMatchId)
      if (next === null) break

      if (next.status === 'completed' && !next.bye) {
        throw new ConvexError('MATCH_NEXT_COMPLETED')
      }

      await ctx.db.patch(
        next._id,
        nextMatchSlot === 1
          ? { participant1Id: undefined }
          : { participant2Id: undefined },
      )

      if (next.status !== 'completed') break

      // En bye, der blev afgjort af netop dette resultat, bliver ventende igen.
      await ctx.db.patch(next._id, { status: 'pending', winnerId: undefined })
      pendingMatchCount += 1
      nextMatchId = next.nextMatchId ?? null
      nextMatchSlot = next.nextMatchSlot ?? 1
    }

    const games = await ctx.db
      .query('tournamentGames')
      .withIndex('by_match_game', (q) => q.eq('matchId', match._id))
      .take(10)

    const winsBy = new Map<string, number>()
    for (const game of games) {
      winsBy.set(game.winnerId, (winsBy.get(game.winnerId) ?? 0) + 1)
    }
    for (const game of games) {
      await ctx.db.delete(game._id)
    }

    if (match.winnerId !== undefined) {
      const winnerId = match.winnerId
      const loserId =
        winnerId === match.participant1Id
          ? match.participant2Id
          : match.participant1Id
      const winner = await ctx.db.get(winnerId)
      const loser = loserId === undefined ? null : await ctx.db.get(loserId)
      const winnerGames = winsBy.get(winnerId) ?? 0
      const loserGames = games.length - winnerGames

      if (winner !== null) {
        await ctx.db.patch(winner._id, {
          played: Math.max(winner.played - 1, 0),
          won: Math.max(winner.won - 1, 0),
          gamesWon: Math.max(winner.gamesWon - winnerGames, 0),
          gamesLost: Math.max(winner.gamesLost - loserGames, 0),
        })
      }
      if (loser !== null) {
        await ctx.db.patch(loser._id, {
          played: Math.max(loser.played - 1, 0),
          lost: Math.max(loser.lost - 1, 0),
          gamesWon: Math.max(loser.gamesWon - loserGames, 0),
          gamesLost: Math.max(loser.gamesLost - winnerGames, 0),
        })
      }
    }

    await ctx.db.patch(match._id, { status: 'pending', winnerId: undefined })
    pendingMatchCount += 1

    await ctx.db.patch(tournament._id, {
      pendingMatchCount,
      status: tournament.status === 'completed' ? 'in_progress' : tournament.status,
    })
  },
})

/**
 * Sletter en turnering med deltagere, kampe og enkeltspil. Convex har ingen
 * `on delete cascade`, så rækkefølgen er håndholdt: børnene før faren.
 *
 * Den gamle app lod ethvert medlem slette en turnering (RLS-politikken var
 * `using (true)`). Her kræves opretteren eller en admin -- en stramning, der
 * ikke ændrer noget i praksis, men som gør et uheld mindre sandsynligt.
 */
export const removeTournament = mutation({
  args: { tournamentId: v.id('tournaments') },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)

    const tournament = await ctx.db.get(args.tournamentId)
    if (tournament === null) throw new ConvexError('TOURNAMENT_NOT_FOUND')
    if (tournament.createdByProfileId !== profile._id && !profile.isAdmin) {
      throw new ConvexError('TOURNAMENT_NOT_ALLOWED')
    }

    const games = await ctx.db
      .query('tournamentGames')
      .withIndex('by_tournament', (q) => q.eq('tournamentId', tournament._id))
      .take(DETAIL_GAMES_LIMIT)
    for (const game of games) {
      await ctx.db.delete(game._id)
    }

    const matches = await ctx.db
      .query('tournamentMatches')
      .withIndex('by_tournament_round_index', (q) =>
        q.eq('tournamentId', tournament._id),
      )
      .take(DETAIL_MATCHES_LIMIT)
    for (const match of matches) {
      await ctx.db.delete(match._id)
    }

    const participants = await ctx.db
      .query('tournamentParticipants')
      .withIndex('by_tournament_seed', (q) =>
        q.eq('tournamentId', tournament._id),
      )
      .take(DETAIL_PARTICIPANTS_LIMIT)
    for (const participant of participants) {
      await ctx.db.delete(participant._id)
    }

    await ctx.db.delete(tournament._id)
  },
})
