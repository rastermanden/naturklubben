import { paginationOptsValidator } from 'convex/server'
import { internalMutation, mutation, query, action } from './_generated/server'
import { internal } from './_generated/api'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { v } from 'convex/values'
import {
  requireAdmin,
  requireProfile,
  requireWritableProfile,
} from './authz'

/**
 * Galleriet: billeder, uploads, optimeringsstatus, albums, kommentarer og
 * sletning. Porteret fra `src/features/gallery/**` og
 * `supabase/functions/optimize-image/index.ts`.
 *
 * ## Sikkerhedsmodellen for filer er ændret -- læs dette før noget ændres
 *
 * Den gamle app havde to Storage-buckets: `photos-original` (privat, kun
 * autentificerede medlemmer kunne læse den, og læsning krævede en signeret URL
 * med udløb) og `photos-optimized` (offentlig). Convex filstorage har hverken
 * buckets, adgangspolitikker eller signerede URL'er: `ctx.storage.getUrl(id)`
 * giver en permanent URL, som *enhver, der kender den*, kan hente. Der er
 * ingen udløbstid at sætte ned, og intet sted at håndhæve "kun medlemmer".
 *
 * Konsekvenserne, som ikke kan kodes væk:
 *
 * - Et billede er beskyttet af, at dets URL er svær at gæste -- ikke af en
 *   politik. Lækker en URL (skærmbillede, delt link, browserhistorik), kan den
 *   hentes af enhver, også uden konto, så længe filen findes.
 * - Derfor udleverer *ingen* query her et `storageId` eller en URL uden først
 *   at have kaldt `requireProfile`. Adgangen er gated i den query, der giver
 *   id'er og URL'er videre, ikke i fillageret. En klient kan altså ikke liste
 *   billeder uden at være medlem -- men en lækket URL kan ikke trækkes tilbage
 *   andet end ved at slette filen.
 * - Skal et billede virkelig være privat, kræver det en anden arkitektur:
 *   filen skal hentes gennem en `httpAction`, som selv kontrollerer
 *   medlemskab, eller ligge krypteret/uden for fillageret. Det er ikke gjort
 *   her, og det er en bevidst, dokumenteret svækkelse i forhold til før.
 *
 * ## Optællinger
 *
 * Convex har ingen `count(*)` og ingen `group by`. Derfor vedligeholdes
 * `photoAlbums.photoCount` (til album-forsiden og begivenhedsoptællingen) og
 * `photos.commentCount` (til badgen på et thumbnail) som tal, der opdateres i
 * *samme mutation* som ændringen. Det er også derfor, der ikke findes et view
 * som `gallery_event_photo_counts`: tallet læses direkte fra albumrækken.
 */

/** Album-nøglen for billeder uden begivenhed. Samme streng som i klienten. */
const WITHOUT_EVENT_ALBUM = 'without-event'

/** Matcher `MAX_FILE_SIZE` i den gamle uploadkø og bucket-grænsen på 15 MB. */
const MAX_FILE_SIZE = 15 * 1024 * 1024

/** Samme grænse som `claim_photo_optimization`s 10-minutters vindue. */
const STALE_OPTIMIZATION_MS = 10 * 60 * 1000

const MAX_CAPTION_LENGTH = 500
const MAX_COMMENT_LENGTH = 1000
const MAX_OPTIMIZATION_ERROR_LENGTH = 500

function albumKeyFor(eventId: string | undefined) {
  return eventId ?? WITHOUT_EVENT_ALBUM
}

