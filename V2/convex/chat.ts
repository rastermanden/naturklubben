import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { QueryCtx } from './_generated/server'
import type { MutationCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { requireProfile, requireWritableProfile } from './authz'
import { chatRooms, reactionEmojis } from './tables/chat'
import { pollViewForMessage } from './chatPolls'

/**
 * Chatten: beskeder, svar, reaktioner, mentions, søgning, tilstedeværelse og
 * ulæst-markering.
 *
 * Oversat fra den gamle apps `messages`-tabel og de RPC'er, der efterhånden
 * blev bygget oven på den (`soft_delete_message`, `send_chat_message`,
 * `search_chat_messages`, `get_chat_message_context`). Afstemninger ligger i
 * `convex/chatPolls.ts`.
 *
 * **Realtid.** Der er ingen kanal, ingen `subscribe` og ingen manuel
 * invalidering her eller i klienten: hvert `useQuery` på klienten er i sig
 * selv et abonnement på det, forespørgslen læser. Når en mutation skriver en
 * besked, reaktion eller stemme, sender Convex det nye svar til alle, der
 * abonnerer. Det erstatter `supabase.channel(...)` fra den gamle app, og
 * derfor findes der ikke længere en `useMessages` med en Realtime-kanal.
 *
 * **Autorisation.** Hver eksporteret funktion herunder kræver et medlem og
 * skriver det i sin egen kommentar. Rummet er den anden akse: det fælles rum
 * er åbent for alle medlemmer, admin-rummet kræver `isAdmin`. Reglen står ét
 * sted (`requireRoomAccess`), fordi Convex -- i modsætning til Postgres -- ikke
 * har en RLS-politik, der gør det af sig selv.
 */

type ChatRoom = Infer<typeof chatRooms>
type ReactionEmoji = Infer<typeof reactionEmojis>

const MESSAGE_MAX_LENGTH = 2000
const MENTION_LIMIT = 20
const FORMER_MEMBER_COLOR = '#64748b'

/** Rækkefølgen, reaktionerne vises i. Skal matche unionen i tabelfilen. */
const REACTION_EMOJI_ORDER: ReactionEmoji[] = ['👍', '❤️', '😂', '😮', '🙏']

/**
 * Hvor længe et heartbeat tæller. Klienten skriver hvert 30. sekund, så
 * vinduet tåler to tabte slag, før medlemmet falder ud af "online nu".
 */
const PRESENCE_WINDOW_MS = 90_000
const PRESENCE_MEMBER_LIMIT = 100

/** Hvor mange af de nyeste beskeder ulæst-tallet må tælle over. */
const UNREAD_SCAN_LIMIT = 100

/** Hvor mange delstrenge pr. besked søgeindekset må fyldes med. */
const MAX_INDEXED_TOKENS = 600

/** Hvor lang en delstreng af et ord der indekseres. */
const MAX_INDEXED_WORD_LENGTH = 24

/** Hvor mange token-rækker en søgning må gennemgå, før den giver op. */
const SEARCH_CANDIDATE_LIMIT = 500
const SEARCH_RESULT_LIMIT = 20

/**
 * Rumreglen: det fælles rum er åbent for alle medlemmer, admin-rummet kræver
 * `isAdmin`. Står også i `convex/chatPolls.ts`, som har brug for den samme
 * regel; en fælles hjælper ville gøre de to filer cirkulært afhængige.
 */
function requireRoomAccess(profile: Doc<'profiles'>, room: ChatRoom) {
  if (room === 'admin' && !profile.isAdmin) {
    throw new Error('NOT_ADMIN')
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

/** Navnet, der vises. Et medlem uden navn er stadig et medlem. */
function nameOf(profile: Doc<'profiles'> | null): string {
  return profile?.fullName?.trim() || 'Medlem'
}

/**
 * Navneopslag med en cache pr. forespørgsel: en beskedside med 30 beskeder fra
 * de samme fem personer skal ikke læse de fem profiler 30 gange.
 */
async function profileName(
  ctx: QueryCtx,
  cache: Map<Id<'profiles'>, string>,
  profileId: Id<'profiles'>,
): Promise<string> {
  const known = cache.get(profileId)
  if (known !== undefined) return known
  const name = nameOf(await ctx.db.get(profileId))
  cache.set(profileId, name)
  return name
}

/**
 * Alle delstrenge af alle ord i teksten, med små bogstaver.
 *
 * Det er denne liste, der gør midt-i-ord-søgning mulig: for "skovsøen" gemmes
 * "skovsøen", "kovsøen", "ovsøen", ... "n", og et opslag efter "søen" rammer
 * den delstreng, der begynder med "søen". Se `messageSearchTokens` i
 * `tables/chat.ts`.
 *
 * To grænser holder skrivningen nede: en delstreng er højst
 * `MAX_INDEXED_WORD_LENGTH` tegn (nok til at et søgeord på op til den længde
 * kan findes), og der indekseres højst `MAX_INDEXED_TOKENS` rækker pr. besked.
 * Konsekvensen er, at et meget langt ord eller en meget lang besked ikke er
 * søgbar i sin sidste del -- det står i rapporten som en kendt afvigelse.
 */
function searchableSuffixes(content: string): string[] {
  const words = content.toLocaleLowerCase('da-DK').split(/[^\p{L}\p{N}]+/u)
  const suffixes: string[] = []
  const seen = new Set<string>()
  for (const word of words) {
    for (let start = 0; start < word.length; start += 1) {
      const token = word.slice(start, start + MAX_INDEXED_WORD_LENGTH)
      if (seen.has(token)) continue
      seen.add(token)
      suffixes.push(token)
      if (suffixes.length >= MAX_INDEXED_TOKENS) return suffixes
    }
  }
  return suffixes
}

/**
 * Det søgeord, der først slås op på: det længste ord i søgestrengen.
 *
 * Søgningen kræver, at hele den indtastede tekst står i beskeden, så det
 * længste ord *skal* også være der -- og det er det mest selektive sted at
 * begynde. Resten af strengen afgøres bagefter ved at se på teksten.
 */
function searchCandidateKey(term: string): string {
  let longest = ''
  for (const word of term.split(/[^\p{L}\p{N}]+/u)) {
    if (word.length > longest.length) longest = word
  }
  return longest.slice(0, MAX_INDEXED_WORD_LENGTH)
}

/** Søgestrengen normaliseres som teksten, så "MØDES" finder "mødes". */
function foldTerm(term: string): string {
  return term.trim().toLocaleLowerCase('da-DK')
}

/** Skriver søgeindekset for en besked -- i samme mutation som beskeden. */
async function indexMessageContent(
  ctx: MutationCtx,
  messageId: Id<'messages'>,
  room: ChatRoom,
  content: string,
  createdAt: number,
) {
  for (const token of searchableSuffixes(content)) {
    await ctx.db.insert('messageSearchTokens', {
      room,
      token,
      messageId,
      createdAt,
    })
  }
}

/** Fjerner søgeindekset igen, når beskeden slettes. */
async function clearMessageIndex(
  ctx: MutationCtx,
  messageId: Id<'messages'>,
) {
  const tokens = await ctx.db
    .query('messageSearchTokens')
    .withIndex('by_message', (q) => q.eq('messageId', messageId))
    .collect()
  for (const token of tokens) {
    await ctx.db.delete(token._id)
  }
}

/**
 * En besked som klienten skal se den: med afsendernes navn og farve, svarets
 * ophav, reaktionerne talt op og afstemningen, hvis der er en.
 *
 * Alt læses i samme forespørgsel, fordi det er dét, der gør et `useQuery` til
 * et abonnement på hele beskeden: ændrer nogen en reaktion, får de andre en ny
 * side -- uden en kanal pr. tabel, som i den gamle app.
 */
async function messageView(
  ctx: QueryCtx,
  message: Doc<'messages'>,
  viewer: Doc<'profiles'>,
  cache: Map<Id<'profiles'>, string>,
) {
  const author = message.authorId === undefined ? null : await ctx.db.get(message.authorId)
  const reactions = await ctx.db
    .query('messageReactions')
    .withIndex('by_message', (q) => q.eq('messageId', message._id))
    .collect()

  const namesByEmoji = new Map<ReactionEmoji, string[]>()
  const mineByEmoji = new Set<ReactionEmoji>()
  for (const reaction of reactions) {
    const names = namesByEmoji.get(reaction.emoji) ?? []
    names.push(
      reaction.profileId === viewer._id
        ? 'Dig'
        : await profileName(ctx, cache, reaction.profileId),
    )
    namesByEmoji.set(reaction.emoji, names)
    if (reaction.profileId === viewer._id) mineByEmoji.add(reaction.emoji)
  }

  const parent =
    message.replyToId === undefined ? null : await ctx.db.get(message.replyToId)
  const isDeleted = message.deletedAt !== undefined

  return {
    messageId: message._id,
    room: message.room,
    /** Tom, når medlemmet er slettet; visningen skriver "Tidligere medlem". */
    authorId: message.authorId ?? null,
    authorName: author === null ? null : nameOf(author),
    chatColor: author?.chatColor ?? FORMER_MEMBER_COLOR,
    avatarUrl: author?.avatarUrl ?? null,
    content: message.content,
    messageType: message.messageType,
    mentions: message.mentions,
    createdAt: message.createdAt,
    writtenAt: message.writtenAt ?? null,
    editedAt: message.editedAt ?? null,
    deletedAt: message.deletedAt ?? null,
    /** Slettet af en anden end afsenderen -- altså af en administrator. */
    deletedByAdmin:
      message.deletedBy !== undefined &&
      message.deletedBy !== message.authorId,
    replyTo:
      parent === null
        ? null
        : {
            messageId: parent._id,
            authorName:
              parent.authorId === undefined
                ? 'Tidligere medlem'
                : await profileName(ctx, cache, parent.authorId),
            content: parent.content,
            deleted: parent.deletedAt !== undefined,
          },
    reactions: REACTION_EMOJI_ORDER.filter((emoji) =>
      namesByEmoji.has(emoji),
    ).map((emoji) => {
      const names = namesByEmoji.get(emoji) ?? []
      return {
        emoji,
        count: names.length,
        reactedByMe: mineByEmoji.has(emoji),
        names,
      }
    }),
    poll: isDeleted ? null : await pollViewForMessage(ctx, message._id, viewer),
  }
}

// ---------------------------------------------------------------------------
// Forespørgsler
// ---------------------------------------------------------------------------

/** Formen, `messageView` giver -- brugt til at type de lister, den fylder. */
type MessageView = Awaited<ReturnType<typeof messageView>>

/** Formen, `onlineMembers` giver. */
type OnlineMemberView = {
  profileId: Id<'profiles'>
  fullName: string
  chatColor: string
  avatarUrl: string | null
  isAway: boolean
  awayMessage: string | null
  isCurrentUser: boolean
}

/**
 * Kræver: medlem (`requireProfile`). Hvem læseren er, og hvad den må.
 *
 * Siden skal kende sit eget profil-id for at kunne vise "Du er nævnt" og
 * "Slet", og admin-siden skal vide, om der er et admin-rum at vise.
 */
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireProfile(ctx)
    return {
      profileId: profile._id,
      fullName: nameOf(profile),
      chatColor: profile.chatColor,
      avatarUrl: profile.avatarUrl ?? null,
      isAdmin: profile.isAdmin,
    }
  },
})

