/// <reference types="vite/client" />
import { describe, expect, it, vi } from 'vitest'
import { convexTest } from 'convex-test'
import { ConvexError } from 'convex/values'
import { api, internal } from './_generated/api'
import schema from './schema'
import { ACCOUNT_DELETION_CONFIRMATION } from './account'

/**
 * Kontosletningen: den vigtigste invariants i `convex/account.ts`.
 *
 * Testen dækker det, der ikke kan ses af koden alene: at en profil med indhold
 * i *alle* domæner faktisk bliver slettet, at begivenheder og beskeder bliver
 * stående anonymiserede, at filerne forsvinder fra Convex' fillager, og at
 * klubbens sidste administrator ikke kan slette sig selv.
 *
 * Kører først, når `npx convex dev` har genereret `convex/_generated/` -- se
 * "Verifikation" i `V2/README.md`.
 */

const modules = import.meta.glob('./**/*.ts')

function setup() {
  return convexTest(schema, modules)
}

type Test = ReturnType<typeof setup>

/** Et medlem med auth-bruger og profil, som resten af testen kan hænge data på. */
async function seedMember(t: Test, email: string, isAdmin = false) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { email })
    const profileId = await ctx.db.insert('profiles', {
      userId,
      fullName: 'Test Medlem',
      isAdmin,
      chatColor: '#16a34a',
      causes: [],
      chatNotificationPreference: 'all',
      featureNotificationsEnabled: true,
      createdAt: 1_700_000_000_000,
    })
    return { userId, profileId }
  })
}