function trimmedOrUndefined(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function displayName(fullName: string | undefined) {
  const trimmed = fullName?.trim()
  return trimmed ? trimmed : 'Unavngivet medlem'
}

function isStaleProcessing(photo: Doc<'photos'>, now: number) {
  if (photo.optimizationStatus !== 'processing') return false
  if (photo.optimizationStartedAt === undefined) return true
  return photo.optimizationStartedAt <= now - STALE_OPTIMIZATION_MS
}

async function albumByKey(ctx: QueryCtx | MutationCtx, albumKey: string) {
  return await ctx.db
    .query('photoAlbums')
    .withIndex('by_album_key', (q) => q.eq('albumKey', albumKey))
    .unique()
}

/**
 * Billedets visbare URL'er. Originalen er fallback, indtil der findes afledte
 * filer: der er ingen billedbehandling i Convex' runtime endnu (se
 * `optimizePhoto`), så et `ready`-billede betyder "originalen er hentbar", ikke
 * "der findes en mindre udgave".
 */
async function photoView(
  ctx: QueryCtx | MutationCtx,
  photo: Doc<'photos'>,
  viewer: Doc<'profiles'>,
) {
  const displayId =
    photo.optimizedStorageId ?? photo.thumbnailStorageId ?? photo.storageId
  const thumbnailId =
    photo.thumbnailStorageId ?? photo.optimizedStorageId ?? photo.storageId

  return {
    id: photo._id,
    caption: photo.caption ?? null,
    eventId: photo.eventId ?? null,
    albumKey: photo.albumKey,
    uploaderId: photo.uploaderId,
    createdAt: photo.createdAt,
    width: photo.width ?? null,
    height: photo.height ?? null,
    optimizationStatus: photo.optimizationStatus,
    optimizationAttempts: photo.optimizationAttempts,
    optimizationStartedAt: photo.optimizationStartedAt ?? null,
    optimizationError: photo.optimizationError ?? null,
    commentCount: photo.commentCount,
    // Slettetilladelsen afgøres her og ikke i klienten: reglen er ejer eller
    // admin, og klienten skal ikke selv gætte den. Mutationen kontrollerer den
    // igen -- denne kopi er kun til at vise knappen.
    canDelete: viewer.isAdmin || photo.uploaderId === viewer._id,
    isUploader: photo.uploaderId === viewer._id,
    displayUrl: await ctx.storage.getUrl(displayId),
    thumbnailUrl: await ctx.storage.getUrl(thumbnailId),
  }
}

/**
 * Album-forsiden: ét album pr. begivenhed, plus "Uden begivenhed" -- det
 * `gallery_albums`-viewet viste før. Begivenhedens startdato findes ikke her
 * (kalender-slicen ejer `events`), så sorteringen bruger seneste billede i
 * albummet i stedet for begivenhedsdatoen; "Uden begivenhed" står altid sidst.
 */
export const listAlbums = query({
  args: {},
  handler: async (ctx) => {
    await requireProfile(ctx)

    const albums = await ctx.db.query('photoAlbums').collect()
    const views = await Promise.all(
      albums.map(async (album) => {
        const coverId =
          album.coverThumbnailStorageId ??
          album.coverOptimizedStorageId ??
          undefined
        return {
          albumId: album.albumKey,
          eventId: album.eventId ?? null,
          title:
            album.title ??
            (album.albumKey === WITHOUT_EVENT_ALBUM
              ? 'Uden begivenhed'
              : 'Ukendt begivenhed'),
          photoCount: album.photoCount,
          latestPhotoAt: album.latestPhotoAt ?? null,
          coverPhotoId: album.coverPhotoId ?? null,
          coverUrl: coverId ? await ctx.storage.getUrl(coverId) : null,
        }
      }),
    )

    const withEvent = views
      .filter((album) => album.eventId !== null)
      .sort((left, right) => (right.latestPhotoAt ?? 0) - (left.latestPhotoAt ?? 0))
    const withoutEvent = views.filter((album) => album.eventId === null)
    return [...withEvent, ...withoutEvent]
  },
})

/** Én side billeder, nyeste først -- samme sideinddeling som den gamle app. */
export const listPhotos = query({
  args: {
    albumKey: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx)

    const albumKey = args.albumKey
    const result = albumKey
      ? await ctx.db
          .query('photos')
          .withIndex('by_album', (q) => q.eq('albumKey', albumKey))
          .order('desc')
          .paginate(args.paginationOpts)
      : await ctx.db
          .query('photos')
          .withIndex('by_created')
          .order('desc')
          .paginate(args.paginationOpts)
    const page = await Promise.all(
      result.page.map((photo) => photoView(ctx, photo, profile)),
    )
    return { ...result, page }
  },
})