/**
 * Kræver: medlem (`requireProfile`). Navnene bag mentions, reaktioner og svar.
 *
 * Listens størrelse er klubbens medlemstal. Den læses i sin helhed, fordi
 * mention-vælgeren skal kunne søge i alle navne -- og fordi en klub af denne
 * størrelse ikke har brug for en pagineret medlemsliste i chatten.
 */
export const members = query({
  args: {},
  handler: async (ctx) => {
    await requireProfile(ctx)
    const profiles = await ctx.db.query('profiles').collect()
    return profiles
      .map((profile) => ({
        profileId: profile._id,
        fullName: nameOf(profile),
        chatColor: profile.chatColor,
        avatarUrl: profile.avatarUrl ?? null,
      }))
      .sort((left, right) =>
        left.fullName.localeCompare(right.fullName, 'da-DK'),
      )
  },
})

/**
 * Kræver: medlem (`requireProfile`), og for `room: 'admin'` derudover
 * administrator (`requireRoomAccess`).
 *
 * Beskedhistorikken, nyeste side først. Pagineringen er Convex' egen:
 * klienten bruger `usePaginatedQuery` og `loadMore`, og der er ingen
 * `createdAt`-cursor at holde styr på som i den gamle app.
 */
export const history = query({
  args: { room: chatRooms, paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx)
    requireRoomAccess(profile, args.room)

    const result = await ctx.db
      .query('messages')
      .withIndex('by_room_and_created_at', (q) => q.eq('room', args.room))
      .order('desc')
      .paginate(args.paginationOpts)

    const cache = new Map<Id<'profiles'>, string>()
    const page: MessageView[] = []
    for (const message of result.page) {
      page.push(await messageView(ctx, message, profile, cache))
    }

    return { ...result, page }
  },
})