describe('kontosletning', () => {
  it('sletter alt personligt og anonymiserer historikken', async () => {
    const t = setup()
    // To administratorer, så sidste-admin-tjekket ikke stopper sletningen.
    const member = await seedMember(t, 'medlem@example.com', true)
    const other = await seedMember(t, 'anden@example.com', true)

    const ids = await t.run(async (ctx) => {
      const original = await ctx.storage.store(new Blob(['original']))
      const optimized = await ctx.storage.store(new Blob(['optimeret']))
      const badgeImage = await ctx.storage.store(new Blob(['badge']))
      const otherFile = await ctx.storage.store(new Blob(['andens fil']))

      // --- Galleri ---------------------------------------------------------
      const photoId = await ctx.db.insert('photos', {
        storageId: original,
        optimizedStorageId: optimized,
        uploaderId: member.profileId,
        albumKey: 'without-event',
        createdAt: 1000,
        optimizationStatus: 'ready',
        optimizationAttempts: 1,
        commentCount: 1,
      })
      await ctx.db.insert('photoAlbums', {
        albumKey: 'without-event',
        photoCount: 1,
        latestPhotoAt: 1000,
        coverPhotoId: photoId,
        coverOptimizedStorageId: optimized,
        coverCreatedAt: 1000,
      })
      await ctx.db.insert('photoComments', {
        photoId,
        authorId: other.profileId,
        body: 'Flot billede',
        createdAt: 1100,
      })

      const otherPhotoId = await ctx.db.insert('photos', {
        storageId: otherFile,
        uploaderId: other.profileId,
        albumKey: 'uden-album',
        createdAt: 1200,
        optimizationStatus: 'ready',
        optimizationAttempts: 1,
        commentCount: 1,
      })
      await ctx.db.insert('photoComments', {
        photoId: otherPhotoId,
        authorId: member.profileId,
        body: 'Min kommentar',
        createdAt: 1300,
      })
      await ctx.db.insert('photoModerationLog', {
        photoId,
        actorId: member.profileId,
        actorName: 'Test Medlem',
        uploaderId: member.profileId,
        uploaderName: 'Test Medlem',
        storageId: original,
        deletionAttempt: 1,
        status: 'completed',
        requestedAt: 1400,
        completedAt: 1400,
      })

      // --- Kalender --------------------------------------------------------
      const eventId = await ctx.db.insert('events', {
        title: 'Fællestur',
        startAt: 2000,
        endsAt: 3000,
        createdBy: member.profileId,
        isPublic: true,
        attendingCount: 1,
        waitlistedCount: 0,
        approvedGuestCount: 0,
        createdAt: 1500,
      })
      await ctx.db.insert('eventAttendance', {
        eventId,
        profileId: member.profileId,
        status: 'attending',
        queuedAt: 1600,
      })
      await ctx.db.insert('eventTasks', {
        eventId,
        title: 'Køb ind',
        createdBy: member.profileId,
        createdAt: 1700,
      })
      await ctx.db.insert('eventTasks', {
        eventId,
        title: 'Tænd bål',
        assignedTo: member.profileId,
        createdBy: other.profileId,
        createdAt: 1800,
      })

      // --- Chat ------------------------------------------------------------
      const ownMessageId = await ctx.db.insert('messages', {
        room: 'general',
        authorId: member.profileId,
        content: 'Hej med jer',
        messageType: 'text',
        mentions: [],
        createdAt: 2000,
        clientId: 'egen-besked',
      })
      const otherMessageId = await ctx.db.insert('messages', {
        room: 'general',
        authorId: other.profileId,
        content: 'Hej medlem',
        messageType: 'text',
        mentions: [member.profileId],
        createdAt: 2100,
        clientId: 'andens-besked',
        deletedAt: 2200,
        deletedBy: member.profileId,
      })
      await ctx.db.insert('messageReactions', {
        messageId: otherMessageId,
        profileId: member.profileId,
        emoji: '👍',
        createdAt: 2300,
      })
      const pollId = await ctx.db.insert('chatPolls', {
        messageId: ownMessageId,
        question: 'Hvor mødes vi?',
        createdBy: member.profileId,
        createdAt: 2400,
        closedAt: 2500,
        closedBy: member.profileId,
      })
      const optionId = await ctx.db.insert('pollOptions', {
        pollId,
        position: 0,
        label: 'Ved søen',
      })
      await ctx.db.insert('pollVotes', {
        pollId,
        profileId: member.profileId,
        optionId,
        createdAt: 2600,
      })
      await ctx.db.insert('chatPresence', {
        profileId: member.profileId,
        room: 'general',
        lastSeenAt: 2700,
        isAway: false,
      })
      await ctx.db.insert('chatReads', {
        profileId: member.profileId,
        room: 'general',
        lastReadAt: 2800,
      })

      // --- Fællesskab ------------------------------------------------------
      await ctx.db.insert('gameScores', {
        game: 'tetris',
        playerId: member.profileId,
        playerName: 'Test Medlem',
        score: 1200,
        lines: 8,
        level: 2,
        durationSeconds: 180,
        createdAt: 3000,
      })
      await ctx.db.insert('observations', {
        species: 'Ræv',
        observedOn: '2026-03-01',
        createdById: member.profileId,
        createdByName: 'Test Medlem',
        createdAt: 3100,
        updatedAt: 3100,
      })
      const badgeId = await ctx.db.insert('badges', {
        slug: 'ravnen',
        name: 'Ravnen',
        imageStorageId: badgeImage,
        imageWidth: 400,
        imageHeight: 400,
        imageMimeType: 'image/png',
        cropX: 0,
        cropY: 0,
        cropSize: 400,
        diameterMm: 44,
        bleedMm: 2,
        printStatus: 'pending',
        printAttempts: 0,
        isActive: true,
        createdByProfileId: member.profileId,
        createdAt: 3200,
        updatedAt: 3200,
        awardedCount: 1,
      })
      // Afgjort indstilling: medlemmet har indstillet og stemt på den. Den skal
      // blive stående, og stemmetallet skal regnes om, når stemmen forsvinder.
      const keptNominationId = await ctx.db.insert('badgeNominations', {
        badgeId,
        badgeName: 'Ravnen',
        nomineeId: other.profileId,
        nomineeName: 'Andet Medlem',
        nominatedById: member.profileId,
        nominatedByName: 'Test Medlem',
        reason: 'Hjælpsom',
        status: 'approved',
        approveCount: 2,
        rejectCount: 0,
        createdAt: 3300,
        resolvedAt: 3400,
      })
      await ctx.db.insert('badgeNominationApprovals', {
        nominationId: keptNominationId,
        adminId: member.profileId,
        adminName: 'Test Medlem',
        vote: 'approve',
        createdAt: 3310,
      })
      await ctx.db.insert('badgeNominationApprovals', {
        nominationId: keptNominationId,
        adminId: other.profileId,
        adminName: 'Andet Medlem',
        vote: 'approve',
        createdAt: 3320,
      })
      // Åben indstilling, hvor medlemmet er modtageren: den skal slettes sammen
      // med sine stemmer.
      const droppedNominationId = await ctx.db.insert('badgeNominations', {
        badgeId,
        badgeName: 'Ravnen',
        nomineeId: member.profileId,
        nomineeName: 'Test Medlem',
        nominatedById: other.profileId,
        nominatedByName: 'Andet Medlem',
        reason: 'God til at lave bål',
        status: 'pending',
        approveCount: 1,
        rejectCount: 0,
        createdAt: 3500,
      })
      await ctx.db.insert('badgeNominationApprovals', {
        nominationId: droppedNominationId,
        adminId: other.profileId,
        adminName: 'Andet Medlem',
        vote: 'approve',
        createdAt: 3510,
      })
      const memberBadgeId = await ctx.db.insert('memberBadges', {
        badgeId,
        badgeName: 'Ravnen',
        badgeSlug: 'ravnen',
        profileId: member.profileId,
        profileName: 'Test Medlem',
        nominatedById: other.profileId,
        nominatedByName: 'Andet Medlem',
        reason: 'God til at lave bål',
        awardedAt: 3600,
      })
      await ctx.db.insert('badgeProductions', {
        memberBadgeId,
        badgeId,
        badgeName: 'Ravnen',
        profileId: member.profileId,
        profileName: 'Test Medlem',
        dueAt: 4000,
        claimedById: member.profileId,
        claimedByName: 'Test Medlem',
        claimedAt: 3700,
        status: 'in_progress',
        createdAt: 3600,
      })
      const tournamentId = await ctx.db.insert('tournaments', {
        format: 'round_robin',
        status: 'completed',
        createdByProfileId: member.profileId,
        createdByName: 'Test Medlem',
        createdAt: 3800,
        participantCount: 1,
        matchCount: 0,
        pendingMatchCount: 0,
      })
      await ctx.db.insert('tournamentParticipants', {
        tournamentId,
        profileId: member.profileId,
        displayName: 'Test Medlem',
        seed: 1,
        played: 0,
        won: 0,
        lost: 0,
        gamesWon: 0,
        gamesLost: 0,
      })

      // --- Notifikationer, allowlist og revision ---------------------------
      await ctx.db.insert('pushSubscriptions', {
        profileId: member.profileId,
        endpoint: 'https://push.example.com/1',
        p256dh: 'p256dh',
        auth: 'auth',
        createdAt: 3900,
        updatedAt: 3900,
      })
      await ctx.db.insert('notificationPreferences', {
        profileId: member.profileId,
        kind: 'event_created',
        enabled: true,
        updatedAt: 3900,
      })
      await ctx.db.insert('pushDeliveries', {
        kind: 'event_created',
        subjectId: String(eventId),
        profileId: member.profileId,
        sentAt: 3950,
      })
      await ctx.db.insert('allowedEmails', { email: 'medlem@example.com' })
      // En ansøgning, medlemmet har afgjort som admin. Den skal bestå uden
      // `reviewedBy`.
      await ctx.db.insert('probationApplications', {
        fullName: 'Ansøger',
        email: 'ansoeger@example.com',
        motivation: 'Vil gerne med',
        status: 'approved',
        createdAt: 4000,
        reviewedAt: 4100,
        reviewedBy: member.profileId,
        notificationToken: 'token',
        adminNotificationStatus: 'sent',
        adminNotificationAttempts: 1,
        decisionNotificationAttempts: 0,
      })
      await ctx.db.insert('adminRoleChanges', {
        actorId: member.profileId,
        actorName: 'Test Medlem',
        targetId: other.profileId,
        targetName: 'Andet Medlem',
        oldIsAdmin: false,
        newIsAdmin: true,
        changedAt: 4200,
      })

      return {
        original,
        optimized,
        badgeImage,
        otherPhotoId,
        ownMessageId,
        otherMessageId,
        keptNominationId,
        memberBadgeId,
      }
    })

    // Reservationen sættes af `requestDeletion`; her springes den over, så
    // testen ikke skal trække i gang med planlagte kørsler.
    await t.run(async (ctx) => {
      await ctx.db.patch(member.profileId, { deletionReservedAt: Date.now() })
    })

    const result = await t.mutation(internal.account.completeDeletion, {
      profileId: member.profileId,
    })
    expect(result.deleted).toBe(true)

    const after = await t.run(async (ctx) => {
      return {
        profile: await ctx.db.get(member.profileId),
        user: await ctx.db.get(member.userId),
        photos: await ctx.db.query('photos').collect(),
        albums: await ctx.db.query('photoAlbums').collect(),
        comments: await ctx.db.query('photoComments').collect(),
        moderation: await ctx.db.query('photoModerationLog').collect(),
        attendance: await ctx.db.query('eventAttendance').collect(),
        tasks: await ctx.db.query('eventTasks').collect(),
        events: await ctx.db.query('events').collect(),
        messages: await ctx.db.query('messages').collect(),
        reactions: await ctx.db.query('messageReactions').collect(),
        votes: await ctx.db.query('pollVotes').collect(),
        polls: await ctx.db.query('chatPolls').collect(),
        presence: await ctx.db.query('chatPresence').collect(),
        reads: await ctx.db.query('chatReads').collect(),
        scores: await ctx.db.query('gameScores').collect(),
        observations: await ctx.db.query('observations').collect(),
        badges: await ctx.db.query('badges').collect(),
        nominations: await ctx.db.query('badgeNominations').collect(),
        approvals: await ctx.db.query('badgeNominationApprovals').collect(),
        memberBadges: await ctx.db.query('memberBadges').collect(),
        productions: await ctx.db.query('badgeProductions').collect(),
        tournaments: await ctx.db.query('tournaments').collect(),
        participants: await ctx.db.query('tournamentParticipants').collect(),
        roleChanges: await ctx.db.query('adminRoleChanges').collect(),
        subscriptions: await ctx.db.query('pushSubscriptions').collect(),
        preferences: await ctx.db.query('notificationPreferences').collect(),
        deliveries: await ctx.db.query('pushDeliveries').collect(),
        allowed: await ctx.db.query('allowedEmails').collect(),
        applications: await ctx.db.query('probationApplications').collect(),
        originalUrl: await ctx.storage.getUrl(ids.original),
        optimizedUrl: await ctx.storage.getUrl(ids.optimized),
        badgeUrl: await ctx.storage.getUrl(ids.badgeImage),
      }
    })

    // Profilen, auth-brugeren og alt det personlige er væk.
    expect(after.profile).toBeNull()
    expect(after.user).toBeNull()
    expect(after.attendance).toHaveLength(0)
    expect(after.comments).toHaveLength(0)
    expect(after.reactions).toHaveLength(0)
    expect(after.votes).toHaveLength(0)
    expect(after.presence).toHaveLength(0)
    expect(after.reads).toHaveLength(0)
    expect(after.scores).toHaveLength(0)
    expect(after.subscriptions).toHaveLength(0)
    expect(after.preferences).toHaveLength(0)
    expect(after.deliveries).toHaveLength(0)
    expect(after.allowed).toHaveLength(0)

    // Den andens billede består, men kommentartallet er rettet.
    expect(after.photos).toHaveLength(1)
    expect(after.photos[0]._id).toBe(ids.otherPhotoId)
    expect(after.photos[0].commentCount).toBe(0)
    // "Uden begivenhed"-albummet var tomt og er væk.
    expect(after.albums).toHaveLength(0)

    // Filerne er slettet fra fillageret; den andens billede og badgefilen er
    // ikke, og en forsvundet fil giver en tom adresse.
    expect(after.originalUrl).toBeNull()
    expect(after.optimizedUrl).toBeNull()
    expect(after.badgeUrl).not.toBeNull()

    // Opgaven, medlemmet oprettede, er væk; den anden står uden ansvarlig.
    expect(after.tasks).toHaveLength(1)
    expect(after.tasks[0].title).toBe('Tænd bål')
    expect(after.tasks[0].assignedTo).toBeUndefined()

    // Begivenheden er klubbens historik og står uden arrangør.
    expect(after.events).toHaveLength(1)
    expect(after.events[0].title).toBe('Fællestur')
    expect(after.events[0].createdBy).toBeUndefined()
    // Tællingen er rettet, så den passer med de rækker, der er tilbage.
    expect(after.events[0].attendingCount).toBe(0)

    // Beskederne står, men uden reference til medlemmet.
    expect(after.messages).toHaveLength(2)
    const own = after.messages.find((row) => row._id === ids.ownMessageId)
    const fromOther = after.messages.find(
      (row) => row._id === ids.otherMessageId,
    )
    expect(own?.authorId).toBeUndefined()
    expect(own?.content).toBe('Hej med jer')
    expect(fromOther?.mentions).toHaveLength(0)
    expect(fromOther?.deletedBy).toBeUndefined()
    expect(fromOther?.deletedAt).toBe(2200)

    // Afstemningen består; ophavet er nulstillet.
    expect(after.polls).toHaveLength(1)
    expect(after.polls[0].createdBy).toBeUndefined()
    expect(after.polls[0].closedBy).toBeUndefined()

    // Naturloggen står uden observatør.
    expect(after.observations).toHaveLength(1)
    expect(after.observations[0].createdById).toBeUndefined()

    // Badgene: kataloget og tildelingen står, den åbne indstilling er væk.
    expect(after.badges).toHaveLength(1)
    expect(after.badges[0].createdByProfileId).toBeUndefined()
    expect(after.memberBadges).toHaveLength(1)
    expect(after.memberBadges[0]._id).toBe(ids.memberBadgeId)
    expect(after.nominations).toHaveLength(1)
    expect(after.nominations[0]._id).toBe(ids.keptNominationId)
    expect(after.nominations[0].nominatedById).toBeUndefined()
    // Stemmetallet er regnet om, så det passer med de rækker, der er tilbage.
    expect(after.nominations[0].approveCount).toBe(1)
    expect(after.approvals).toHaveLength(1)
    expect(after.approvals[0].adminId).toBe(other.profileId)
    expect(after.productions).toHaveLength(1)
    expect(after.productions[0].claimedById).toBeUndefined()

    // Turneringen og stillingen står; deltageren peger ikke længere på nogen.
    expect(after.tournaments).toHaveLength(1)
    expect(after.tournaments[0].createdByProfileId).toBeUndefined()
    expect(after.participants).toHaveLength(1)
    expect(after.participants[0].profileId).toBeUndefined()
    expect(after.participants[0].displayName).toBe('Test Medlem')

    // Revisionssporene bevares, men anonymiseres.
    expect(after.moderation).toHaveLength(1)
    expect(after.moderation[0].actorId).toBeUndefined()
    expect(after.moderation[0].actorName).toBe('Tidligere medlem')
    expect(after.moderation[0].uploaderId).toBeUndefined()
    expect(after.moderation[0].uploaderName).toBe('Tidligere medlem')
    expect(after.roleChanges).toHaveLength(1)
    expect(after.roleChanges[0].actorName).toBe('Tidligere medlem')

    // Ansøgningen, medlemmet afgjorde, består uden `reviewedBy`.
    expect(after.applications).toHaveLength(1)
    expect(after.applications[0].reviewedBy).toBeUndefined()
  })

  it('sletter også filerne, når billedet har en thumbnail', async () => {
    const t = setup()
    const member = await seedMember(t, 'medlem@example.com', true)
    const other = await seedMember(t, 'anden@example.com', true)

    const files = await t.run(async (ctx) => {
      const original = await ctx.storage.store(new Blob(['original']))
      const thumbnail = await ctx.storage.store(new Blob(['thumbnail']))
      await ctx.db.insert('photos', {
        storageId: original,
        thumbnailStorageId: thumbnail,
        uploaderId: member.profileId,
        albumKey: 'without-event',
        createdAt: 1000,
        optimizationStatus: 'ready',
        optimizationAttempts: 1,
        commentCount: 0,
      })
      return { original, thumbnail }
    })

    await t.run(async (ctx) => {
      await ctx.db.patch(member.profileId, { deletionReservedAt: Date.now() })
    })
    await t.mutation(internal.account.completeDeletion, {
      profileId: member.profileId,
    })

    const after = await t.run(async (ctx) => ({
      original: await ctx.storage.getUrl(files.original),
      thumbnail: await ctx.storage.getUrl(files.thumbnail),
      photos: await ctx.db.query('photos').collect(),
      // Den anden profil skal stadig findes, ellers har testen slettet for meget.
      other: await ctx.db.get(other.profileId),
    }))
    expect(after.original).toBeNull()
    expect(after.thumbnail).toBeNull()
    expect(after.photos).toHaveLength(0)
    expect(after.other).not.toBeNull()
  })
})