/** Ét billede, fx fra et delt link. Uden kendt id får klienten `null`. */
export const getPhoto = query({
  args: { photoId: v.id('photos') },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx)
    const photo = await ctx.db.get(args.photoId)
    if (photo === null) return null
    return await photoView(ctx, photo, profile)
  },
})

/** Kommentarer til ét billede, ældste først, med forfatternavn. */
export const listComments = query({
  args: { photoId: v.id('photos') },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx)

    const comments = await ctx.db
      .query('photoComments')
      .withIndex('by_photo', (q) => q.eq('photoId', args.photoId))
      .order('asc')
      .collect()

    const names = new Map<string, string>()
    const views = []
    for (const comment of comments) {
      let authorName = names.get(comment.authorId)
      if (authorName === undefined) {
        const author = await ctx.db.get(comment.authorId)
        authorName = displayName(author?.fullName)
        names.set(comment.authorId, authorName)
      }
      views.push({
        id: comment._id,
        photoId: comment.photoId,
        authorId: comment.authorId,
        authorName,
        body: comment.body,
        createdAt: comment.createdAt,
        // Samme regel som `deleteComment` håndhæver: forfatteren eller admin.
        canDelete: profile.isAdmin || comment.authorId === profile._id,
      })
    }
    return views
  },
})

/**
 * Administratorernes revisionsspor for sletninger af andres billeder. Kun
 * admins kan læse det -- samme regel som RLS-politikken
 * "Admins can read photo moderation log" i den gamle app.
 */
export const listModerationLog = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx)
    return await ctx.db
      .query('photoModerationLog')
      .withIndex('by_requested')
      .order('desc')
      .take(100)
  },
})

/**
 * Brugerens egne rækker, der venter på optimering eller sidder fast i et
 * forældet claim. Den gamle app scanede sine egne rækker fra klienten
 * (`useAutoOptimizePendingPhotos`) for at hele gamle uploads; her gør en
 * dedikeret query det samme, så klienten ikke skal hente hele galleriet.
 */
export const listMyOptimizationQueue = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireProfile(ctx)

    const pending = await ctx.db
      .query('photos')
      .withIndex('by_uploader_status', (q) =>
        q.eq('uploaderId', profile._id).eq('optimizationStatus', 'pending'),
      )
      .take(30)
    const processing = await ctx.db
      .query('photos')
      .withIndex('by_uploader_status', (q) =>
        q.eq('uploaderId', profile._id).eq('optimizationStatus', 'processing'),
      )
      .take(30)

    return [...pending, ...processing].map((photo) => ({
      id: photo._id,
      createdAt: photo.createdAt,
      optimizationStatus: photo.optimizationStatus,
      optimizationStartedAt: photo.optimizationStartedAt ?? null,
    }))
  },
})

/**
 * Albumrækkens tal opdateres i samme mutation som billedet, fordi Convex
 * hverken kan tælle eller gruppere i en query. Coveret sættes kun, når et
 * billede bliver `ready` -- et billede, der stadig optimerer, er ikke et
 * stabilt cover (samme regel som det gamle view).
 */
async function addPhotoToAlbum(
  ctx: MutationCtx,
  photo: {
    albumKey: string
    eventId: string | undefined
    eventTitle: string | undefined
    createdAt: number
  },
) {
  const album = await albumByKey(ctx, photo.albumKey)
  if (album === null) {
    await ctx.db.insert('photoAlbums', {
      albumKey: photo.albumKey,
      eventId: photo.eventId,
      title: photo.eventTitle,
      photoCount: 1,
      latestPhotoAt: photo.createdAt,
    })
    return
  }

  await ctx.db.patch(album._id, {
    photoCount: album.photoCount + 1,
    latestPhotoAt: Math.max(album.latestPhotoAt ?? 0, photo.createdAt),
    // Titlen sættes kun, hvis albummet ikke har en endnu: en senere upload
    // må ikke omdøbe et album, andre medlemmer allerede kender.
    title: album.title ?? photo.eventTitle,
    eventId: album.eventId ?? photo.eventId,
  })
}