/**
 * Kræver: medlem (`requireProfile`), og for `room: 'admin'` derudover
 * administrator (`requireRoomAccess`).
 *
 * Søgning i hele historikken, nyeste træffer først.
 *
 * Forskellen fra den gamle apps `search_chat_messages` er, at ordene skal stå
 * i den rækkefølge, de er skrevet: den gamle søgning var en fuldtekstsøgning
 * *eller* en delstreng, så "vejr godt" også fandt "godt vejr". Her er det
 * delstrengen, der gælder -- men til gengæld også midt i ord, som før.
 *
 * "Vis flere" hæver `limit` i stedet for at bruge `paginationOptsValidator`:
 * træfferne kommer fra token-indekset og skal sorteres efter tid, og en
 * tidsorden kan `paginationOpts` ikke udtrykke. `limit` er derfor både
 * sidestørrelse og cursor, og den har et loft her i forespørgslen.
 */
export const search = query({
  args: {
    room: chatRooms,
    term: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx)
    requireRoomAccess(profile, args.room)

    const term = foldTerm(args.term)
    const key = searchCandidateKey(term)
    if (term.length === 0 || key.length === 0) {
      return { messages: [], hasMore: false }
    }

    const limit = clamp(args.limit ?? SEARCH_RESULT_LIMIT, 1, SEARCH_RESULT_LIMIT * 2)

    // Området på indekset: alle tokens, der begynder med det længste søgeord.
    // `\uffff` er større end alle tegn, der kan følge efter ordet.
    const tokens = await ctx.db
      .query('messageSearchTokens')
      .withIndex('by_room_and_token', (q) =>
        q.eq('room', args.room).gte('token', key).lt('token', `${key}\uffff`),
      )
      .take(SEARCH_CANDIDATE_LIMIT)

    const seen = new Set<Id<'messages'>>()
    const matches: Doc<'messages'>[] = []
    for (const token of tokens) {
      if (seen.has(token.messageId)) continue
      seen.add(token.messageId)
      const message = await ctx.db.get(token.messageId)
      if (message === null) continue
      if (message.deletedAt !== undefined) continue
      // Teksten er facit, ikke indekset: et token er kun en del af et ord, og
      // søgestrengen kan være flere ord. Det er den samme betingelse, som
      // `ilike '%term%'` stillede i den gamle app.
      if (!message.content.toLocaleLowerCase('da-DK').includes(term)) continue
      matches.push(message)
    }

    matches.sort((left, right) => right.createdAt - left.createdAt)
    const page = matches.slice(0, limit)

    const cache = new Map<Id<'profiles'>, string>()
    const messages: MessageView[] = []
    for (const message of page) {
      messages.push(await messageView(ctx, message, profile, cache))
    }

    return { messages, hasMore: matches.length > limit }
  },
})