describe('requestDeletion', () => {
  it('nægter at slette klubbens sidste administrator', async () => {
    const t = setup()
    const admin = await seedMember(t, 'admin@example.com', true)

    const failure = await t
      .withIdentity({ subject: admin.userId })
      .mutation(api.account.requestDeletion, {
        confirmation: ACCOUNT_DELETION_CONFIRMATION,
      })
      .catch((caught: unknown) => caught)

    expect(failure).toBeInstanceOf(ConvexError)
    expect((failure as ConvexError<string>).data).toBe('LAST_ADMIN')

    const profile = await t.run(
      async (ctx) => await ctx.db.get(admin.profileId),
    )
    expect(profile?.deletionReservedAt).toBeUndefined()
  })

  it('reserverer straks og sletter i en planlagt kørsel', async () => {
    vi.useFakeTimers()
    try {
      const t = setup()
      const admin = await seedMember(t, 'admin@example.com', true)
      await seedMember(t, 'anden-admin@example.com', true)

      await t
        .withIdentity({ subject: admin.userId })
        .mutation(api.account.requestDeletion, {
          confirmation: ACCOUNT_DELETION_CONFIRMATION,
        })

      // Reservationen er sat med det samme, så profilen ikke kan redigeres
      // eller skrives til, mens sletningen løber.
      const reserved = await t.run(
        async (ctx) => await ctx.db.get(admin.profileId),
      )
      expect(reserved?.deletionReservedAt).toBeTypeOf('number')

      // Selve arbejdet ligger i en planlagt kørsel, ikke i kaldet ovenfor.
      await t.finishAllScheduledFunctions(vi.runAllTimers)

      const gone = await t.run(
        async (ctx) => await ctx.db.get(admin.profileId),
      )
      expect(gone).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
