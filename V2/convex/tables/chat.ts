import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * Chatdomænet: beskeder, reaktioner, svar, mentions, afstemninger, søgning,
 * tilstedeværelse og ulæst-markering.
 *
 * Oversat fra den gamle apps `messages`, `message_reactions`, `polls`,
 * `poll_options` og `poll_votes` plus de indeks, der blev lagt på undervejs
 * (se `20260821170004_messages.sql` og frem til
 * `20260917090000_chat_offline_queue.sql`).
 *
 * Fire ting er anderledes end Postgres, og de er valg, ikke glemsel:
 *
 * 1. **Ingen unikke indeks.** Convex kan ikke erklære en kolonne unik. Den
 *    gamle app brugte primærnøglen som idempotensnøgle (`send_chat_message`
 *    indsatte med klientens id). Her er `clientId` en almindelig kolonne med
 *    et indeks, og mutationen i `convex/chat.ts` returnerer tidligt, hvis den
 *    findes. Det er lige så sikkert, fordi Convex kører mutationer serielt:
 *    opslaget og indsættelsen kan ikke overlappe.
 * 2. **Ingen `check`-constraints.** Grænser som 2000 tegn og 2-6
 *    svarmuligheder håndhæves i mutationen. Et felt som `emoji` er derfor en
 *    union og ikke en fri streng.
 * 3. **Ingen `count(*)`.** Stemmetal og ulæste tælles ved at læse rækkerne;
 *    se kommentaren i `convex/chatPolls.ts` om hvorfor det er billigt nok her.
 * 4. **Søgning er en tabel, ikke et trigram-indeks.** Se
 *    `messageSearchTokens` nedenfor.
 */

/** De to rum: ét fælles for alle medlemmer og ét, kun administratorer ser. */
export const chatRooms = v.union(v.literal('general'), v.literal('admin'))

/**
 * Det faste reaktionssæt. En union og ikke en fri streng, fordi den gamle app
 * håndhævede sættet i et `check`-constraint; her er typen selv grænsen, og
 * rækkefølgen er den, chippene vises i.
 */
export const reactionEmojis = v.union(
  v.literal('👍'),
  v.literal('❤️'),
  v.literal('😂'),
  v.literal('😮'),
  v.literal('🙏'),
)