/**
 * Kræver: medlem (`requireProfile`), og for en admin-besked derudover
 * administrator (`requireRoomAccess`).
 *
 * Beskederne omkring en bestemt besked -- det, et klik på et søgeresultat
 * åbner. Rummet læses fra beskeden selv, så et almindeligt medlem ikke kan
 * hente kontekst om en besked i admin-rummet ved at kende dens id.
 */
export const context = query({
  args: { messageId: v.id('messages'), size: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx)
    const target = await ctx.db.get(args.messageId)
    if (target === null) throw new Error('MESSAGE_NOT_FOUND')
    requireRoomAccess(profile, target.room)

    const size = clamp(args.size ?? 25, 1, 50)
    const older = await ctx.db
      .query('messages')
      .withIndex('by_room_and_created_at', (q) =>
        q.eq('room', target.room).lte('createdAt', target.createdAt),
      )
      .order('desc')
      .take(size + 1)
    const newer = await ctx.db
      .query('messages')
      .withIndex('by_room_and_created_at', (q) =>
        q.eq('room', target.room).gt('createdAt', target.createdAt),
      )
      .order('asc')
      .take(size)

    const around = [...older.reverse(), ...newer].filter(
      (message) => message.deletedAt === undefined,
    )

    const cache = new Map<Id<'profiles'>, string>()
    const messages: MessageView[] = []
    for (const message of around) {
      messages.push(await messageView(ctx, message, profile, cache))
    }

    return { room: target.room, messages }
  },
})