async function removePhotoFromAlbum(ctx: MutationCtx, photo: Doc<'photos'>) {
  const album = await albumByKey(ctx, photo.albumKey)
  if (album === null) return

  const photoCount = Math.max(0, album.photoCount - 1)
  if (photoCount === 0 && album.eventId === undefined) {
    // Et tomt "Uden begivenhed"-album er støj; det oprettes igen ved næste
    // upload. Album med en begivenhed bliver stående som tomt, så det stadig
    // kan findes fra kalenderen.
    await ctx.db.delete(album._id)
    return
  }

  const coverBelongsToPhoto = album.coverPhotoId === photo._id
  const nextCover = coverBelongsToPhoto
    ? await ctx.db
        .query('photos')
        .withIndex('by_album', (q) => q.eq('albumKey', photo.albumKey))
        .order('desc')
        .filter((q) =>
          q.and(
            q.eq(q.field('optimizationStatus'), 'ready'),
            q.neq(q.field('_id'), photo._id),
          ),
        )
        .first()
    : null

  await ctx.db.patch(album._id, {
    photoCount,
    coverPhotoId: coverBelongsToPhoto ? nextCover?._id : album.coverPhotoId,
    coverThumbnailStorageId: coverBelongsToPhoto
      ? nextCover?.thumbnailStorageId
      : album.coverThumbnailStorageId,
    coverOptimizedStorageId: coverBelongsToPhoto
      ? nextCover?.optimizedStorageId
      : album.coverOptimizedStorageId,
    coverCreatedAt: coverBelongsToPhoto ? nextCover?.createdAt : album.coverCreatedAt,
  })
}

/**
 * Upload-URL til Convex fillager. Den gamle app uploadede direkte til en
 * Storage-bucket, hvor bucketten håndhævede 15 MB og `image/*`. Convex'
 * upload-URL har ingen sådanne grænser, så de håndhæves i `createPhoto` ud fra
 * filens metadata -- og filen slettes igen, hvis den ikke holder.
 *
 * Kræver et skrivbart medlem: en reserveret kontosletning lukker for nye
 * uploads, som `deletion_reserved_at` gjorde før.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireWritableProfile(ctx)
    return { uploadUrl: await ctx.storage.generateUploadUrl() }
  },
})

/**
 * Registrerer det uploadede billede. Erstatter `upsert_photo_upload`: ejer og
 * optimeringsstatus sættes af serveren, og klienten kan ikke forfalske dem.
 *
 * `clientUploadId` gør et gentaget forsøg idempotent. Den gamle app kunne det,
 * fordi klienten selv valgte `photos.id`; Convex ids kan ikke oprettes i
 * klienten, så uploadkøen sender i stedet et id pr. forsøg. Findes rækken
 * allerede, beholdes dens fil (en ny fil slettes som forældreløs), og kun
 * billedtekst og begivenhed opdateres -- præcis det `on conflict ... do update`
 * gjorde før.
 */
