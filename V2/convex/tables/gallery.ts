import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * Galleridomænet: billeder, albums, kommentarer, optimeringsstatus og
 * moderatorlog.
 *
 * Oversat fra Postgres-tabellerne `photos`, `photo_comments`,
 * `photo_moderation_log` samt viewsene `gallery_albums`,
 * `gallery_event_photo_counts` og `photo_comment_counts`
 * (supabase/migrations/20260821170003_photos.sql,
 * 20260823161000_gallery_upload_status.sql,
 * 20260823215500_admin_photo_moderation.sql,
 * 20260823220000_gallery_event_photo_counts.sql og
 * 20260916090000_photo_albums_comments.sql).
 *
 * To ting er *ikke* en direkte oversættelse:
 *
 * 1. **Filerne ligger i Convex filstorage.** Der er ingen buckets og ingen
 *    stier, kun et `Id<'_storage'>` pr. fil. `storage_path`, `optimized_path`
 *    og `thumbnail_path` bliver derfor til id'er. Se kommentaren om
 *    sikkerhedsmodellen i `convex/gallery.ts`.
 * 2. **Albums og optællinger er tabeller, ikke views.** Convex har ingen
 *    `count(*)`/`group by`, så `photoAlbums` vedligeholdes som tal i samme
 *    mutation som billedet oprettes eller slettes. Det er også derfor
 *    `photos.commentCount` findes: badgen på et thumbnail må ikke kræve, at
 *    klienten henter alle kommentarer.
 */