/**
 * Kræver: medlem (`requireProfile`), og for `room: 'admin'` derudover
 * administrator (`requireRoomAccess`).
 *
 * "Online nu" -- en tilnærmelse af Supabase Presence.
 *
 * Den gamle app lod Realtime Presence holde styr på, hvem der havde en åben
 * forbindelse; den forsvandt af sig selv, når fanen blev lukket. Convex har
 * ingen indbygget presence uden et component, og der er ikke tilføjet nye
 * afhængigheder her. I stedet skriver klienten et heartbeat hvert 30. sekund
 * (`heartbeat`), og denne forespørgsel viser dem, der har skrevet inden for
 * de sidste 90 sekunder. Forskellen i oplevelsen er, at et medlem, der
 * forsvinder uden at sende farvel (en telefon, der dør), står som online i op
 * til halvandet minut mere.
 */
export const onlineMembers = query({
  args: { room: chatRooms },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx)
    requireRoomAccess(profile, args.room)

    const cutoff = Date.now() - PRESENCE_WINDOW_MS
    const present = await ctx.db
      .query('chatPresence')
      .withIndex('by_room_and_last_seen', (q) =>
        q.eq('room', args.room).gt('lastSeenAt', cutoff),
      )
      .take(PRESENCE_MEMBER_LIMIT)

    const online: OnlineMemberView[] = []
    for (const entry of present) {
      const memberProfile = await ctx.db.get(entry.profileId)
      if (memberProfile === null) continue
      online.push({
        profileId: entry.profileId,
        fullName: nameOf(memberProfile),
        chatColor: memberProfile.chatColor,
        avatarUrl: memberProfile.avatarUrl ?? null,
        isAway: entry.isAway,
        awayMessage: entry.awayMessage ?? null,
        isCurrentUser: entry.profileId === profile._id,
      })
    }
    return online
  },
})

