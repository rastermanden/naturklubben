import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * Fællesskabsdomænet: badges, naturlog-observationer, spillenes resultater og
 * turneringer.
 *
 * Oversat fra de Postgres-tabeller, der havde samme rolle (se migrationerne
 * `*_badges.sql`, `*_observations.sql`, `*_game_scores*.sql` og
 * `*_tournaments*.sql` i roden). Feltnavnene er camelCase, fordi et
 * Convex-dokument er et JavaScript-objekt hele vejen igennem.
 *
 * To ting er anderledes end i Postgres, og de er begge bevidste:
 *
 * 1. **Unikheder, der kun gjaldt nogle rækker, findes ikke.** Postgres havde
 *    fx et delvist unikt indeks, der tillod præcis én *åben* indstilling pr.
 *    badge og person. Convex kender ikke delvise indekser, så reglen håndhæves
 *    i mutationen, der opretter indstillingen (`badges.nominate`) ved at slå op
 *    i `by_badge_nominee`. Det holder, fordi en Convex-mutation er serialiserbar:
 *    to samtidige kald kan ikke begge se "ingen åben indstilling".
 * 2. **Aggregeringer er felter, ikke `count(*)`.** Convex har ingen `count(*)`,
 *    `group by` eller joins i queries. Alt, hvad en side skal kunne vise som et
 *    tal eller en stilling, vedligeholdes derfor som et felt i det dokument,
 *    det handler om -- `badges.awardedCount`, `badgeNominations.approveCount`,
 *    `tournaments.pendingMatchCount` og deltagernes `won`/`lost`/`gamesWon` --
 *    og opdateres i samme mutation som ændringen. En query, der skulle tælle
 *    efter bagefter, ville læse hele tabellen for at svare på noget, mutationen
 *    allerede vidste.
 */

/** Spillene, der kan lægge resultater på klubbens liste. */
export const gameIdValidator = v.union(
  v.literal('tetris'),
  v.literal('kaper'),
  v.literal('2048'),
  v.literal('naturquiz'),
  v.literal('sti'),
  v.literal('fugletraek'),
)