export const galleryTables = {
  photos: defineTable({
    /** Originalen, som medlemmet uploadede. */
    storageId: v.id('_storage'),
    /**
     * Afledte filer. De findes ikke i V2 endnu: der er ingen billedbehandling
     * i Convex' runtime (se `optimizePhoto` i `convex/gallery.ts`). Felterne
     * er med, så en senere Node-action kan sætte dem uden en migration.
     */
    optimizedStorageId: v.optional(v.id('_storage')),
    thumbnailStorageId: v.optional(v.id('_storage')),
    /**
     * Den gamle `photos`-tabel gemte ikke dimensioner; de er med her, fordi
     * en Node-action med et billedbibliotek alligevel læser dem ud, og fordi
     * et gitter uden kendt højde/bredde hopper, når billederne lander.
     */
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    caption: v.optional(v.string()),
    /**
     * Album-nøglen: begivenhedens id, eller `without-event` (se
     * `WITHOUT_EVENT_ALBUM` i `src/features/gallery/gallerySearchParams.ts`).
     * Feltet er en kopi af `eventId`, lavet fordi `eventId` er valgfrit og
     * Convex-indekser ikke kan slå `undefined` og en værdi op i samme søgning.
     * Det gør "billederne i dette album" til ét indeksopslag.
     */
    albumKey: v.string(),
    /**
     * Begivenheden billedet hører til. Typen er `v.string()` og ikke
     * `v.id('events')`, fordi `convex/tables/calendar.ts` endnu ikke har en
     * `events`-tabel -- et `v.id('events')` ville få skemaet til at fejle,
     * indtil kalender-slicen lander. Skift typen (og opslaget i `createPhoto`)
     * til `v.id('events')` derefter.
     */
    eventId: v.optional(v.string()),
    /**
     * Convex har ingen fremmednøgler, så `on delete cascade` fra den gamle
     * `photos.uploaded_by` findes ikke. Kontosletningen (som er sin egen
     * slice) skal derfor selv slette brugerens billeder gennem
     * `gallery.deletePhoto`, så filerne også forsvinder fra fillageret.
     */
    uploaderId: v.id('profiles'),
    /**
     * Klientens eget id for ét upload-forsøg. Erstatter den gamle apps
     * klient-genererede `photos.id`: et gentaget forsøg på samme fil må ikke
     * give to rækker (se `upsert_photo_upload` i den gamle migration).
     */
    clientUploadId: v.optional(v.string()),
    createdAt: v.number(),
    /**
     * Optimeringsstatus. Maskinen er den samme som i den gamle app:
     * `pending` -> `processing` -> `ready`, eller `failed` med et genforsøg.
     * `deleting`/`delete_failed` er bevidst *ikke* porteret: en Convex-mutation
     * er atomisk, så en sletning enten gennemføres helt eller rulles tilbage --
     * der findes ingen vedvarende "sletningen fejlede"-tilstand at prøve igen.
     */
    optimizationStatus: v.union(
      v.literal('pending'),
      v.literal('processing'),
      v.literal('ready'),
      v.literal('failed'),
    ),
    /** Tælles op ved hvert claim, og bruges til at afvise overhalede forsøg. */
    optimizationAttempts: v.number(),
    optimizationStartedAt: v.optional(v.number()),
    optimizationCompletedAt: v.optional(v.number()),
    optimizationError: v.optional(v.string()),
    /** Antal kommentarer. Vedligeholdes i samme mutation som kommentaren. */
    commentCount: v.number(),
  })
    .index('by_created', ['createdAt'])
    .index('by_album', ['albumKey', 'createdAt'])
    .index('by_uploader', ['uploaderId', 'createdAt'])
    .index('by_uploader_status', ['uploaderId', 'optimizationStatus'])
    .index('by_client_upload', ['uploaderId', 'clientUploadId'])
    .index('by_status', ['optimizationStatus', 'optimizationStartedAt']),

  /**
   * Ét album pr. begivenhed, plus "Uden begivenhed" -- det samme som viewet
   * `gallery_albums` viste. Tabellen findes, fordi Convex ikke kan gruppere:
   * `photoCount`, `latestPhotoAt` og coveret opdateres i samme mutation som
   * billedet, så album-forsiden er ét indeksopslag i stedet for en scanning
   * af alle billeder.
   */
  photoAlbums: defineTable({
    /** Begivenhedens id, eller `without-event`. Unik for albummet. */
    albumKey: v.string(),
    eventId: v.optional(v.string()),
    /**
     * Snapshot af begivenhedens titel. Kalender-slicen ejer `events`, og indtil
     * den findes, er titlen det, upload-formularen sendte med. En klient kan
     * derfor sætte en misvisende titel -- det er samme slags tillid som til en
     * billedtekst. Når `events` findes, skal titlen slås op i stedet.
     */
    title: v.optional(v.string()),
    photoCount: v.number(),
    latestPhotoAt: v.optional(v.number()),
    /** Nyeste `ready`-billede, som i det gamle view. */
    coverPhotoId: v.optional(v.id('photos')),
    coverThumbnailStorageId: v.optional(v.id('_storage')),
    coverOptimizedStorageId: v.optional(v.id('_storage')),
    coverCreatedAt: v.optional(v.number()),
  })
    .index('by_album_key', ['albumKey'])
    .index('by_latest_photo_at', ['latestPhotoAt']),

  /**
   * Kommentarer til ét billede. Erstatter `photo_comments`; reglen om hvem der
   * må slette (forfatteren selv eller en admin) håndhæves i
   * `gallery.deletePhotoComment`, fordi Convex ikke har RLS.
   *
   * Der er ingen `ON DELETE CASCADE`: `gallery.deletePhoto` sletter billedets
   * kommentarer i samme mutation, som den sletter billedet.
   */
  photoComments: defineTable({
    photoId: v.id('photos'),
    authorId: v.id('profiles'),
    body: v.string(),
    createdAt: v.number(),
  })
    .index('by_photo', ['photoId', 'createdAt'])
    .index('by_author', ['authorId']),

  /**
   * Revisionsspor for administratorsletninger af andres billeder. Rækkerne
   * bevares, efter at billedet er væk, og gemmer derfor snapshots af navne og
   * id'er i stedet for referencer.
   *
   * `status` har de samme tre værdier som før. Sletningen er nu synkron, så
   * rækken skrives som `completed` med det samme; `pending` og `failed` findes
   * til en fremtidig asynkron arbejdsgang (fx en Node-action), så
   * moderationshistorikken ikke skal skrive sin egen tilstandsmaskine senere.
   */
  photoModerationLog: defineTable({
    photoId: v.id('photos'),
    /** `undefined` efter en kontosletning -- navnet står i `actorName`. */
    actorId: v.optional(v.id('profiles')),
    actorName: v.string(),
    uploaderId: v.optional(v.id('profiles')),
    uploaderName: v.string(),
    caption: v.optional(v.string()),
    storageId: v.string(),
    deletionAttempt: v.number(),
    status: v.union(
      v.literal('pending'),
      v.literal('completed'),
      v.literal('failed'),
    ),
    requestedAt: v.number(),
    completedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index('by_requested', ['requestedAt'])
    .index('by_photo', ['photoId']),
}