/**
 * Kræver: medlem (`requireProfile`). Ulæste beskeder og mentions pr. rum.
 *
 * Der findes ingen tælling at holde ved lige: et rum er ulæst fra det
 * tidspunkt, medlemmet sidst markerede det læst (`markRoomRead`), og tallet
 * regnes ud fra beskederne. Det er dyrere end en kolonne, men det kan til
 * gengæld ikke komme ud af trit. Tællingen ser højst `UNREAD_SCAN_LIMIT`
 * beskeder tilbage, og `capped` siger, om der var flere.
 */
export const unread = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireProfile(ctx)
    const rooms: ChatRoom[] = profile.isAdmin
      ? ['general', 'admin']
      : ['general']

    const summary: {
      room: ChatRoom
      unread: number
      mentions: number
      capped: boolean
    }[] = []
    for (const room of rooms) {
      const read = await ctx.db
        .query('chatReads')
        .withIndex('by_profile_and_room', (q) =>
          q.eq('profileId', profile._id).eq('room', room),
        )
        .unique()
      const lastReadAt = read?.lastReadAt ?? 0

      const recent = await ctx.db
        .query('messages')
        .withIndex('by_room_and_created_at', (q) =>
          q.eq('room', room).gt('createdAt', lastReadAt),
        )
        .take(UNREAD_SCAN_LIMIT)

      summary.push({
        room,
        // Egne beskeder tælles ikke som ulæste.
        unread: recent.filter((message) => message.authorId !== profile._id)
          .length,
        mentions: recent.filter((message) =>
          message.mentions.includes(profile._id),
        ).length,
        capped: recent.length === UNREAD_SCAN_LIMIT,
      })
    }
    return summary
  },
})

// ---------------------------------------------------------------------------
// Mutationer
// ---------------------------------------------------------------------------

/**
 * Kun id'er på medlemmer, der faktisk findes, og højst `MENTION_LIMIT` af dem.
 * Den gamle app havde en foreign key til at garantere det første og et
 * `check`-constraint til det andet; her er mutationen selv garantien.
 */
async function resolveMentionIds(
  ctx: MutationCtx,
  ids: Id<'profiles'>[],
): Promise<Id<'profiles'>[]> {
  const resolved: Id<'profiles'>[] = []
  for (const id of ids) {
    if (resolved.includes(id)) continue
    if (resolved.length >= MENTION_LIMIT) break
    const profile = await ctx.db.get(id)
    if (profile === null) continue
    resolved.push(id)
  }
  return resolved
}

/**
 * Kræver: medlem, der ikke er på vej til at blive slettet
 * (`requireWritableProfile`), og adgang til rummet (`requireRoomAccess`) --
 * altså administrator for `room: 'admin'`.
 *
 * Sender en besked, og er idempotent på `clientId`:
 *
 * Offline-køen på klienten giver beskeden sit id, *før* den er sendt. Kommer
 * den igen -- fordi svaret på et forsøg gik tabt, eller fordi appen blev lukket
 * midt i afsendelsen -- findes `clientId` allerede, og mutationen returnerer
 * den besked, der ligger der, med `inserted: false`. Indholdet overskrives
 * ikke, og der opstår ingen dublet. Det er den samme kontrakt som
 * `send_chat_message` gav med primærnøglen i den gamle app.
 *
 * Convex kører mutationer serielt, så opslaget og indsættelsen kan ikke
 * overlappe hinanden; derfor er et unikt indeks ikke nødvendigt for at gøre
 * det sikkert.
 */