export const communityTables = {
  /** Badgekataloget. Kun admins skriver; alle medlemmer læser. */
  badges: defineTable({
    slug: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    /**
     * Convex' eget filstorage frem for en Supabase-bucket. `render-badge-print`
     * skrev trykfilen til en sti i en bucket; her er det et fil-id, og URL'en
     * slås op ved læsning.
     */
    imageStorageId: v.id('_storage'),
    imageWidth: v.number(),
    imageHeight: v.number(),
    imageMimeType: v.union(
      v.literal('image/png'),
      v.literal('image/jpeg'),
      v.literal('image/webp'),
    ),
    /** Udsnittet er pixelkoordinater *i originalen*: den firkant, den runde
     *  visning er indskrevet i. App og trykfil læser samme tal. */
    cropX: v.number(),
    cropY: v.number(),
    cropSize: v.number(),
    diameterMm: v.number(),
    bleedMm: v.number(),
    /** Trykfilen. Statussen ejes af `badges.claimPrint`/`completePrint`. */
    printStorageId: v.optional(v.id('_storage')),
    printStatus: v.union(
      v.literal('pending'),
      v.literal('rendering'),
      v.literal('ready'),
      v.literal('failed'),
    ),
    printError: v.optional(v.string()),
    printAttempts: v.number(),
    printStartedAt: v.optional(v.number()),
    printCompletedAt: v.optional(v.number()),
    isActive: v.boolean(),
    createdByProfileId: v.optional(v.id('profiles')),
    createdAt: v.number(),
    updatedAt: v.number(),
    /** Aggregat: antal tildelinger. Gør det muligt at afvise en sletning af en
     *  badge, nogen har fået, uden at læse `memberBadges` igennem. */
    awardedCount: v.number(),
  })
    .index('by_slug', ['slug'])
    .index('by_active_name', ['isActive', 'name']),

  /**
   * Indstillinger til en badge. Se badge #159: medlemmer indstiller hinanden,
   * og to *forskellige* admins skal godkende, før badgen tildeles.
   *
   * `nomineeName`, `nominatedByName` og felterne på tildelingen er kopier, ikke
   * opslag: Convex kan ikke joine, og en indstilling skal kunne læses uden at
   * slå tre tabeller op bagefter.
   */
  badgeNominations: defineTable({
    badgeId: v.id('badges'),
    badgeName: v.string(),
    nomineeId: v.id('profiles'),
    nomineeName: v.string(),
    nominatedById: v.id('profiles'),
    nominatedByName: v.string(),
    reason: v.string(),
    status: v.union(
      v.literal('pending'),
      v.literal('approved'),
      v.literal('rejected'),
    ),
    /** Aggregat: stemmerne, så mutationen ikke skal tælle dem efter. */
    approveCount: v.number(),
    rejectCount: v.number(),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index('by_badge_nominee', ['badgeId', 'nomineeId'])
    .index('by_status_created', ['status', 'createdAt'])
    .index('by_nominator_created', ['nominatedById', 'createdAt']),

  /** Én stemme pr. admin pr. indstilling -- håndhævet i `badges.vote`. */
  badgeNominationApprovals: defineTable({
    nominationId: v.id('badgeNominations'),
    adminId: v.id('profiles'),
    adminName: v.string(),
    vote: v.union(v.literal('approve'), v.literal('reject')),
    comment: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_nomination_admin', ['nominationId', 'adminId'])
    .index('by_nomination', ['nominationId']),

  /** De tildelte badges. `nominationId`/`nominatedById`/`reason` kopieres med,
   *  så profilen kan vise hvem der indstillede og hvorfor. */
  memberBadges: defineTable({
    badgeId: v.id('badges'),
    badgeName: v.string(),
    badgeSlug: v.string(),
    profileId: v.id('profiles'),
    profileName: v.string(),
    nominationId: v.optional(v.id('badgeNominations')),
    nominatedById: v.optional(v.id('profiles')),
    nominatedByName: v.optional(v.string()),
    reason: v.optional(v.string()),
    awardedAt: v.number(),
  })
    .index('by_profile_awarded', ['profileId', 'awardedAt'])
    .index('by_badge_profile', ['badgeId', 'profileId'])
    .index('by_badge', ['badgeId']),

  /**
   * Det fysiske badge: en opgave med 24-timers ur, der starter ved tildelingen.
   * Admin-værktøj -- medlemmerne ser badgen på profilen, ikke limpistolen.
   */
  badgeProductions: defineTable({
    memberBadgeId: v.id('memberBadges'),
    badgeId: v.id('badges'),
    badgeName: v.string(),
    profileId: v.id('profiles'),
    profileName: v.string(),
    dueAt: v.number(),
    claimedById: v.optional(v.id('profiles')),
    claimedByName: v.optional(v.string()),
    claimedAt: v.optional(v.number()),
    status: v.union(
      v.literal('pending'),
      v.literal('in_progress'),
      v.literal('done'),
    ),
    completedById: v.optional(v.id('profiles')),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_status_due', ['status', 'dueAt'])
    .index('by_member_badge', ['memberBadgeId']),

  /**
   * Naturloggen: hvad medlemmerne har set. Klubbens historie, ikke personlige
   * data -- derfor `createdByName` som kopi og intet krav om en levende profil.
   *
   * `photoId` er en tekst og ikke `v.id('photos')`, fordi galleriet endnu ikke
   * er portet til V2. Feltet bliver et rigtigt id, når `gallery`-domænet
   * lander; indtil da kan det kun sættes af kode, der selv kender et billede.
   */
  observations: defineTable({
    species: v.string(),
    location: v.optional(v.string()),
    /** Kalenderdagen som `YYYY-MM-DD`, ikke et tidspunkt. */
    observedOn: v.string(),
    notes: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    photoId: v.optional(v.string()),
    createdById: v.optional(v.id('profiles')),
    createdByName: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_observed_on', ['observedOn', 'createdAt'])
    .index('by_created_by', ['createdById'])
    .index('by_photo', ['photoId']),

  /**
   * Ét dokument pr. spillet parti. Kolonnerne deles af alle spillene og betyder
   * noget forskelligt: `lines` er ryddede rækker i Tetris, træk i Kaptajn Kaper,
   * rigtige svar i Naturquiz, poster i Stifinderen og vendinger i Fugletræk;
   * `level` er niveau, rang eller baneklasse.
   *
   * Der er bevidst *intet* unikt indeks på (game, playerId): et medlem må gerne
   * spille tyve gange og få tyve rækker -- resultatlisten viser det bedste af
   * dem. Det var også reglen i Postgres (se `game_scores_leaderboard_idx`), og
   * `games.leaderboard` arver dens begrundelse: et medlems bedste resultat er
   * deres højeste, så er det ikke i toppen af listen, er medlemmet heller ikke.
   */
  gameScores: defineTable({
    game: gameIdValidator,
    playerId: v.id('profiles'),
    /** Kopi af navnet ved indsendelsen, så listen ikke skal slå profiler op. */
    playerName: v.string(),
    score: v.number(),
    lines: v.number(),
    level: v.number(),
    durationSeconds: v.number(),
    createdAt: v.number(),
  })
    .index('by_game_score', ['game', 'score'])
    .index('by_game_created', ['game', 'createdAt'])
    .index('by_player_game_score', ['playerId', 'game', 'score']),

  /** Selve turneringen. `participantCount` og `pendingMatchCount` er
   *  aggregater -- se kommentaren øverst. */
  tournaments: defineTable({
    format: v.union(
      v.literal('round_robin'),
      v.literal('single_elimination'),
    ),
    status: v.union(
      v.literal('setup'),
      v.literal('in_progress'),
      v.literal('completed'),
    ),
    createdByProfileId: v.optional(v.id('profiles')),
    createdByName: v.optional(v.string()),
    createdAt: v.number(),
    participantCount: v.number(),
    matchCount: v.number(),
    pendingMatchCount: v.number(),
  }).index('by_created_at', ['createdAt']),

  /**
   * Deltagere. `displayName` er et snapshot, så en tidligere turnering stadig
   * viser et navn, hvis medlemmet siden sletter sin konto -- samme grundtanke
   * som i `observations`.
   *
   * Stillingen (`won`, `lost`, `gamesWon`, `gamesLost`) vedligeholdes i samme
   * mutation, der afgør en kamp. Det er den aggregering, der erstatter den
   * `computeStandings`-funktion, klienten før kørte over alle kampe: Convex har
   * ingen `group by`, og en query må ikke læse alle kampe for at tælle dem.
   */
  tournamentParticipants: defineTable({
    tournamentId: v.id('tournaments'),
    profileId: v.optional(v.id('profiles')),
    displayName: v.string(),
    seed: v.number(),
    played: v.number(),
    won: v.number(),
    lost: v.number(),
    gamesWon: v.number(),
    gamesLost: v.number(),
  })
    .index('by_tournament_seed', ['tournamentId', 'seed'])
    .index('by_tournament_profile', ['tournamentId', 'profileId'])
    .index('by_profile', ['profileId']),

  /**
   * En kamp er bedst af tre -- undtagen finalen, der er bedst af fem
   * (`bestOf`). `nextMatchId`/`nextMatchSlot` er, hvordan bracketten hænger
   * sammen uden at skulle regnes om ved hvert resultat.
   *
   * `bye` markerer en kamp, hvis anden plads aldrig bliver udfyldt. En bye i
   * runde 1 afgøres ved oprettelsen; en bye i en senere runde afgøres
   * automatisk, når dens ene plads bliver udfyldt (se `tournaments.record`).
   */
  tournamentMatches: defineTable({
    tournamentId: v.id('tournaments'),
    round: v.number(),
    matchIndex: v.number(),
    participant1Id: v.optional(v.id('tournamentParticipants')),
    participant2Id: v.optional(v.id('tournamentParticipants')),
    winnerId: v.optional(v.id('tournamentParticipants')),
    status: v.union(v.literal('pending'), v.literal('completed')),
    bye: v.boolean(),
    bestOf: v.number(),
    nextMatchId: v.optional(v.id('tournamentMatches')),
    nextMatchSlot: v.optional(v.number()),
  })
    .index('by_tournament_round_index', [
      'tournamentId',
      'round',
      'matchIndex',
    ])
    .index('by_tournament_status', ['tournamentId', 'status']),

  /** Enkeltspillene i en kamp, i rækkefølge. `gameNumber` er 1-5. */
  tournamentGames: defineTable({
    matchId: v.id('tournamentMatches'),
    tournamentId: v.id('tournaments'),
    gameNumber: v.number(),
    winnerId: v.id('tournamentParticipants'),
    createdAt: v.number(),
  })
    .index('by_match_game', ['matchId', 'gameNumber'])
    .index('by_tournament', ['tournamentId']),
}