export const chatTables = {
  /**
   * Beskeder i begge rum. Ét rum pr. række i stedet for en tabel pr. rum:
   * svar, reaktioner, mentions, søgning og sletning er bygget oven på
   * beskeder, og de skal virke ens i begge rum (samme begrundelse som i
   * `20260912090000_admin_chatroom.sql`).
   */
  messages: defineTable({
    room: chatRooms,
    /**
     * Afsenderen. Tom, når medlemmet er slettet -- i den gamle app var
     * kolonnen `on delete set null`, så historikken består anonymiseret.
     */
    authorId: v.optional(v.id('profiles')),
    content: v.string(),
    messageType: v.union(v.literal('text'), v.literal('action')),
    /** Id'er, ikke navne: danske navne har mellemrum, og navne kan skifte. */
    mentions: v.array(v.id('profiles')),
    /** Serverens modtagelsestid i ms. Rækkefølgen i chatten bygges på denne. */
    createdAt: v.number(),
    /**
     * Det tidspunkt, brugeren skrev beskeden. Sat af offline-køens vej, så en
     * besked fra en dag uden dækning ikke ser ud til at være skrevet, da den
     * nåede frem. `createdAt` er stadig det, der sorteres efter.
     */
    writtenAt: v.optional(v.number()),
    /**
     * Sat, hvis beskeden er redigeret. Ingen mutation sætter den endnu: den
     * gamle app trak update-rettigheden tilbage fra `authenticated`, og
     * beskeder kan derfor hverken redigeres af afsenderen eller af en admin.
     * Feltet er med, så en senere redigeringsfunktion ikke kræver en
     * migrering af hver besked.
     */
    editedAt: v.optional(v.number()),
    replyToId: v.optional(v.id('messages')),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id('profiles')),
    /**
     * Klientens eget id, som erstatter primærnøglen som idempotensnøgle.
     * Offline-køen giver beskeden sit id, før den er sendt, så en gentagelse
     * -- fordi svaret gik tabt, eller appen blev lukket midt i afsendelsen --
     * hverken kan give en dublet eller overskrive indholdet.
     */
    clientId: v.string(),
  })
    .index('by_room_and_created_at', ['room', 'createdAt'])
    .index('by_client_id', ['clientId'])
    .index('by_reply_to', ['replyToId']),

  /**
   * Reaktioner. Det kombinerede indeks håndhæver "én af hver reaktion pr.
   * medlem pr. besked" i praksis: mutationen slår op på alle tre felter, før
   * den indsætter eller sletter.
   */
  messageReactions: defineTable({
    messageId: v.id('messages'),
    profileId: v.id('profiles'),
    emoji: reactionEmojis,
    createdAt: v.number(),
  })
    .index('by_message', ['messageId'])
    .index('by_message_and_profile_and_emoji', [
      'messageId',
      'profileId',
      'emoji',
    ]),

  /**
   * Søgeindekset, som erstatter `ilike '%term%'` og trigram-indekset fra den
   * gamle app (#183).
   *
   * Convex' indbyggede søgeindeks matcher tokens og deres præfikser -- det
   * finder "skovsøen", når man taster "skovs", men aldrig "søen" midt i ordet.
   * Den gamle app søgte midt i ord, og det er den oplevelse, der skal bevares
   * her. Derfor gemmes **hver delstreng af hvert ord** som en `token`: for
   * ordet "skovsøen" bliver det "skovsøen", "kovsøen", "ovsøen", ... "n".
   * Et opslag er så et område på indekset -- alle tokens, der begynder med
   * søgeordet -- og det er præcis de steder i teksten, hvor ordet står.
   *
   * Tabellen vedligeholdes i samme mutation som beskeden (indsæt ved
   * `sendMessage`, slet ved `softDeleteMessage`), så den ikke kan komme ud af
   * trit med `messages`. Prisen er flere dokumenter pr. besked end der er ord;
   * begge lister er derfor begrænset i `convex/chat.ts`.
   */
  messageSearchTokens: defineTable({
    room: chatRooms,
    token: v.string(),
    messageId: v.id('messages'),
    /** Samme værdi som beskedens `createdAt`, så træffere kan sorteres. */
    createdAt: v.number(),
  })
    .index('by_room_and_token', ['room', 'token'])
    .index('by_message', ['messageId']),

  /**
   * Afstemningen hænger på en besked -- beskeden *er* afstemningen set fra
   * afsenderens side, med spørgsmålet som indhold. Derfor arver den også
   * beskedens rum og synlighed i stedet for at have sit eget rumfelt.
   */
  chatPolls: defineTable({
    messageId: v.id('messages'),
    question: v.string(),
    /** Tom, hvis opretteren er slettet -- de andres stemmer består. */
    createdBy: v.optional(v.id('profiles')),
    createdAt: v.number(),
    closedAt: v.optional(v.number()),
    closedBy: v.optional(v.id('profiles')),
  }).index('by_message', ['messageId']),

  pollOptions: defineTable({
    pollId: v.id('chatPolls'),
    /** 0-baseret, i den rækkefølge svarene blev skrevet i kommandoen. */
    position: v.number(),
    label: v.string(),
  }).index('by_poll_and_position', ['pollId', 'position']),

  /**
   * Én stemme pr. medlem pr. afstemning: mutationen slår op på
   * `(pollId, profileId)` og erstatter den gamle stemme frem for at lægge en
   * ny ved siden af, så et "stem om" kun kan ændre, ikke fordoble.
   */
  pollVotes: defineTable({
    pollId: v.id('chatPolls'),
    profileId: v.id('profiles'),
    optionId: v.id('pollOptions'),
    createdAt: v.number(),
  })
    .index('by_poll', ['pollId'])
    .index('by_poll_and_profile', ['pollId', 'profileId']),

  /**
   * "Online nu". Supabase havde Presence, hvor en forbindelse forsvandt af sig
   * selv, når fanen blev lukket. Convex har ingen indbygget presence uden et
   * component, og her er der ikke tilføjet nye afhængigheder: i stedet skriver
   * klienten et heartbeat hvert halve minut, og en forespørgsel viser dem, der
   * har skrevet inden for vinduet. Det er en tilnærmelse -- se
   * `chat.onlineMembers` -- og den forsvinder ikke af sig selv, hvis en telefon
   * dør uden at sende farvel.
   */
  chatPresence: defineTable({
    profileId: v.id('profiles'),
    room: chatRooms,
    lastSeenAt: v.number(),
    isAway: v.boolean(),
    awayMessage: v.optional(v.string()),
  })
    .index('by_profile_and_room', ['profileId', 'room'])
    .index('by_room_and_last_seen', ['room', 'lastSeenAt']),

  /**
   * Hvor langt et medlem er nået i hvert rum. Ulæst-tallet er antallet af
   * andres beskeder efter `lastReadAt`, så der er ingen tælling at holde i
   * sync -- kun et tidspunkt.
   */
  chatReads: defineTable({
    profileId: v.id('profiles'),
    room: chatRooms,
    lastReadAt: v.number(),
  }).index('by_profile_and_room', ['profileId', 'room']),
}