export const sendMessage = mutation({
  args: {
    clientId: v.string(),
    room: chatRooms,
    content: v.string(),
    messageType: v.optional(v.union(v.literal('text'), v.literal('action'))),
    mentions: v.optional(v.array(v.id('profiles'))),
    replyToId: v.optional(v.union(v.id('messages'), v.null())),
    writtenAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)
    requireRoomAccess(profile, args.room)

    if (args.clientId.trim().length === 0) {
      throw new Error('MESSAGE_SEND_MISSING_CLIENT_ID')
    }
    if (
      args.content.length < 1 ||
      args.content.length > MESSAGE_MAX_LENGTH
    ) {
      throw new Error('MESSAGE_SEND_INVALID_CONTENT')
    }

    const existing = await ctx.db
      .query('messages')
      .withIndex('by_client_id', (q) => q.eq('clientId', args.clientId))
      .unique()
    if (existing !== null) {
      // En andens klient-id må hverken overskrives eller læses: svaret ville
      // ellers lække indholdet af en besked, kalderen ikke ejer.
      if (existing.authorId !== profile._id) {
        throw new Error('MESSAGE_SEND_CLIENT_ID_CONFLICT')
      }
      return { messageId: existing._id, inserted: false }
    }

    let replyToId: Id<'messages'> | undefined
    if (args.replyToId !== undefined && args.replyToId !== null) {
      const parent = await ctx.db.get(args.replyToId)
      if (parent === null) throw new Error('MESSAGE_REPLY_NOT_FOUND')
      // Fremmednøglen i den gamle app krævede blot, at beskeden fandtes. Her
      // kræves også samme rum, så et svar ikke kan pege ind i admin-rummet.
      if (parent.room !== args.room) throw new Error('MESSAGE_REPLY_WRONG_ROOM')
      if (parent.deletedAt !== undefined) {
        throw new Error('MESSAGE_REPLY_DELETED')
      }
      replyToId = parent._id
    }

    const mentions = await resolveMentionIds(ctx, args.mentions ?? [])
    const now = Date.now()

    const messageId = await ctx.db.insert('messages', {
      room: args.room,
      authorId: profile._id,
      content: args.content,
      messageType: args.messageType ?? 'text',
      mentions,
      createdAt: now,
      // Et ur, der står forkert, må ikke skrive beskeden ind i fremtiden.
      writtenAt: Math.min(args.writtenAt ?? now, now),
      ...(replyToId === undefined ? {} : { replyToId }),
      clientId: args.clientId,
    })

    // Søgeindekset skrives i samme mutation som beskeden, så de to ikke kan
    // komme ud af trit.
    await indexMessageContent(
      ctx,
      messageId,
      args.room,
      args.content,
      now,
    )

    return { messageId, inserted: true }
  },
})

/**
 * Kræver: medlem, der ikke er på vej til at blive slettet
 * (`requireWritableProfile`), og som enten har skrevet beskeden selv eller er
 * administrator.
 *
 * Sletningen er irreversibel og blød: indholdet tømmes, mentions ryddes, og
 * rækken bliver stående, så svarene på den ikke forsvinder. Det er den samme
 * kontrakt som `soft_delete_message` (#107/#110), og den er idempotent -- en
 * allerede slettet besked ændrer sig ikke igen.
 */
export const softDeleteMessage = mutation({
  args: { messageId: v.id('messages') },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)

    const message = await ctx.db.get(args.messageId)
    if (message === null) throw new Error('MESSAGE_DELETE_NOT_FOUND')
    requireRoomAccess(profile, message.room)

    if (message.deletedAt !== undefined) return

    if (message.authorId !== profile._id && !profile.isAdmin) {
      throw new Error('MESSAGE_DELETE_NOT_AUTHORIZED')
    }

    await ctx.db.patch(args.messageId, {
      content: '',
      // En slettet besked har intet indhold tilbage at fremhæve i, så den
      // skal heller ikke blive ved med at pege på de nævnte.
      mentions: [],
      deletedAt: Date.now(),
      deletedBy: profile._id,
    })
    await clearMessageIndex(ctx, args.messageId)
  },
})

/**
 * Kræver: medlem, der ikke er på vej til at blive slettet
 * (`requireWritableProfile`), og adgang til beskedens rum
 * (`requireRoomAccess`).
 *
 * Slår en reaktion til eller fra. Et medlem kan kun reagere som sig selv, og
 * kun med det faste sæt emoji; "én af hver pr. medlem pr. besked" håndhæves af
 * opslaget på `(messageId, profileId, emoji)`.
 */