export const createPhoto = mutation({
  args: {
    storageId: v.id('_storage'),
    clientUploadId: v.optional(v.string()),
    caption: v.optional(v.string()),
    eventId: v.optional(v.string()),
    eventTitle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)

    const metadata = await ctx.db.system.get(args.storageId)
    if (metadata === null) {
      throw new Error('PHOTO_UPLOAD_NOT_FOUND')
    }
    if (!(metadata.contentType ?? '').startsWith('image/')) {
      await ctx.storage.delete(args.storageId)
      throw new Error('PHOTO_NOT_AN_IMAGE')
    }
    if (metadata.size > MAX_FILE_SIZE) {
      await ctx.storage.delete(args.storageId)
      throw new Error('PHOTO_TOO_LARGE')
    }

    const caption = trimmedOrUndefined(args.caption)
    if (caption !== undefined && caption.length > MAX_CAPTION_LENGTH) {
      await ctx.storage.delete(args.storageId)
      throw new Error('PHOTO_CAPTION_TOO_LONG')
    }

    const clientUploadId = trimmedOrUndefined(args.clientUploadId)
    if (clientUploadId !== undefined) {
      const existing = await ctx.db
        .query('photos')
        .withIndex('by_client_upload', (q) =>
          q.eq('uploaderId', profile._id).eq('clientUploadId', clientUploadId),
        )
        .unique()
      if (existing !== null) {
        if (existing.storageId !== args.storageId) {
          await ctx.storage.delete(args.storageId)
        }
        await ctx.db.patch(existing._id, { caption })
        return existing._id
      }
    }

    const eventId = trimmedOrUndefined(args.eventId)
    const now = Date.now()
    const photoId = await ctx.db.insert('photos', {
      storageId: args.storageId,
      caption,
      albumKey: albumKeyFor(eventId),
      eventId,
      uploaderId: profile._id,
      clientUploadId,
      createdAt: now,
      optimizationStatus: 'pending',
      optimizationAttempts: 0,
      commentCount: 0,
    })

    await addPhotoToAlbum(ctx, {
      albumKey: albumKeyFor(eventId),
      eventId,
      eventTitle: trimmedOrUndefined(args.eventTitle),
      createdAt: now,
    })

    return photoId
  },
})

/**
 * Sletter et billede. Ejeren selv eller en admin må slette -- samme regel som
 * `claim_photo_deletion` (20260823215500_admin_photo_moderation.sql) gav.
 *
 * Den gamle sletning kørte som en Edge Function med et claim, fordi
 * fillageret lå uden for databasen: `deleting`, `delete_failed` og et
 * `deletion_attempt` skulle kunne genoptages. En Convex-mutation er atomisk --
 * filer, kommentarer, albumtal og rækken forsvinder sammen, eller intet gør --
 * så her findes ingen mellemtilstand at prøve igen. Er en optimering i gang,
 * afvises sletningen i stedet, indtil claimet er forældet efter ti minutter;
 * det er samme svar som Edge Functionens 409.
 */
export const deletePhoto = mutation({
  args: { photoId: v.id('photos') },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)

    const photo = await ctx.db.get(args.photoId)
    if (photo === null) {
      throw new Error('PHOTO_NOT_FOUND')
    }

    const isOwner = photo.uploaderId === profile._id
    if (!isOwner && !profile.isAdmin) {
      throw new Error('PHOTO_DELETE_NOT_AUTHORIZED')
    }

    const now = Date.now()
    if (
      photo.optimizationStatus === 'processing' &&
      !isStaleProcessing(photo, now)
    ) {
      throw new Error('PHOTO_BUSY')
    }

    if (!isOwner) {
      // Revisionssporet skrives, før billedet forsvinder, og gemmer navne som
      // snapshots: både billedet og profilerne kan være væk senere.
      const uploader = await ctx.db.get(photo.uploaderId)
      await ctx.db.insert('photoModerationLog', {
        photoId: photo._id,
        actorId: profile._id,
        actorName: displayName(profile.fullName),
        uploaderId: photo.uploaderId,
        uploaderName: displayName(uploader?.fullName),
        caption: photo.caption,
        storageId: photo.storageId,
        deletionAttempt: photo.optimizationAttempts,
        status: 'completed',
        requestedAt: now,
        completedAt: now,
      })
    }

    // Kommentarerne kaskaderede i Postgres. Convex har ingen fremmednøgler,
    // så de slettes her i samme mutation.
    const comments = await ctx.db
      .query('photoComments')
      .withIndex('by_photo', (q) => q.eq('photoId', photo._id))
      .collect()
    for (const comment of comments) {
      await ctx.db.delete(comment._id)
    }

    await removePhotoFromAlbum(ctx, photo)

    const storageIds = new Set<Id<'_storage'>>([photo.storageId])
    if (photo.optimizedStorageId !== undefined) {
      storageIds.add(photo.optimizedStorageId)
    }
    if (photo.thumbnailStorageId !== undefined) {
      storageIds.add(photo.thumbnailStorageId)
    }
    for (const storageId of storageIds) {
      await ctx.storage.delete(storageId)
    }

    await ctx.db.delete(photo._id)
  },
})

