import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { internalMutation, internalQuery } from './_generated/server'
import { applyImportedAdmin, writeImportedPassword } from './passwords'
import { verifyBcrypt } from './passwordCrypto'

/** Skal sendes med, så et almindeligt kald ikke importerer. */
export const IMPORT_CONFIRM = 'IMPORT_V1'

const ADMINS = [
  'martin.martinjensen@gmail.com',
  'kaspermoller@gmail.com',
  'troelsranum@gmail.com',
  'mikkellinnet@gmail.com',
  'uffeschjoedt@gmail.com',
] as const

const NOT_ADMIN = 'kaspermoller+test@gmail.com'

const REACTIONS = new Set(['👍', '❤️', '😂', '😮', '🙏'])

type Row = Record<string, unknown>

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function num(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function ms(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return Date.now()
}

function bool(value: unknown): boolean {
  return value === true
}

function idOf(value: unknown): string | undefined {
  return text(value)
}

async function existingRef(
  ctx: MutationCtx,
  source: string,
  sourceId: string,
): Promise<string | null> {
  const row = await ctx.db
    .query('legacyRefs')
    .withIndex('by_source', (q) =>
      q.eq('source', source).eq('sourceId', sourceId),
    )
    .unique()
  return row?.targetId ?? null
}

async function remember(
  ctx: MutationCtx,
  source: string,
  sourceId: string,
  targetId: string,
): Promise<void> {
  const current = await existingRef(ctx, source, sourceId)
  if (current === targetId) return
  if (current !== null) return
  await ctx.db.insert('legacyRefs', { source, sourceId, targetId })
}

async function profileId(
  ctx: MutationCtx,
  sourceId: string | undefined,
): Promise<Id<'profiles'> | undefined> {
  if (!sourceId) return undefined
  const target = await existingRef(ctx, 'profiles', sourceId)
  return target === null ? undefined : (target as Id<'profiles'>)
}

function assertBundleSafe(bundle: { users?: Row[] }): void {
  for (const user of bundle.users ?? []) {
    const email = text(user.email)?.toLowerCase() ?? ''
    if (email.endsWith('@agentmail.to') || email.includes('preview-tester')) {
      throw new Error('IMPORT_REFUSED_TEST_DATA')
    }
  }
}

function token(): string {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Importerer et udtræk fra Supabase. Kør den igen: kendte id'er springes over.
 * Filer er allerede lagt i Convex-fillageret; `files` mapper sti til storage-id.
 */
export const importBundle = internalMutation({
  args: {
    confirm: v.string(),
    bundle: v.any(),
  },
  returns: v.object({
    inserted: v.number(),
    reused: v.number(),
  }),
  handler: async (ctx, args): Promise<{ inserted: number; reused: number }> => {
    if (args.confirm !== IMPORT_CONFIRM) {
      throw new Error('IMPORT_NOT_CONFIRMED')
    }
    const bundle = args.bundle as {
      users?: Row[]
      allowed?: Row[]
      activities?: Row[]
      events?: Row[]
      attendance?: Row[]
      tasks?: Row[]
      messages?: Row[]
      reactions?: Row[]
      reads?: Row[]
      photos?: Row[]
      observations?: Row[]
      announcements?: Row[]
      announcementReads?: Row[]
      pushSubs?: Row[]
      announcementDeliveries?: Row[]
      pushDeliveries?: Row[]
      games?: Row[]
      tournaments?: Row[]
      participants?: Row[]
      matches?: Row[]
      gamesInMatch?: Row[]
      badges?: Row[]
      nominations?: Row[]
      approvals?: Row[]
      datePolls?: Row[]
      dateOptions?: Row[]
      dateVotes?: Row[]
      probation?: Row[]
      probationPush?: Row[]
      vapid?: Row | null
      files?: Record<string, string>
    }
    assertBundleSafe(bundle)
    const files = bundle.files ?? {}
    let inserted = 0
    let reused = 0

    const use = async (source: string, sourceId: string) => {
      const found = await existingRef(ctx, source, sourceId)
      if (found !== null) reused += 1
      return found
    }
    const keep = async (source: string, sourceId: string, targetId: string) => {
      await remember(ctx, source, sourceId, targetId)
      inserted += 1
    }

    for (const user of bundle.users ?? []) {
      const sourceId = idOf(user.id)
      const email = text(user.email)?.toLowerCase()
      const hash = text(user.hash)
      if (!sourceId || !email || !hash) continue
      if (await use('profiles', sourceId)) {
        await applyImportedAdmin(ctx, email, bool(user.is_admin))
        continue
      }
      const userId = await writeImportedPassword(ctx, {
        email,
        bcryptHash: hash,
        name: text(user.full_name),
        isAdmin: bool(user.is_admin),
      })
      const profileId = await ctx.db.insert('profiles', {
        userId,
        fullName: text(user.full_name),
        isAdmin: bool(user.is_admin),
        chatColor: text(user.chat_color) ?? '#16a34a',
        pronouns: text(user.pronouns),
        causes: Array.isArray(user.causes)
          ? user.causes.filter(
              (item): item is string => typeof item === 'string',
            )
          : [],
        chatNotificationPreference:
          user.chat_notification_preference === 'mentions' ||
          user.chat_notification_preference === 'none'
            ? user.chat_notification_preference
            : 'all',
        featureNotificationsEnabled:
          user.feature_notifications_enabled !== false,
        createdAt: ms(user.created_at),
      })
      const avatar = text(user.avatar_path)
      if (avatar && files[avatar]) {
        await ctx.db.patch(profileId, {
          avatarStorageId: files[avatar] as Id<'_storage'>,
        })
      }
      await keep('profiles', sourceId, profileId)
    }

    for (const row of bundle.allowed ?? []) {
      const email = text(row.email)?.toLowerCase()
      if (!email) continue
      if (await use('allowed', email)) continue
      const id = await ctx.db.insert('allowedEmails', {
        email,
        isAdmin: bool(row.is_admin),
        note: text(row.note),
        createdAt: row.created_at ? ms(row.created_at) : undefined,
      })
      await keep('allowed', email, id)
    }

    for (const row of bundle.activities ?? []) {
      const sourceId = idOf(row.id)
      if (!sourceId || (await use('activities', sourceId))) continue
      const id = await ctx.db.insert('activities', {
        title: text(row.title) ?? 'Aktivitet',
        description: text(row.description) ?? '',
        icon: text(row.icon),
        sortOrder: num(row.sort_order) ?? 0,
        linkUrl: text(row.link_url),
        linkLabel: text(row.link_label),
        createdAt: ms(row.created_at),
      })
      await keep('activities', sourceId, id)
    }

    for (const row of bundle.events ?? []) {
      const sourceId = idOf(row.id)
      if (!sourceId || (await use('events', sourceId))) continue
      const startAt = ms(row.start_at)
      const endAt = row.end_at ? ms(row.end_at) : undefined
      const id = await ctx.db.insert('events', {
        title: text(row.title) ?? 'Begivenhed',
        description: text(row.description),
        location: text(row.location),
        startAt,
        endAt,
        endsAt: endAt ?? startAt,
        createdBy: await profileId(ctx, idOf(row.created_by)),
        isPublic: bool(row.is_public),
        maxParticipants: num(row.max_participants),
        attendingCount: 0,
        waitlistedCount: 0,
        approvedGuestCount: 0,
        createdAt: ms(row.created_at),
      })
      await keep('events', sourceId, id)
    }

    for (const row of bundle.attendance ?? []) {
      const event = idOf(row.event_id)
      const user = idOf(row.user_id)
      if (!event || !user) continue
      const key = `${event}:${user}`
      if (await use('attendance', key)) continue
      const eventId = await existingRef(ctx, 'events', event)
      const who = await profileId(ctx, user)
      if (!eventId || !who) continue
      const status =
        row.status === 'waitlisted' || row.status === 'declined'
          ? row.status
          : 'attending'
      const id = await ctx.db.insert('eventAttendance', {
        eventId: eventId as Id<'events'>,
        profileId: who,
        status,
        queuedAt: ms(row.created_at),
      })
      const eventRow = await ctx.db.get(eventId as Id<'events'>)
      if (eventRow && status === 'attending') {
        await ctx.db.patch(eventRow._id, {
          attendingCount: eventRow.attendingCount + 1,
        })
      }
      if (eventRow && status === 'waitlisted') {
        await ctx.db.patch(eventRow._id, {
          waitlistedCount: eventRow.waitlistedCount + 1,
        })
      }
      await keep('attendance', key, id)
    }

    for (const row of bundle.tasks ?? []) {
      const sourceId = idOf(row.id)
      if (!sourceId || (await use('tasks', sourceId))) continue
      const eventId = await existingRef(ctx, 'events', idOf(row.event_id) ?? '')
      const createdBy = await profileId(ctx, idOf(row.created_by))
      if (!eventId || !createdBy) continue
      const id = await ctx.db.insert('eventTasks', {
        eventId: eventId as Id<'events'>,
        title: text(row.title) ?? 'Opgave',
        assignedTo: await profileId(ctx, idOf(row.assigned_to)),
        createdBy,
        createdAt: ms(row.created_at),
      })
      await keep('tasks', sourceId, id)
    }

    for (const row of bundle.messages ?? []) {
      const sourceId = idOf(row.id)
      if (!sourceId || (await use('messages', sourceId))) continue
      const mentions: Id<'profiles'>[] = []
      if (Array.isArray(row.mentions)) {
        for (const mention of row.mentions) {
          const profile = await profileId(ctx, idOf(mention))
          if (profile) mentions.push(profile)
        }
      }
      const id = await ctx.db.insert('messages', {
        room: row.room === 'admin' ? 'admin' : 'general',
        authorId: await profileId(ctx, idOf(row.user_id)),
        content: text(row.content) ?? '',
        messageType: row.message_type === 'action' ? 'action' : 'text',
        mentions,
        createdAt: ms(row.created_at),
        writtenAt: row.written_at ? ms(row.written_at) : undefined,
        deletedAt: row.deleted_at ? ms(row.deleted_at) : undefined,
        clientId: sourceId,
      })
      await keep('messages', sourceId, id)
    }

    for (const row of bundle.messages ?? []) {
      const sourceId = idOf(row.id)
      const reply = idOf(row.reply_to_message_id)
      if (!sourceId || !reply) continue
      const message = await existingRef(ctx, 'messages', sourceId)
      const target = await existingRef(ctx, 'messages', reply)
      if (!message || !target) continue
      await ctx.db.patch(message as Id<'messages'>, {
        replyToId: target as Id<'messages'>,
      })
    }

    for (const row of bundle.reactions ?? []) {
      const message = idOf(row.message_id)
      const user = idOf(row.user_id)
      const emoji = text(row.emoji)
      if (!message || !user || !emoji || !REACTIONS.has(emoji)) continue
      const key = `${message}:${user}:${emoji}`
      if (await use('reactions', key)) continue
      const messageId = await existingRef(ctx, 'messages', message)
      const who = await profileId(ctx, user)
      if (!messageId || !who) continue
      const id = await ctx.db.insert('messageReactions', {
        messageId: messageId as Id<'messages'>,
        profileId: who,
        emoji: emoji as '👍',
        createdAt: ms(row.created_at),
      })
      await keep('reactions', key, id)
    }

    for (const row of bundle.reads ?? []) {
      const user = idOf(row.user_id)
      const room = row.room === 'admin' ? 'admin' : 'general'
      if (!user) continue
      const key = `${user}:${room}`
      if (await use('reads', key)) continue
      const who = await profileId(ctx, user)
      if (!who) continue
      const message = idOf(row.last_read_message_id)
      const id = await ctx.db.insert('chatReads', {
        profileId: who,
        room,
        lastReadAt: ms(row.last_read_at ?? row.updated_at),
        lastReadMessageId: message
          ? (((await existingRef(
              ctx,
              'messages',
              message,
            )) as Id<'messages'> | null) ?? undefined)
          : undefined,
      })
      await keep('reads', key, id)
    }

    for (const row of bundle.photos ?? []) {
      const sourceId = idOf(row.id)
      const original = text(row.storage_path)
      if (!sourceId || !original || (await use('photos', sourceId))) continue
      const storageId = files[original]
      if (!storageId) continue
      const uploader = await profileId(ctx, idOf(row.uploaded_by))
      if (!uploader) continue
      const event = idOf(row.event_id)
      const status =
        row.optimization_status === 'processing' ||
        row.optimization_status === 'ready' ||
        row.optimization_status === 'failed'
          ? row.optimization_status
          : 'pending'
      const optimized = text(row.optimized_path)
      const thumb = text(row.thumbnail_path)
      const id = await ctx.db.insert('photos', {
        storageId: storageId as Id<'_storage'>,
        displayToken: token(),
        thumbnailToken: token(),
        optimizedStorageId: optimized
          ? (files[optimized] as Id<'_storage'> | undefined)
          : undefined,
        thumbnailStorageId: thumb
          ? (files[thumb] as Id<'_storage'> | undefined)
          : undefined,
        caption: text(row.caption),
        albumKey: event ?? 'without-event',
        eventId: event,
        uploaderId: uploader,
        clientUploadId: sourceId,
        optimizationStatus: status,
        optimizationAttempts: num(row.optimization_attempts) ?? 0,
        optimizationCompletedAt: row.optimization_completed_at
          ? ms(row.optimization_completed_at)
          : undefined,
        optimizationError: text(row.optimization_error),
        commentCount: 0,
        createdAt: ms(row.created_at),
      })
      await keep('photos', sourceId, id)
    }

    const albums = new Map<
      string,
      { count: number; latest: number; cover?: string; title?: string }
    >()
    for (const row of bundle.photos ?? []) {
      const sourceId = idOf(row.id)
      if (!sourceId) continue
      const key = idOf(row.event_id) ?? 'without-event'
      const current = albums.get(key) ?? { count: 0, latest: 0 }
      current.count += 1
      const created = ms(row.created_at)
      if (created >= current.latest) {
        current.latest = created
        current.cover = sourceId
      }
      albums.set(key, current)
    }
    for (const [key, album] of albums) {
      if (await use('albums', key)) continue
      const cover = album.cover
        ? await existingRef(ctx, 'photos', album.cover)
        : null
      const event = await existingRef(ctx, 'events', key)
      const eventRow = event ? await ctx.db.get(event as Id<'events'>) : null
      const id = await ctx.db.insert('photoAlbums', {
        albumKey: key,
        eventId: key === 'without-event' ? undefined : key,
        title: eventRow?.title,
        photoCount: album.count,
        latestPhotoAt: album.latest || undefined,
        coverPhotoId: cover ? (cover as Id<'photos'>) : undefined,
      })
      await keep('albums', key, id)
    }

    for (const row of bundle.observations ?? []) {
      const sourceId = idOf(row.id)
      if (!sourceId || (await use('observations', sourceId))) continue
      const who = await profileId(ctx, idOf(row.created_by))
      const profile = who ? await ctx.db.get(who) : null
      const id = await ctx.db.insert('observations', {
        species: text(row.species) ?? 'Ukendt',
        location: text(row.location),
        observedOn: text(row.observed_on)?.slice(0, 10) ?? '1970-01-01',
        notes: text(row.notes),
        latitude: num(row.latitude),
        longitude: num(row.longitude),
        photoId: idOf(row.photo_id),
        createdById: who,
        createdByName: profile?.fullName ?? 'Medlem',
        createdAt: ms(row.created_at),
        updatedAt: ms(row.updated_at ?? row.created_at),
      })
      await keep('observations', sourceId, id)
    }

    for (const row of bundle.announcements ?? []) {
      const sourceId = idOf(row.id)
      const slug = text(row.slug)
      if (!sourceId || !slug || (await use('announcements', sourceId))) continue
      const status =
        row.push_status === 'pending' ||
        row.push_status === 'sending' ||
        row.push_status === 'failed' ||
        row.push_status === 'skipped'
          ? row.push_status
          : 'sent'
      const id = await ctx.db.insert('featureAnnouncements', {
        slug,
        title: text(row.title) ?? slug,
        body: text(row.body) ?? '',
        path: text(row.path),
        releasedAt: ms(row.released_at ?? row.created_at),
        createdAt: ms(row.created_at),
        pushStatus: status,
        pushAttempts: num(row.push_attempts) ?? 0,
        pushSentAt: row.push_sent_at ? ms(row.push_sent_at) : undefined,
        pushError: text(row.push_error),
      })
      await keep('announcements', sourceId, id)
    }

    for (const row of bundle.announcementReads ?? []) {
      const announcement = idOf(row.announcement_id)
      const user = idOf(row.user_id)
      if (!announcement || !user) continue
      const key = `${announcement}:${user}`
      if (await use('announcementReads', key)) continue
      const announcementId = await existingRef(
        ctx,
        'announcements',
        announcement,
      )
      const who = await profileId(ctx, user)
      if (!announcementId || !who) continue
      const id = await ctx.db.insert('featureAnnouncementReads', {
        announcementId: announcementId as Id<'featureAnnouncements'>,
        profileId: who,
        readAt: ms(row.read_at),
      })
      await keep('announcementReads', key, id)
    }

    for (const row of bundle.pushSubs ?? []) {
      const sourceId = idOf(row.id)
      const endpoint = text(row.endpoint)
      if (!sourceId || !endpoint || (await use('pushSubs', sourceId))) continue
      const who = await profileId(ctx, idOf(row.user_id))
      if (!who) continue
      const id = await ctx.db.insert('pushSubscriptions', {
        profileId: who,
        endpoint,
        p256dh: text(row.p256dh) ?? '',
        auth: text(row.auth) ?? '',
        createdAt: ms(row.created_at),
        updatedAt: ms(row.updated_at ?? row.created_at),
      })
      await keep('pushSubs', sourceId, id)
    }

    for (const row of bundle.announcementDeliveries ?? []) {
      const announcement = idOf(row.announcement_id)
      const subscription = idOf(row.subscription_id)
      if (!announcement || !subscription) continue
      const key = `${announcement}:${subscription}`
      if (await use('announcementDeliveries', key)) continue
      const announcementId = await existingRef(
        ctx,
        'announcements',
        announcement,
      )
      const subscriptionId = await existingRef(ctx, 'pushSubs', subscription)
      if (!announcementId || !subscriptionId) continue
      const id = await ctx.db.insert('featureAnnouncementPushDeliveries', {
        announcementId: announcementId as Id<'featureAnnouncements'>,
        subscriptionId: subscriptionId as Id<'pushSubscriptions'>,
        deliveredAt: ms(row.delivered_at),
      })
      await keep('announcementDeliveries', key, id)
    }

    for (const row of bundle.pushDeliveries ?? []) {
      const kind = text(row.kind)
      const subject = text(row.subject_id)
      const user = idOf(row.user_id)
      if (!kind || !subject || !user) continue
      if (
        kind !== 'event_created' &&
        kind !== 'event_reminder' &&
        kind !== 'badge_nomination_review' &&
        kind !== 'waitlist_promoted'
      ) {
        continue
      }
      const key = `${kind}:${subject}:${user}`
      if (await use('pushDeliveries', key)) continue
      const who = await profileId(ctx, user)
      if (!who) continue
      const id = await ctx.db.insert('pushDeliveries', {
        kind,
        subjectId: subject,
        profileId: who,
        sentAt: ms(row.sent_at),
      })
      await keep('pushDeliveries', key, id)
    }

    for (const row of bundle.games ?? []) {
      const sourceId = idOf(row.id)
      const game = text(row.game)
      if (!sourceId || !game || (await use('games', sourceId))) continue
      const games = new Set([
        'tetris',
        'kaper',
        '2048',
        'naturquiz',
        'sti',
        'fugletraek',
        'kabale',
      ])
      if (!games.has(game)) continue
      const who = await profileId(ctx, idOf(row.player_id))
      if (!who) continue
      const profile = await ctx.db.get(who)
      const id = await ctx.db.insert('gameScores', {
        game: game as 'tetris',
        playerId: who,
        playerName: profile?.fullName ?? 'Medlem',
        score: num(row.score) ?? 0,
        lines: num(row.lines) ?? 0,
        level: num(row.level) ?? 0,
        durationSeconds: num(row.duration_seconds) ?? 0,
        createdAt: ms(row.created_at),
      })
      await keep('games', sourceId, id)
    }

    for (const row of bundle.tournaments ?? []) {
      const sourceId = idOf(row.id)
      if (!sourceId || (await use('tournaments', sourceId))) continue
      const who = await profileId(ctx, idOf(row.created_by))
      const profile = who ? await ctx.db.get(who) : null
      const id = await ctx.db.insert('tournaments', {
        format:
          row.format === 'single_elimination'
            ? 'single_elimination'
            : 'round_robin',
        status:
          row.status === 'completed' || row.status === 'setup'
            ? row.status
            : 'in_progress',
        createdByProfileId: who,
        createdByName: profile?.fullName,
        createdAt: ms(row.created_at),
        participantCount: 0,
        matchCount: 0,
        pendingMatchCount: 0,
      })
      await keep('tournaments', sourceId, id)
    }

    for (const row of bundle.participants ?? []) {
      const sourceId = idOf(row.id)
      if (!sourceId || (await use('participants', sourceId))) continue
      const tournament = await existingRef(
        ctx,
        'tournaments',
        idOf(row.tournament_id) ?? '',
      )
      if (!tournament) continue
      const id = await ctx.db.insert('tournamentParticipants', {
        tournamentId: tournament as Id<'tournaments'>,
        profileId: await profileId(ctx, idOf(row.user_id)),
        displayName: text(row.display_name) ?? 'Deltager',
        seed: num(row.seed) ?? 0,
        played: 0,
        won: 0,
        lost: 0,
        gamesWon: 0,
        gamesLost: 0,
      })
      const parent = await ctx.db.get(tournament as Id<'tournaments'>)
      if (parent) {
        await ctx.db.patch(parent._id, {
          participantCount: parent.participantCount + 1,
        })
      }
      await keep('participants', sourceId, id)
    }

    for (const row of bundle.matches ?? []) {
      const sourceId = idOf(row.id)
      if (!sourceId || (await use('matches', sourceId))) continue
      const tournament = await existingRef(
        ctx,
        'tournaments',
        idOf(row.tournament_id) ?? '',
      )
      if (!tournament) continue
      const p1 = idOf(row.participant1_id)
      const p2 = idOf(row.participant2_id)
      const winner = idOf(row.winner_id)
      const id = await ctx.db.insert('tournamentMatches', {
        tournamentId: tournament as Id<'tournaments'>,
        round: num(row.round) ?? 1,
        matchIndex: num(row.match_index) ?? 0,
        participant1Id: p1
          ? (((await existingRef(
              ctx,
              'participants',
              p1,
            )) as Id<'tournamentParticipants'> | null) ?? undefined)
          : undefined,
        participant2Id: p2
          ? (((await existingRef(
              ctx,
              'participants',
              p2,
            )) as Id<'tournamentParticipants'> | null) ?? undefined)
          : undefined,
        winnerId: winner
          ? (((await existingRef(
              ctx,
              'participants',
              winner,
            )) as Id<'tournamentParticipants'> | null) ?? undefined)
          : undefined,
        status: row.status === 'completed' ? 'completed' : 'pending',
        bye: bool(row.bye),
        bestOf: num(row.best_of) ?? 3,
      })
      const parent = await ctx.db.get(tournament as Id<'tournaments'>)
      if (parent) {
        await ctx.db.patch(parent._id, {
          matchCount: parent.matchCount + 1,
          pendingMatchCount:
            parent.pendingMatchCount + (row.status === 'completed' ? 0 : 1),
        })
      }
      await keep('matches', sourceId, id)
    }

    for (const row of bundle.gamesInMatch ?? []) {
      const sourceId = idOf(row.id)
      if (!sourceId || (await use('matchGames', sourceId))) continue
      const match = await existingRef(ctx, 'matches', idOf(row.match_id) ?? '')
      const winner = await existingRef(
        ctx,
        'participants',
        idOf(row.winner_id) ?? '',
      )
      if (!match || !winner) continue
      const matchRow = await ctx.db.get(match as Id<'tournamentMatches'>)
      if (!matchRow) continue
      const id = await ctx.db.insert('tournamentGames', {
        matchId: match as Id<'tournamentMatches'>,
        tournamentId: matchRow.tournamentId,
        gameNumber: num(row.game_number) ?? 1,
        winnerId: winner as Id<'tournamentParticipants'>,
        createdAt: Date.now(),
      })
      await keep('matchGames', sourceId, id)
    }

    for (const row of bundle.badges ?? []) {
      const sourceId = idOf(row.id)
      const image = text(row.image_path)
      if (!sourceId || !image || (await use('badges', sourceId))) continue
      const storageId = files[image]
      if (!storageId) continue
      const mime =
        row.image_mime_type === 'image/jpeg' ||
        row.image_mime_type === 'image/webp'
          ? row.image_mime_type
          : 'image/png'
      const id = await ctx.db.insert('badges', {
        slug: text(row.slug) ?? sourceId,
        name: text(row.name) ?? 'Badge',
        description: text(row.description),
        imageStorageId: storageId as Id<'_storage'>,
        imageWidth: num(row.image_width) ?? 1,
        imageHeight: num(row.image_height) ?? 1,
        imageMimeType: mime,
        cropX: num(row.crop_x) ?? 0,
        cropY: num(row.crop_y) ?? 0,
        cropSize: num(row.crop_size) ?? 1,
        diameterMm: num(row.diameter_mm) ?? 25,
        bleedMm: num(row.bleed_mm) ?? 0,
        printStatus: 'pending',
        printAttempts: num(row.print_attempts) ?? 0,
        isActive: row.is_active !== false,
        createdByProfileId: await profileId(ctx, idOf(row.created_by)),
        createdAt: ms(row.created_at),
        updatedAt: ms(row.updated_at ?? row.created_at),
        awardedCount: 0,
      })
      await keep('badges', sourceId, id)
    }

    for (const row of bundle.nominations ?? []) {
      const sourceId = idOf(row.id)
      if (!sourceId || (await use('nominations', sourceId))) continue
      const badge = await existingRef(ctx, 'badges', idOf(row.badge_id) ?? '')
      const nominee = await profileId(ctx, idOf(row.nominee_id))
      if (!badge || !nominee) continue
      const badgeRow = await ctx.db.get(badge as Id<'badges'>)
      const nomineeRow = await ctx.db.get(nominee)
      const by = await profileId(ctx, idOf(row.nominated_by))
      const byRow = by ? await ctx.db.get(by) : null
      const status =
        row.status === 'approved' || row.status === 'rejected'
          ? row.status
          : 'pending'
      const id = await ctx.db.insert('badgeNominations', {
        badgeId: badge as Id<'badges'>,
        badgeName: badgeRow?.name ?? 'Badge',
        nomineeId: nominee,
        nomineeName: nomineeRow?.fullName ?? 'Medlem',
        nominatedById: by,
        nominatedByName: byRow?.fullName ?? 'Medlem',
        reason: text(row.reason) ?? '',
        status,
        approveCount: 0,
        rejectCount: 0,
        createdAt: ms(row.created_at),
        resolvedAt: row.resolved_at ? ms(row.resolved_at) : undefined,
      })
      await keep('nominations', sourceId, id)
    }

    for (const row of bundle.approvals ?? []) {
      const sourceId = idOf(row.id)
      if (!sourceId || (await use('approvals', sourceId))) continue
      const nomination = await existingRef(
        ctx,
        'nominations',
        idOf(row.nomination_id) ?? '',
      )
      const admin = await profileId(ctx, idOf(row.admin_id))
      if (!nomination || !admin) continue
      const adminRow = await ctx.db.get(admin)
      const vote = row.vote === 'reject' ? 'reject' : 'approve'
      const id = await ctx.db.insert('badgeNominationApprovals', {
        nominationId: nomination as Id<'badgeNominations'>,
        adminId: admin,
        adminName: adminRow?.fullName ?? 'Admin',
        vote,
        comment: text(row.comment),
        createdAt: ms(row.created_at),
      })
      const nominationRow = await ctx.db.get(
        nomination as Id<'badgeNominations'>,
      )
      if (nominationRow) {
        await ctx.db.patch(nominationRow._id, {
          approveCount:
            nominationRow.approveCount + (vote === 'approve' ? 1 : 0),
          rejectCount: nominationRow.rejectCount + (vote === 'reject' ? 1 : 0),
        })
      }
      await keep('approvals', sourceId, id)
    }

    for (const row of bundle.datePolls ?? []) {
      const sourceId = idOf(row.id)
      if (!sourceId || (await use('datePolls', sourceId))) continue
      const id = await ctx.db.insert('datePolls', {
        title: text(row.title) ?? 'Dato',
        description: text(row.description),
        createdBy: await profileId(ctx, idOf(row.created_by)),
        createdAt: ms(row.created_at),
        closedAt: row.closed_at ? ms(row.closed_at) : undefined,
        closedBy: await profileId(ctx, idOf(row.closed_by)),
      })
      await keep('datePolls', sourceId, id)
    }

    for (const row of bundle.dateOptions ?? []) {
      const sourceId = idOf(row.id)
      if (!sourceId || (await use('dateOptions', sourceId))) continue
      const poll = await existingRef(ctx, 'datePolls', idOf(row.poll_id) ?? '')
      if (!poll) continue
      const id = await ctx.db.insert('datePollOptions', {
        pollId: poll as Id<'datePolls'>,
        position: num(row.position) ?? 0,
        startsAt: ms(row.starts_at),
        endsAt: row.ends_at ? ms(row.ends_at) : undefined,
      })
      await keep('dateOptions', sourceId, id)
    }

    for (const row of bundle.dateVotes ?? []) {
      const option = idOf(row.option_id)
      const user = idOf(row.user_id)
      if (!option || !user) continue
      const key = `${option}:${user}`
      if (await use('dateVotes', key)) continue
      const optionId = await existingRef(ctx, 'dateOptions', option)
      const who = await profileId(ctx, user)
      if (!optionId || !who) continue
      const answer =
        row.answer === 'maybe' || row.answer === 'no' ? row.answer : 'yes'
      const id = await ctx.db.insert('datePollVotes', {
        optionId: optionId as Id<'datePollOptions'>,
        voterId: who,
        answer,
        updatedAt: ms(row.updated_at),
      })
      await keep('dateVotes', key, id)
    }

    for (const row of bundle.probation ?? []) {
      const sourceId = idOf(row.id)
      if (!sourceId || (await use('probation', sourceId))) continue
      const status =
        row.status === 'approved' || row.status === 'rejected'
          ? row.status
          : 'pending'
      const id = await ctx.db.insert('probationApplications', {
        fullName: text(row.full_name) ?? 'Ansøger',
        email: text(row.email)?.toLowerCase() ?? 'ukendt@example.com',
        motivation: text(row.motivation) ?? '',
        status,
        createdAt: ms(row.created_at),
        reviewedAt: row.reviewed_at ? ms(row.reviewed_at) : undefined,
        reviewedBy: await profileId(ctx, idOf(row.reviewed_by)),
        notificationToken: text(row.notification_token) ?? token(),
        adminNotificationStatus: 'sent',
        adminNotificationAttempts: num(row.admin_notification_attempts) ?? 0,
        decisionNotificationAttempts:
          num(row.decision_notification_attempts) ?? 0,
      })
      await keep('probation', sourceId, id)
    }

    if (bundle.vapid && !(await use('vapid', 'vapid'))) {
      const publicKey = text(bundle.vapid.public_key)
      const privateKey = text(bundle.vapid.private_key)
      if (publicKey && privateKey) {
        const id = await ctx.db.insert('pushVapidKeys', {
          key: 'vapid',
          publicKey,
          privateKey,
          subject: 'mailto:noreply@naturklubben.dk',
          createdAt: ms(bundle.vapid.created_at),
        })
        await keep('vapid', 'vapid', id)
      }
    }

    return { inserted, reused }
  },
})

export const makeUploadUrl = internalMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx): Promise<string> => {
    return await ctx.storage.generateUploadUrl()
  },
})