export const toggleReaction = mutation({
  args: { messageId: v.id('messages'), emoji: reactionEmojis },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)

    const message = await ctx.db.get(args.messageId)
    if (message === null) throw new Error('MESSAGE_NOT_FOUND')
    requireRoomAccess(profile, message.room)
    if (message.deletedAt !== undefined) throw new Error('MESSAGE_DELETED')

    const existing = await ctx.db
      .query('messageReactions')
      .withIndex('by_message_and_profile_and_emoji', (q) =>
        q
          .eq('messageId', args.messageId)
          .eq('profileId', profile._id)
          .eq('emoji', args.emoji),
      )
      .unique()

    if (existing === null) {
      await ctx.db.insert('messageReactions', {
        messageId: args.messageId,
        profileId: profile._id,
        emoji: args.emoji,
        createdAt: Date.now(),
      })
      return { reacted: true }
    }

    await ctx.db.delete(existing._id)
    return { reacted: false }
  },
})

/**
 * Kræver: medlem (`requireProfile`). Skriver et heartbeat for "online nu".
 *
 * `isAway` og `awayMessage` kommer fra `/away` og `/back` i chatten og er
 * flygtige, ligesom de var i den gamle apps presence-payload: de står kun så
 * længe, der kommer heartbeats.
 */
export const heartbeat = mutation({
  args: {
    room: chatRooms,
    isAway: v.optional(v.boolean()),
    awayMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx)
    requireRoomAccess(profile, args.room)

    const isAway = args.isAway === true
    const awayMessage = isAway
      ? args.awayMessage?.trim().slice(0, 200)
      : undefined

    const existing = await ctx.db
      .query('chatPresence')
      .withIndex('by_profile_and_room', (q) =>
        q.eq('profileId', profile._id).eq('room', args.room),
      )
      .unique()

    const row = {
      profileId: profile._id,
      room: args.room,
      lastSeenAt: Date.now(),
      isAway,
      ...(awayMessage ? { awayMessage } : {}),
    }

    if (existing === null) {
      await ctx.db.insert('chatPresence', row)
      return
    }

    // `replace` og ikke `patch`: når væk-markeringen fjernes, skal feltet
    // væk igen, og det er entydigt med en hel række.
    await ctx.db.replace(existing._id, row)
  },
})

/**
 * Kræver: medlem (`requireProfile`). Siger farvel, når chatten lukkes, så de
 * andre ikke skal vente på, at heartbeat-vinduet løber ud.
 */
export const leave = mutation({
  args: { room: chatRooms },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx)
    const existing = await ctx.db
      .query('chatPresence')
      .withIndex('by_profile_and_room', (q) =>
        q.eq('profileId', profile._id).eq('room', args.room),
      )
      .unique()
    if (existing === null) return
    await ctx.db.delete(existing._id)
  },
})

/**
 * Kræver: medlem (`requireProfile`), og for `room: 'admin'` derudover
 * administrator (`requireRoomAccess`).
 *
 * Flytter "læst til og med nu" for det pågældende rum. Ulæst-tallet i
 * `unread` regnes ud fra dette tidspunkt.
 */
export const markRoomRead = mutation({
  args: { room: chatRooms },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx)
    requireRoomAccess(profile, args.room)

    const now = Date.now()
    const existing = await ctx.db
      .query('chatReads')
      .withIndex('by_profile_and_room', (q) =>
        q.eq('profileId', profile._id).eq('room', args.room),
      )
      .unique()

    if (existing === null) {
      await ctx.db.insert('chatReads', {
        profileId: profile._id,
        room: args.room,
        lastReadAt: now,
      })
      return
    }

    if (existing.lastReadAt < now) {
      await ctx.db.patch(existing._id, { lastReadAt: now })
    }
  },
})