/**
 * Ny kommentar på et billede. Erstatter `create_photo_comment`: afsenderen
 * sættes af serveren, teksten trimmes, og 1-1000 tegn håndhæves her, fordi
 * der ikke findes en `check`-constraint som i Postgres.
 *
 * Kommentarerne er ikke tilladt at slette via `deleteComment` for andre end
 * forfatteren og admins, men *alle* medlemmer må læse dem -- det er samme
 * kreds som billederne selv.
 */
export const addComment = mutation({
  args: { photoId: v.id('photos'), body: v.string() },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)

    const body = args.body.trim()
    if (body.length === 0 || body.length > MAX_COMMENT_LENGTH) {
      throw new Error('PHOTO_COMMENT_INVALID_BODY')
    }

    const photo = await ctx.db.get(args.photoId)
    if (photo === null) {
      throw new Error('PHOTO_NOT_FOUND')
    }

    const now = Date.now()
    const commentId = await ctx.db.insert('photoComments', {
      photoId: photo._id,
      authorId: profile._id,
      body,
      createdAt: now,
    })
    await ctx.db.patch(photo._id, { commentCount: photo.commentCount + 1 })

    return {
      id: commentId,
      photoId: photo._id,
      authorId: profile._id,
      authorName: displayName(profile.fullName),
      body,
      createdAt: now,
    }
  },
})

/**
 * Slet en kommentar. Forfatteren selv eller en admin -- samme regel som
 * `delete_photo_comment` i den gamle app. Kommentaren fjernes helt; der er
 * intet moderationsbehov for at bevare en tømt kommentar, som der er for
 * fælleschatten.
 */
export const deleteComment = mutation({
  args: { commentId: v.id('photoComments') },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)

    const comment = await ctx.db.get(args.commentId)
    if (comment === null) {
      throw new Error('PHOTO_COMMENT_NOT_FOUND')
    }
    if (comment.authorId !== profile._id && !profile.isAdmin) {
      throw new Error('PHOTO_COMMENT_DELETE_NOT_AUTHORIZED')
    }

    await ctx.db.delete(comment._id)

    const photo = await ctx.db.get(comment.photoId)
    if (photo !== null) {
      await ctx.db.patch(photo._id, {
        commentCount: Math.max(0, photo.commentCount - 1),
      })
    }
  },
})

/**
 * Claimer et optimeringsforsøg: én mutation, der tæller forsøget op og sætter
 * `processing`. Det er den samme overgang som `claim_photo_optimization` lavede
 * med `UPDATE ... RETURNING`, og den findes af samme grund -- to samtidige
 * forsøg må ikke arbejde på samme fil, og et forsøg, der dør, skal kunne
 * genoptages efter ti minutter.
 *
 * `internalMutation`: en klient må ikke kunne sætte sin egen status. Kun
 * `optimizePhoto` (action) kalder den.
 */