/** Tal til sammenligning. Ingen hemmeligheder. */
export const report = internalQuery({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const accounts = await ctx.db.query('authAccounts').collect()
    const password = accounts.filter(
      (account) => account.provider === 'password',
    )
    let bcrypt = 0
    let rejectsWrong = true
    for (const account of password) {
      if (
        typeof account.secret === 'string' &&
        account.secret.startsWith('$2')
      ) {
        bcrypt += 1
        if (verifyBcrypt('not-the-members-password', account.secret)) {
          rejectsWrong = false
        }
      }
    }
    const profiles = await ctx.db.query('profiles').collect()
    const allowed = await ctx.db.query('allowedEmails').collect()
    const byEmail = new Map<string, boolean>()
    for (const row of allowed) byEmail.set(row.email, row.isAdmin === true)
    async function profileAdmin(email: string): Promise<boolean | null> {
      const account = password.find(
        (row) => row.providerAccountId.toLowerCase() === email,
      )
      if (!account) return null
      const profile = profiles.find((row) => row.userId === account.userId)
      return profile ? profile.isAdmin === true : null
    }
    const adminFlags: Record<string, boolean | null> = {}
    let adminsMatch = true
    for (const email of ADMINS) {
      const flag = await profileAdmin(email)
      adminFlags[email] = flag
      if (flag !== true) adminsMatch = false
    }
    const plus = await profileAdmin(NOT_ADMIN)
    adminFlags[NOT_ADMIN] = plus
    if (plus === true) adminsMatch = false
    const agentmail = allowed.some((row) => row.email.endsWith('@agentmail.to'))
    const names = [
      'profiles',
      'activities',
      'events',
      'photos',
      'messages',
      'allowedEmails',
      'pushSubscriptions',
      'probationApplications',
      'eventAttendance',
      'messageReactions',
      'eventTasks',
      'badges',
      'badgeNominations',
      'badgeNominationApprovals',
      'featureAnnouncements',
      'featureAnnouncementReads',
      'observations',
      'featureAnnouncementPushDeliveries',
      'gameScores',
      'tournaments',
      'tournamentParticipants',
      'tournamentMatches',
      'tournamentGames',
      'pushDeliveries',
      'datePolls',
      'datePollOptions',
      'datePollVotes',
      'chatReads',
      'photoAlbums',
      'pushVapidKeys',
    ] as const
    const counts: Record<string, number> = {}
    for (const name of names) {
      counts[name] = (await ctx.db.query(name).collect()).length
    }
    const photos = await ctx.db.query('photos').collect()
    return {
      counts,
      passwordAccounts: password.length,
      bcrypt,
      rejectsWrong,
      adminsMatch,
      adminFlags,
      allowlist: allowed.length,
      allowlistAdmins: [...byEmail.values()].filter(Boolean).length,
      agentmail,
      photosWithFile: photos.filter((photo) => photo.storageId).length,
    }
  },
})