export const claimOptimization = internalMutation({
  args: { photoId: v.id('photos') },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)

    const photo = await ctx.db.get(args.photoId)
    if (photo === null || photo.uploaderId !== profile._id) {
      // Som i den gamle app: kun uploaderen selv må optimere sit billede.
      return { status: 'not_found' as const }
    }

    const now = Date.now()
    if (photo.optimizationStatus === 'processing' && !isStaleProcessing(photo, now)) {
      return { status: 'busy' as const }
    }
    if (photo.optimizationStatus === 'ready') {
      return { status: 'ready' as const }
    }

    const attempt = photo.optimizationAttempts + 1
    await ctx.db.patch(photo._id, {
      optimizationStatus: 'processing',
      optimizationAttempts: attempt,
      optimizationStartedAt: now,
      optimizationCompletedAt: undefined,
      optimizationError: undefined,
    })

    return { status: 'claimed' as const, storageId: photo.storageId, attempt }
  },
})

/**
 * Afslutter et claimet forsøg. `expectedAttempt` er hegnet: et forsøg, der
 * bliver færdigt efter et nyere genforsøg, ændrer nul rækker -- præcis som
 * `complete_photo_optimization` sikrede med `optimization_attempts =
 * p_expected_attempt`.
 *
 * `succeeded` uden output-id'er er tilladt i V2, fordi der ikke findes nogen
 * billedbehandling: se `optimizePhoto`. Sætter en senere Node-action
 * `optimizedStorageId` og `thumbnailStorageId`, bruger visningen dem
 * automatisk.
 */
export const finishOptimization = internalMutation({
  args: {
    photoId: v.id('photos'),
    expectedAttempt: v.number(),
    succeeded: v.boolean(),
    optimizedStorageId: v.optional(v.id('_storage')),
    thumbnailStorageId: v.optional(v.id('_storage')),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)

    const photo = await ctx.db.get(args.photoId)
    if (photo === null || photo.uploaderId !== profile._id) {
      throw new Error('PHOTO_NOT_FOUND')
    }
    if (
      photo.optimizationStatus !== 'processing' ||
      photo.optimizationAttempts !== args.expectedAttempt
    ) {
      // Overhalet af et nyere forsøg. Ikke en fejl; der er intet at rette.
      return { applied: false }
    }

    const now = Date.now()
    if (!args.succeeded) {
      await ctx.db.patch(photo._id, {
        optimizationStatus: 'failed',
        optimizationCompletedAt: undefined,
        optimizationError: (args.error ?? 'Billedet kunne ikke optimeres.').slice(
          0,
          MAX_OPTIMIZATION_ERROR_LENGTH,
        ),
      })
      return { applied: true }
    }

    await ctx.db.patch(photo._id, {
      optimizationStatus: 'ready',
      optimizationCompletedAt: now,
      optimizationError: undefined,
      optimizedStorageId: args.optimizedStorageId ?? photo.optimizedStorageId,
      thumbnailStorageId: args.thumbnailStorageId ?? photo.thumbnailStorageId,
      width: args.width ?? photo.width,
      height: args.height ?? photo.height,
    })

    // Coveret er det nyeste `ready`-billede i albummet, som det gamle view
    // valgte det. Sammenligningen bruger `coverCreatedAt`, så albumrækken ikke
    // skal slå den nuværende coverfil op.
    const album = await albumByKey(ctx, photo.albumKey)
    if (
      album !== null &&
      (album.coverCreatedAt === undefined || album.coverCreatedAt <= photo.createdAt)
    ) {
      await ctx.db.patch(album._id, {
        coverPhotoId: photo._id,
        coverThumbnailStorageId: args.thumbnailStorageId ?? photo.thumbnailStorageId,
        coverOptimizedStorageId: args.optimizedStorageId ?? photo.optimizedStorageId,
        coverCreatedAt: photo.createdAt,
      })
    }

    return { applied: true }
  },
})

/**
 * Starter et optimeringsforsøg for ét billede. Klienten kalder den efter et
 * upload og fra "prøv igen"-knappen; den samme vej bruges af den automatiske
 * heling af hængende billeder (`useAutoOptimizePendingPhotos`).
 *
 * ## Hvad der er porteret, og hvad der ikke er
 *
 * Porteret: claim, tilstandsmaskinen (`pending` -> `processing` -> `ready`,
 * eller `failed` med et genforsøg), hegn om forsøgsnummeret, fejlteksten på
 * rækken og "kun uploaderen selv".
 *
 * Ikke porteret: selve billedbehandlingen. Den gamle Edge Function brugte
 * `imagescript` (WASM) til at dreje efter EXIF, skalere til 1600 px og 400 px
 * og gemme to JPEG-filer. Convex' standard-runtime er V8 og har hverken
 * billed-API eller filsystem, så den slags kræver en Node-action
 * (`"use node"` i toppen af en fil i `convex/`) med et billedbibliotek som
 * `sharp` eller `@jsquash/*`. Det er en ny npm-afhængighed, og den er derfor
 * **ikke** tilføjet her.
 *
 * Hvad der kan gøres med `fetch` -- og gøres her -- er at hente originalens
 * URL og konstatere, at filen faktisk kan leveres. Det er den kontrol, der
 * adskiller "uploadet og hentbar" fra "uploadet til en død reference".
 *
 * Konsekvensen skal siges højt: `ready` betyder i V2 "originalen er hentbar",
 * ikke "der findes en mindre udgave". Visningen falder tilbage til originalen,
 * så galleriet virker, men et mobilupload på flere MB hentes i fuld størrelse
 * som thumbnail. Det er en reel regression i forhold til den gamle app og
 * kræver beslutningen om en Node-action (og dermed en afhængighed) før den
 * forsvinder. Filer der skal ændres, når beslutningen er taget:
 * `V2/package.json` (afhængigheden), en ny `V2/convex/imageProcessing.ts` med
 * `"use node"` og selve behandlingen, `V2/convex/gallery.ts`s `optimizePhoto`
 * (kald Node-actionen i stedet for kun at hente URL'en) og
 * `V2/convex/tables/gallery.ts` (intet nyt felt nødvendigt; id-felterne findes).
 */
export const optimizePhoto = action({
  args: { photoId: v.id('photos') },
  handler: async (ctx, args) => {
    // En action har ikke `ctx.db`. Medlemskabet kontrolleres derfor i de
    // interne mutationer herunder, som begge kalder `requireWritableProfile` --
    // en action uden det kald ville være offentlig, ligesom en query.
    const claim = await ctx.runMutation(internal.gallery.claimOptimization, {
      photoId: args.photoId,
    })
    if (claim.status !== 'claimed') return claim.status

    try {
      const url = await ctx.storage.getUrl(claim.storageId)
      if (url === null) {
        await ctx.runMutation(internal.gallery.finishOptimization, {
          photoId: args.photoId,
          expectedAttempt: claim.attempt,
          succeeded: false,
          error: 'Originalfilen kunne ikke læses. Upload billedet igen.',
        })
        return 'failed'
      }

      const response = await fetch(url)
      if (!response.ok) {
        // Stop kroppen med det samme: der er ingen grund til at hente flere
        // megabyte for at konstatere, at svaret var en fejl.
        await response.body?.cancel()
        await ctx.runMutation(internal.gallery.finishOptimization, {
          photoId: args.photoId,
          expectedAttempt: claim.attempt,
          succeeded: false,
          error: 'Originalfilen kunne ikke hentes. Prøv igen.',
        })
        return 'failed'
      }
      await response.body?.cancel()

      await ctx.runMutation(internal.gallery.finishOptimization, {
        photoId: args.photoId,
        expectedAttempt: claim.attempt,
        succeeded: true,
      })
      return 'ready'
    } catch (error) {
      // Også den uventede fejl skal ende som en status på rækken -- ellers står
      // billedet som "Optimerer…", indtil claimet bliver forældet.
      console.error('Photo optimization failed', { photoId: args.photoId, error })
      await ctx.runMutation(internal.gallery.finishOptimization, {
        photoId: args.photoId,
        expectedAttempt: claim.attempt,
        succeeded: false,
        error: 'Billedet kunne ikke optimeres. Prøv igen.',
      })
      return 'failed'
    }
  },
})
