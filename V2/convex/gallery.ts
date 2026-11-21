import { paginationOptsValidator } from 'convex/server'
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  action,
  httpAction,
} from './_generated/server'
import { internal } from './_generated/api'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { ConvexError, v } from 'convex/values'
import { requireAdmin, requireProfile, requireWritableProfile } from './authz'
import { parseByteRange } from './audio'

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
export const MAX_FILE_SIZE = 15 * 1024 * 1024

/** Loft for videoer i galleriet: 50 MB (under 2-min upload-timeout og 100 MiB svarloft). */
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024

export const ALLOWED_VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
])

export type CreateVideoError =
  | 'VIDEO_UPLOAD_NOT_FOUND'
  | 'VIDEO_UNSUPPORTED_TYPE'
  | 'VIDEO_EMPTY'
  | 'VIDEO_TOO_LARGE'
  | 'PHOTO_CAPTION_TOO_LONG'
  | 'VIDEO_THUMBNAIL_INVALID'
  | 'VIDEO_THUMBNAIL_TOO_LARGE'

export function normalizeVideoMime(
  contentType: string | undefined,
): string | null {
  if (!contentType) return null
  const base = contentType.split(';', 1)[0]?.trim().toLowerCase() ?? ''
  return ALLOWED_VIDEO_MIME_TYPES.has(base) ? base : null
}

/** Samme grænse som `claim_photo_optimization`s 10-minutters vindue. */
const STALE_OPTIMIZATION_MS = 10 * 60 * 1000

const MAX_CAPTION_LENGTH = 500
const MAX_COMMENT_LENGTH = 1000
const MAX_OPTIMIZATION_ERROR_LENGTH = 500
const MAX_BULK_MOVE = 100

/**
 * Hvor et billede med et `eventId` fra en klient skal ligge: albummets nøgle,
 * og begivenheden bag den, hvis den kan findes.
 *
 * Tre udfald, fordi `eventId` ikke altid er et Convex-id:
 *
 * 1. Et levende `events`-id. Albummet er begivenhedens, og titlen kommer fra
 *    rækken -- ikke fra klienten.
 * 2. Ikke et `events`-id, men der findes et album med netop den nøgle. Det er
 *    de album, V1-importen lagde ind: `migrateV1.ts` bruger V1's egen UUID som
 *    både `albumKey` og `eventId` (begivenhederne fik nye Convex-id'er, og der
 *    er ingen remapping). Billedet skal i det album, det blev uploadet fra, så
 *    nøglen beholdes -- og albummets egen titel får stå.
 * 3. Hverken det ene eller det andet: turen er slettet, mens uploaden lå i
 *    køen, eller feltet er pillet ved. Så "Uden begivenhed", frem for at
 *    afvise billedet eller lave et album, ingen begivenhed svarer til.
 *    Bemærk: et slettet V2-id (`normalizeId('events', ...) !== null`, men
 *    `ctx.db.get(...) === null`) falder aldrig tilbage til `albumByKey` --
 *    det ville ellers genåbne et gammelt tomt album på en slettet tur.
 *
 * `normalizeId` frem for et rent `ctx.db.get`, fordi feltet er en `v.string()`:
 * den giver `null` for alt, der ikke er et id i `events`, i stedet for at kaste.
 */
async function albumTargetFor(ctx: MutationCtx, eventId: string | undefined) {
  const trimmed = trimmedOrUndefined(eventId)
  if (trimmed === undefined) {
    return { albumKey: WITHOUT_EVENT_ALBUM, eventId: undefined, event: null }
  }

  const normalized = ctx.db.normalizeId('events', trimmed)
  if (normalized !== null) {
    const event = await ctx.db.get(normalized)
    if (event !== null) {
      return { albumKey: event._id, eventId: event._id, event }
    }
    return { albumKey: WITHOUT_EVENT_ALBUM, eventId: undefined, event: null }
  }

  const existing = await albumByKey(ctx, trimmed)
  if (existing !== null && existing.eventId !== undefined) {
    return { albumKey: trimmed, eventId: trimmed, event: null }
  }

  return { albumKey: WITHOUT_EVENT_ALBUM, eventId: undefined, event: null }
}

function trimmedOrUndefined(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function displayName(fullName: string | undefined) {
  const trimmed = fullName?.trim()
  return trimmed ? trimmed : 'Unavngivet medlem'
}

function newFileToken() {
  return crypto.randomUUID().replaceAll('-', '')
}

export function photoFileUrl(token: string | undefined): string | null {
  if (!token) return null
  const site = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env?.CONVEX_SITE_URL
  if (!site) return null
  const base = site.replace(/\/+$/, '')
  return `${base}/photo?token=${encodeURIComponent(token)}`
}

export function videoFileUrl(token: string | undefined): string | null {
  if (!token) return null
  const site = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env?.CONVEX_SITE_URL
  if (!site) return null
  const base = site.replace(/\/+$/, '')
  return `${base}/video?token=${encodeURIComponent(token)}`
}

function photoMediaKind(
  photo: Pick<Doc<'photos'>, 'mediaKind'>,
): 'image' | 'video' {
  return photo.mediaKind === 'video' ? 'video' : 'image'
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
  _ctx: QueryCtx | MutationCtx,
  photo: Doc<'photos'>,
  viewer: Doc<'profiles'>,
) {
  const canManage = viewer.isAdmin || photo.uploaderId === viewer._id
  const mediaKind = photoMediaKind(photo)
  return {
    id: photo._id,
    mediaKind,
    mimeType: photo.mimeType ?? null,
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
    // Slette- og redigeringstilladelsen afgøres her og ikke i klienten: reglen
    // er ejer eller admin, og klienten skal ikke selv gætte den. Mutationerne
    // kontrollerer den igen -- disse kopier er kun til at vise knapperne.
    canDelete: canManage,
    canEdit: canManage,
    isUploader: photo.uploaderId === viewer._id,
    displayUrl:
      mediaKind === 'video'
        ? videoFileUrl(photo.displayToken)
        : photoFileUrl(photo.displayToken),
    thumbnailUrl:
      mediaKind === 'video'
        ? photo.thumbnailStorageId !== undefined
          ? photoFileUrl(photo.thumbnailToken)
          : null
        : photoFileUrl(photo.thumbnailToken ?? photo.displayToken),
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

    // Tomme album (0 billeder) skjules på forsiden ligesom V1's GROUP BY over `photos`.
    const albums = (await ctx.db.query('photoAlbums').collect()).filter(
      (album) => album.photoCount > 0,
    )
    const views = await Promise.all(
      albums.map(async (album) => {
        const cover = album.coverPhotoId
          ? await ctx.db.get(album.coverPhotoId)
          : null
        const coverIsVideo = cover?.mediaKind === 'video'
        const coverUrl = coverIsVideo
          ? cover?.thumbnailStorageId !== undefined
            ? photoFileUrl(cover.thumbnailToken)
            : null
          : photoFileUrl(cover?.thumbnailToken ?? cover?.displayToken)
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
          coverUrl,
          coverIsVideo,
        }
      }),
    )

    const withEvent = views
      .filter((album) => album.eventId !== null)
      .sort(
        (left, right) => (right.latestPhotoAt ?? 0) - (left.latestPhotoAt ?? 0),
      )
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
    photoId?: Id<'photos'>
    albumKey: string
    eventId: string | undefined
    eventTitle: string | undefined
    createdAt: number
    ready?: boolean
    thumbnailStorageId?: Id<'_storage'>
    optimizedStorageId?: Id<'_storage'>
  },
) {
  const canBeCover = photo.ready === true && photo.photoId !== undefined
  const album = await albumByKey(ctx, photo.albumKey)
  if (album === null) {
    await ctx.db.insert('photoAlbums', {
      albumKey: photo.albumKey,
      eventId: photo.eventId,
      title: photo.eventTitle,
      photoCount: 1,
      latestPhotoAt: photo.createdAt,
      ...(canBeCover
        ? {
            coverPhotoId: photo.photoId,
            coverThumbnailStorageId: photo.thumbnailStorageId,
            coverOptimizedStorageId: photo.optimizedStorageId,
            coverCreatedAt: photo.createdAt,
          }
        : {}),
    })
    return
  }

  let shouldUpdateCover = false
  if (canBeCover) {
    if (album.coverPhotoId === undefined) {
      shouldUpdateCover = true
    } else {
      // V1-migrerede album fra `migrateV1.ts` kan have `coverPhotoId` uden `coverCreatedAt`.
      const existingCoverCreatedAt =
        album.coverCreatedAt ??
        (await ctx.db.get(album.coverPhotoId))?.createdAt
      shouldUpdateCover =
        existingCoverCreatedAt === undefined ||
        existingCoverCreatedAt <= photo.createdAt
    }
  }

  await ctx.db.patch(album._id, {
    photoCount: album.photoCount + 1,
    latestPhotoAt: Math.max(album.latestPhotoAt ?? 0, photo.createdAt),
    // Titlen kommer fra begivenhedens egen række, så den må gerne vinde over
    // den, albummet har: er turen omdøbt, følger albummet med ved næste
    // upload. Tidligere kunne den ikke det, fordi titlen var klientens ord --
    // dengang var "en senere upload må ikke omdøbe albummet" det rigtige
    // værn. Er der ingen begivenhed at læse den af, bliver titlen stående.
    title: photo.eventTitle ?? album.title,
    eventId: album.eventId ?? photo.eventId,
    ...(shouldUpdateCover
      ? {
          coverPhotoId: photo.photoId,
          coverThumbnailStorageId: photo.thumbnailStorageId,
          coverOptimizedStorageId: photo.optimizedStorageId,
          coverCreatedAt: photo.createdAt,
        }
      : {}),
  })
}

/**
 * Opdaterer albumtæller, `latestPhotoAt` og cover, når et billede fjernes fra
 * et album (flytning, sletning eller kontosletning i `convex/account.ts`).
 */
export async function removePhotoFromAlbum(
  ctx: MutationCtx,
  photo: Pick<Doc<'photos'>, '_id' | 'albumKey' | 'createdAt'>,
) {
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
  const nextCover =
    coverBelongsToPhoto && photoCount > 0
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

  const latestNeedsRefresh =
    photoCount === 0 ||
    album.latestPhotoAt === undefined ||
    album.latestPhotoAt <= photo.createdAt
  const nextLatest =
    photoCount > 0 && latestNeedsRefresh
      ? await ctx.db
          .query('photos')
          .withIndex('by_album', (q) => q.eq('albumKey', photo.albumKey))
          .order('desc')
          .filter((q) => q.neq(q.field('_id'), photo._id))
          .first()
      : null

  await ctx.db.patch(album._id, {
    photoCount,
    latestPhotoAt:
      photoCount === 0
        ? undefined
        : latestNeedsRefresh
          ? nextLatest?.createdAt
          : album.latestPhotoAt,
    coverPhotoId: coverBelongsToPhoto ? nextCover?._id : album.coverPhotoId,
    coverThumbnailStorageId: coverBelongsToPhoto
      ? nextCover?.thumbnailStorageId
      : album.coverThumbnailStorageId,
    coverOptimizedStorageId: coverBelongsToPhoto
      ? nextCover?.optimizedStorageId
      : album.coverOptimizedStorageId,
    coverCreatedAt: coverBelongsToPhoto
      ? nextCover?.createdAt
      : album.coverCreatedAt,
  })
}

type AlbumTarget = Awaited<ReturnType<typeof albumTargetFor>>

async function movePhotoToAlbumTarget(
  ctx: MutationCtx,
  photo: Doc<'photos'>,
  target: AlbumTarget,
  extraPatch?: { caption?: string | undefined },
) {
  if (target.albumKey === photo.albumKey) {
    if (extraPatch !== undefined) {
      await ctx.db.patch(photo._id, extraPatch)
    }
    return false
  }

  // Opdater billedet før albummerne, så `by_album`-opslag i
  // `removePhotoFromAlbum` straks ser den nye tilhørighed.
  await ctx.db.patch(photo._id, {
    albumKey: target.albumKey,
    eventId: target.eventId,
    ...extraPatch,
  })
  await removePhotoFromAlbum(ctx, photo)
  await addPhotoToAlbum(ctx, {
    photoId: photo._id,
    albumKey: target.albumKey,
    eventId: target.eventId,
    eventTitle: target.event?.title,
    createdAt: photo.createdAt,
    ready: photo.optimizationStatus === 'ready',
    thumbnailStorageId: photo.thumbnailStorageId,
    optimizedStorageId: photo.optimizedStorageId,
  })
  return true
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
 * billedteksten opdateres. Begivenheden gør *ikke* -- et genforsøg sender
 * samme kø-post og dermed samme begivenhed, og et skifte her ville flytte
 * billedet uden at rette albummenes tællere.
 */
export const createPhoto = mutation({
  args: {
    storageId: v.id('_storage'),
    clientUploadId: v.optional(v.string()),
    caption: v.optional(v.string()),
    eventId: v.optional(v.string()),
    /**
     * Ignoreret. Albummets titel læses af begivenheden, så et album ikke kan
     * få et navn, ingen begivenhed har. Feltet bliver stadig accepteret, fordi
     * Convex afviser ukendte argumenter: en gammel, cachet frontend i en åben
     * fane sender det stadig, og dens uploads skal ikke fejle af det.
     */
    eventTitle: v.optional(v.string()),
    /**
     * Miniaturen, skaleret i browseren. Når den er med, er billedet klar med
     * det samme: serveren skalerer ikke selv.
     */
    thumbnailStorageId: v.optional(v.id('_storage')),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)

    const metadata = await ctx.db.system.get(args.storageId)
    if (metadata === null) {
      throw new ConvexError('PHOTO_UPLOAD_NOT_FOUND')
    }
    if (!(metadata.contentType ?? '').startsWith('image/')) {
      await ctx.storage.delete(args.storageId)
      throw new ConvexError('PHOTO_NOT_AN_IMAGE')
    }
    if (metadata.size > MAX_FILE_SIZE) {
      await ctx.storage.delete(args.storageId)
      throw new ConvexError('PHOTO_TOO_LARGE')
    }

    const caption = trimmedOrUndefined(args.caption)
    if (caption !== undefined && caption.length > MAX_CAPTION_LENGTH) {
      await ctx.storage.delete(args.storageId)
      throw new ConvexError('PHOTO_CAPTION_TOO_LONG')
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

    // Albummet afgøres på serveren, så titlen kommer fra begivenheden og ikke
    // fra klientens ord -- se `albumTargetFor` for de tre udfald.
    const target = await albumTargetFor(ctx, args.eventId)
    const eventId = target.eventId
    const now = Date.now()
    const thumbnailStorageId = args.thumbnailStorageId
    if (thumbnailStorageId !== undefined) {
      const thumb = await ctx.db.system.get(thumbnailStorageId)
      if (
        thumb === null ||
        !(thumb.contentType ?? '').startsWith('image/') ||
        thumb.size > MAX_FILE_SIZE
      ) {
        await ctx.storage.delete(args.storageId)
        if (thumb !== null) await ctx.storage.delete(thumbnailStorageId)
        throw new ConvexError(
          thumb === null
            ? 'PHOTO_UPLOAD_NOT_FOUND'
            : !(thumb.contentType ?? '').startsWith('image/')
              ? 'PHOTO_NOT_AN_IMAGE'
              : 'PHOTO_TOO_LARGE',
        )
      }
    }

    const ready = thumbnailStorageId !== undefined
    const albumKey = target.albumKey
    const photoId = await ctx.db.insert('photos', {
      storageId: args.storageId,
      optimizedStorageId: ready ? args.storageId : undefined,
      thumbnailStorageId,
      width: args.width,
      height: args.height,
      caption,
      albumKey,
      eventId,
      uploaderId: profile._id,
      clientUploadId,
      createdAt: now,
      optimizationStatus: ready ? 'ready' : 'pending',
      optimizationAttempts: 0,
      optimizationCompletedAt: ready ? now : undefined,
      commentCount: 0,
      displayToken: newFileToken(),
      thumbnailToken: newFileToken(),
    })

    await addPhotoToAlbum(ctx, {
      photoId,
      albumKey,
      eventId,
      eventTitle: target.event?.title,
      createdAt: now,
      ready,
      thumbnailStorageId,
      optimizedStorageId: ready ? args.storageId : undefined,
    })

    return photoId
  },
})

async function isStorageOwned(
  ctx: MutationCtx,
  storageId: Id<'_storage'>,
): Promise<boolean> {
  const byPhoto = await ctx.db
    .query('photos')
    .withIndex('by_storage_id', (q) => q.eq('storageId', storageId))
    .first()
  if (byPhoto !== null) return true
  const byThumb = await ctx.db
    .query('photos')
    .withIndex('by_thumbnail_storage_id', (q) =>
      q.eq('thumbnailStorageId', storageId),
    )
    .first()
  if (byThumb !== null) return true
  const byAudio = await ctx.db
    .query('audioClips')
    .withIndex('by_storage_id', (q) => q.eq('storageId', storageId))
    .first()
  return byAudio !== null
}

async function deleteUnownedStorage(
  ctx: MutationCtx,
  ids: Array<Id<'_storage'> | undefined>,
) {
  const seen = new Set<Id<'_storage'>>()
  for (const id of ids) {
    if (id === undefined || seen.has(id)) continue
    seen.add(id)
    if (await isStorageOwned(ctx, id)) continue
    const meta = await ctx.db.system.get(id)
    if (meta !== null) {
      await ctx.storage.delete(id)
    }
  }
}

/**
 * Registrerer en uploadet video i galleriet.
 *
 * En kastet fejl i en Convex-mutation ruller også `ctx.storage.delete`
 * tilbage. Derfor returneres valideringsfejl som `{ ok: false, error }`, så
 * afviste videoer og overskydende filer faktisk slettes fra fillageret.
 * Autorisationsfejl kaster stadig `ConvexError` via `requireWritableProfile`.
 */
export const createVideo = mutation({
  args: {
    storageId: v.id('_storage'),
    thumbnailStorageId: v.optional(v.id('_storage')),
    clientUploadId: v.optional(v.string()),
    caption: v.optional(v.string()),
    eventId: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    { ok: true; id: Id<'photos'> } | { ok: false; error: CreateVideoError }
  > => {
    const profile = await requireWritableProfile(ctx)

    // Beskyt eksisterende filer mod sletning eller kapring.
    const existingByStorage = await ctx.db
      .query('photos')
      .withIndex('by_storage_id', (q) => q.eq('storageId', args.storageId))
      .first()
    if (existingByStorage !== null) {
      if (
        existingByStorage.uploaderId === profile._id &&
        existingByStorage.mediaKind === 'video'
      ) {
        if (
          args.thumbnailStorageId !== undefined &&
          args.thumbnailStorageId !== existingByStorage.thumbnailStorageId
        ) {
          await deleteUnownedStorage(ctx, [args.thumbnailStorageId])
        }
        return { ok: true, id: existingByStorage._id }
      }
      await deleteUnownedStorage(ctx, [args.thumbnailStorageId])
      return { ok: false, error: 'VIDEO_UPLOAD_NOT_FOUND' }
    }

    if (await isStorageOwned(ctx, args.storageId)) {
      await deleteUnownedStorage(ctx, [args.thumbnailStorageId])
      return { ok: false, error: 'VIDEO_UPLOAD_NOT_FOUND' }
    }

    if (
      args.thumbnailStorageId !== undefined &&
      (args.thumbnailStorageId === args.storageId ||
        (await isStorageOwned(ctx, args.thumbnailStorageId)))
    ) {
      await deleteUnownedStorage(ctx, [args.storageId])
      return { ok: false, error: 'VIDEO_THUMBNAIL_INVALID' }
    }

    const metadata = await ctx.db.system.get(args.storageId)
    if (metadata === null) {
      await deleteUnownedStorage(ctx, [args.thumbnailStorageId])
      return { ok: false, error: 'VIDEO_UPLOAD_NOT_FOUND' }
    }

    const mime = normalizeVideoMime(metadata.contentType)
    if (mime === null) {
      await deleteUnownedStorage(ctx, [args.storageId, args.thumbnailStorageId])
      return { ok: false, error: 'VIDEO_UNSUPPORTED_TYPE' }
    }

    if (metadata.size <= 0) {
      await deleteUnownedStorage(ctx, [args.storageId, args.thumbnailStorageId])
      return { ok: false, error: 'VIDEO_EMPTY' }
    }

    if (metadata.size > MAX_VIDEO_BYTES) {
      await deleteUnownedStorage(ctx, [args.storageId, args.thumbnailStorageId])
      return { ok: false, error: 'VIDEO_TOO_LARGE' }
    }

    const caption = trimmedOrUndefined(args.caption)
    if (caption !== undefined && caption.length > MAX_CAPTION_LENGTH) {
      await deleteUnownedStorage(ctx, [args.storageId, args.thumbnailStorageId])
      return { ok: false, error: 'PHOTO_CAPTION_TOO_LONG' }
    }

    const thumbnailStorageId = args.thumbnailStorageId
    if (thumbnailStorageId !== undefined) {
      const thumbMeta = await ctx.db.system.get(thumbnailStorageId)
      if (
        thumbMeta === null ||
        !(thumbMeta.contentType ?? '').startsWith('image/') ||
        thumbMeta.size <= 0
      ) {
        await deleteUnownedStorage(ctx, [args.storageId, thumbnailStorageId])
        return { ok: false, error: 'VIDEO_THUMBNAIL_INVALID' }
      }
      if (thumbMeta.size > MAX_FILE_SIZE) {
        await deleteUnownedStorage(ctx, [args.storageId, thumbnailStorageId])
        return { ok: false, error: 'VIDEO_THUMBNAIL_TOO_LARGE' }
      }
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
        await deleteUnownedStorage(ctx, [
          existing.storageId !== args.storageId ? args.storageId : undefined,
          existing.thumbnailStorageId !== thumbnailStorageId
            ? thumbnailStorageId
            : undefined,
        ])
        await ctx.db.patch(existing._id, { caption })
        return { ok: true, id: existing._id }
      }
    }

    const target = await albumTargetFor(ctx, args.eventId)
    const eventId = target.eventId
    const now = Date.now()
    const albumKey = target.albumKey

    const photoId = await ctx.db.insert('photos', {
      storageId: args.storageId,
      thumbnailStorageId,
      mediaKind: 'video',
      mimeType: mime,
      sizeBytes: metadata.size,
      width: args.width,
      height: args.height,
      caption,
      albumKey,
      eventId,
      uploaderId: profile._id,
      clientUploadId,
      createdAt: now,
      optimizationStatus: 'ready',
      optimizationAttempts: 0,
      optimizationCompletedAt: now,
      commentCount: 0,
      displayToken: newFileToken(),
      ...(thumbnailStorageId !== undefined
        ? { thumbnailToken: newFileToken() }
        : {}),
    })

    await addPhotoToAlbum(ctx, {
      photoId,
      albumKey,
      eventId,
      eventTitle: target.event?.title,
      createdAt: now,
      ready: true,
      thumbnailStorageId,
      optimizedStorageId: undefined,
    })

    return { ok: true, id: photoId }
  },
})

/**
 * Retter billedtekst og/eller knytter et billede til en anden begivenhed.
 * Ejeren selv eller en admin må rette.
 */
export const updatePhoto = mutation({
  args: {
    photoId: v.id('photos'),
    caption: v.optional(v.union(v.string(), v.null())),
    eventId: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)

    const photo = await ctx.db.get(args.photoId)
    if (photo === null) {
      throw new ConvexError('PHOTO_NOT_FOUND')
    }
    if (photo.uploaderId !== profile._id && !profile.isAdmin) {
      throw new ConvexError('NOT_PHOTO_OWNER')
    }

    let nextCaption = photo.caption
    const hasCaptionUpdate = args.caption !== undefined
    if (args.caption !== undefined) {
      nextCaption =
        args.caption === null ? undefined : trimmedOrUndefined(args.caption)
      if (
        nextCaption !== undefined &&
        nextCaption.length > MAX_CAPTION_LENGTH
      ) {
        throw new ConvexError('PHOTO_CAPTION_TOO_LONG')
      }
    }

    const extraPatch = hasCaptionUpdate ? { caption: nextCaption } : undefined
    let finalAlbumKey = photo.albumKey
    let finalEventId = photo.eventId

    if (args.eventId !== undefined) {
      const requestedEventId =
        args.eventId === null ? undefined : trimmedOrUndefined(args.eventId)
      if (requestedEventId !== photo.eventId) {
        const target = await albumTargetFor(ctx, requestedEventId)
        if (requestedEventId !== undefined && target.eventId === undefined) {
          throw new ConvexError('PHOTO_EVENT_NOT_FOUND')
        }
        await movePhotoToAlbumTarget(ctx, photo, target, extraPatch)
        finalAlbumKey = target.albumKey
        finalEventId = target.eventId
      } else if (extraPatch !== undefined) {
        await ctx.db.patch(photo._id, extraPatch)
      }
    } else if (extraPatch !== undefined) {
      await ctx.db.patch(photo._id, extraPatch)
    }

    return {
      id: photo._id,
      caption: nextCaption ?? null,
      albumKey: finalAlbumKey,
      eventId: finalEventId ?? null,
    }
  },
})

/**
 * Flytter flere billeder til én begivenhed (eller til "Uden begivenhed" med
 * `eventId: null`) i én atomisk mutation. Kun uploaderen eller en admin.
 */
export const movePhotos = mutation({
  args: {
    photoIds: v.array(v.id('photos')),
    eventId: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)

    const uniqueIds = [...new Set(args.photoIds)]
    if (uniqueIds.length > MAX_BULK_MOVE) {
      throw new ConvexError('TOO_MANY_PHOTOS')
    }

    const requestedEventId =
      args.eventId === null ? undefined : trimmedOrUndefined(args.eventId)
    const target = await albumTargetFor(ctx, requestedEventId)
    if (requestedEventId !== undefined && target.eventId === undefined) {
      throw new ConvexError('PHOTO_EVENT_NOT_FOUND')
    }

    const photos: Doc<'photos'>[] = []
    for (const photoId of uniqueIds) {
      const photo = await ctx.db.get(photoId)
      if (photo === null) {
        throw new ConvexError('PHOTO_NOT_FOUND')
      }
      if (photo.uploaderId !== profile._id && !profile.isAdmin) {
        throw new ConvexError('NOT_PHOTO_OWNER')
      }
      photos.push(photo)
    }

    let movedCount = 0
    for (const photo of photos) {
      const moved = await movePhotoToAlbumTarget(ctx, photo, target)
      if (moved) movedCount += 1
    }

    return {
      movedCount,
      albumKey: target.albumKey,
      eventId: target.eventId ?? null,
    }
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
      throw new ConvexError('PHOTO_NOT_FOUND')
    }

    const isOwner = photo.uploaderId === profile._id
    if (!isOwner && !profile.isAdmin) {
      throw new ConvexError('PHOTO_DELETE_NOT_AUTHORIZED')
    }

    const now = Date.now()
    if (
      photo.optimizationStatus === 'processing' &&
      !isStaleProcessing(photo, now)
    ) {
      throw new ConvexError('PHOTO_BUSY')
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
      throw new ConvexError('PHOTO_COMMENT_INVALID_BODY')
    }

    const photo = await ctx.db.get(args.photoId)
    if (photo === null) {
      throw new ConvexError('PHOTO_NOT_FOUND')
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
      throw new ConvexError('PHOTO_COMMENT_NOT_FOUND')
    }
    if (comment.authorId !== profile._id && !profile.isAdmin) {
      throw new ConvexError('PHOTO_COMMENT_DELETE_NOT_AUTHORIZED')
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
type OptimizationClaim =
  | { status: 'not_found' }
  | { status: 'busy' }
  | { status: 'ready' }
  | { status: 'claimed'; storageId: Id<'_storage'>; attempt: number }

export const claimOptimization = internalMutation({
  args: { photoId: v.id('photos') },
  handler: async (ctx, args): Promise<OptimizationClaim> => {
    const profile = await requireWritableProfile(ctx)

    const photo = await ctx.db.get(args.photoId)
    if (photo === null || photo.uploaderId !== profile._id) {
      // Som i den gamle app: kun uploaderen selv må optimere sit billede.
      return { status: 'not_found' as const }
    }

    const now = Date.now()
    if (
      photo.optimizationStatus === 'processing' &&
      !isStaleProcessing(photo, now)
    ) {
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
      throw new ConvexError('PHOTO_NOT_FOUND')
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
        optimizationError: (
          args.error ?? 'Billedet kunne ikke optimeres.'
        ).slice(0, MAX_OPTIMIZATION_ERROR_LENGTH),
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
      (album.coverCreatedAt === undefined ||
        album.coverCreatedAt <= photo.createdAt)
    ) {
      await ctx.db.patch(album._id, {
        coverPhotoId: photo._id,
        coverThumbnailStorageId:
          args.thumbnailStorageId ?? photo.thumbnailStorageId,
        coverOptimizedStorageId:
          args.optimizedStorageId ?? photo.optimizedStorageId,
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
  handler: async (
    ctx,
    args,
  ): Promise<'not_found' | 'busy' | 'ready' | 'failed'> => {
    // En action har ikke `ctx.db`. Medlemskabet kontrolleres derfor i de
    // interne mutationer herunder, som begge kalder `requireWritableProfile` --
    // en action uden det kald ville være offentlig, ligesom en query.
    // Returtypen står eksplicit, fordi kaldet går til en funktion i samme fil
    // og ellers bliver cirkulær for TypeScript.
    const claim: OptimizationClaim = await ctx.runMutation(
      internal.gallery.claimOptimization,
      { photoId: args.photoId },
    )
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
      console.error('Photo optimization failed', {
        photoId: args.photoId,
        error,
      })
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

/** Giver ældre billeder et token, så de kan vises gennem HTTP-handlingen. */
export const mintPhotoTokens = mutation({
  args: {},
  handler: async (ctx) => {
    await requireProfile(ctx)
    const photos = await ctx.db.query('photos').take(200)
    let minted = 0
    for (const photo of photos) {
      const needsThumbnailToken =
        photo.mediaKind !== 'video' || photo.thumbnailStorageId !== undefined
      if (
        photo.displayToken &&
        (!needsThumbnailToken || photo.thumbnailToken)
      ) {
        continue
      }
      await ctx.db.patch(photo._id, {
        displayToken: photo.displayToken ?? newFileToken(),
        ...(needsThumbnailToken
          ? { thumbnailToken: photo.thumbnailToken ?? newFileToken() }
          : {}),
      })
      minted += 1
    }
    return { minted }
  },
})

/** Nyt token. Det gamle link virker ikke mere. Filen bliver. */
export const revokePhotoLink = mutation({
  args: { photoId: v.id('photos') },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx)
    const photo = await ctx.db.get(args.photoId)
    if (photo === null) throw new ConvexError('PHOTO_NOT_FOUND')
    if (!profile.isAdmin && photo.uploaderId !== profile._id) {
      throw new ConvexError('PHOTO_NOT_ALLOWED')
    }
    const needsThumbnailToken =
      photo.mediaKind !== 'video' || photo.thumbnailStorageId !== undefined
    await ctx.db.patch(photo._id, {
      displayToken: newFileToken(),
      ...(needsThumbnailToken ? { thumbnailToken: newFileToken() } : {}),
    })
    return null
  },
})

export const servePhoto = httpAction(async (ctx, request) => {
  const token = new URL(request.url).searchParams.get('token')
  if (!token) return new Response('Mangler token', { status: 400 })
  const byDisplay = await ctx.runQuery(internal.gallery.photoForToken, {
    token,
    kind: 'display',
  })
  const match =
    byDisplay ??
    (await ctx.runQuery(internal.gallery.photoForToken, {
      token,
      kind: 'thumbnail',
    }))
  if (match === null)
    return new Response('Linket virker ikke længere', { status: 404 })
  const file = await ctx.storage.get(match.storageId)
  if (file === null) return new Response('Filen findes ikke', { status: 404 })
  return new Response(file, {
    headers: {
      'Content-Type': match.contentType,
      'Cache-Control': 'private, max-age=3600',
    },
  })
})

export const photoForToken = internalQuery({
  args: {
    token: v.string(),
    kind: v.union(v.literal('display'), v.literal('thumbnail')),
  },
  handler: async (ctx, args) => {
    const photo =
      args.kind === 'display'
        ? await ctx.db
            .query('photos')
            .withIndex('by_display_token', (q) =>
              q.eq('displayToken', args.token),
            )
            .unique()
        : await ctx.db
            .query('photos')
            .withIndex('by_thumbnail_token', (q) =>
              q.eq('thumbnailToken', args.token),
            )
            .unique()
    if (photo === null) return null
    if (photo.mediaKind === 'video') {
      if (args.kind === 'display' || photo.thumbnailStorageId === undefined) {
        return null
      }
      const meta = await ctx.db.system.get(photo.thumbnailStorageId)
      if (meta === null) return null
      return {
        storageId: photo.thumbnailStorageId,
        contentType: meta.contentType ?? 'image/jpeg',
      }
    }
    const storageId =
      args.kind === 'display'
        ? (photo.optimizedStorageId ??
          photo.thumbnailStorageId ??
          photo.storageId)
        : (photo.thumbnailStorageId ??
          photo.optimizedStorageId ??
          photo.storageId)
    const meta = await ctx.db.system.get(storageId)
    return {
      storageId,
      contentType: meta?.contentType ?? 'application/octet-stream',
    }
  },
})

export const videoForToken = internalQuery({
  args: { token: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{
    storageId: Id<'_storage'>
    contentType: string
    sizeBytes: number
  } | null> => {
    const photo = await ctx.db
      .query('photos')
      .withIndex('by_display_token', (q) => q.eq('displayToken', args.token))
      .unique()
    if (photo === null || photo.mediaKind !== 'video') return null
    const meta = await ctx.db.system.get(photo.storageId)
    if (meta === null) return null
    const contentType =
      normalizeVideoMime(photo.mimeType ?? meta.contentType) ?? 'video/mp4'
    return {
      storageId: photo.storageId,
      contentType,
      sizeBytes: meta.size,
    }
  },
})

/**
 * Skærer et byteinterval `[start, end]` ud af en `ReadableStream` uden `.tee()`,
 * så kasserede prefix-bytes frigives med det samme i stedet for at samle sig i
 * V8-isolatets 64 MiB hukommelse. Stopper læsningen straks efter `end`.
 */
export function sliceReadableStream(
  stream: ReadableStream<Uint8Array>,
  start: number,
  end: number,
): ReadableStream<Uint8Array> {
  const reader = stream.getReader()
  let offset = 0

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (true) {
        const { value, done } = await reader.read()
        if (done) {
          controller.close()
          return
        }
        const chunkStart = offset
        const chunkEnd = offset + value.byteLength - 1
        offset += value.byteLength

        if (chunkEnd < start) {
          continue
        }
        if (chunkStart > end) {
          await reader.cancel()
          controller.close()
          return
        }

        const sliceStart = Math.max(0, start - chunkStart)
        const sliceEnd = Math.min(value.byteLength, end - chunkStart + 1)
        const chunk =
          sliceStart === 0 && sliceEnd === value.byteLength
            ? value
            : value.slice(sliceStart, sliceEnd)

        if (chunk.byteLength > 0) {
          controller.enqueue(chunk)
        }

        if (chunkEnd >= end) {
          await reader.cancel()
          controller.close()
          return
        }
        if (chunk.byteLength > 0) {
          return
        }
      }
    },
    async cancel(reason) {
      await reader.cancel(reason)
    },
  })
}

export const serveVideo = httpAction(async (ctx, request) => {
  const token = new URL(request.url).searchParams.get('token')
  if (!token) {
    return new Response('Mangler token', { status: 400 })
  }

  const match = await ctx.runQuery(internal.gallery.videoForToken, { token })
  if (match === null) {
    return new Response('Linket virker ikke længere', { status: 404 })
  }

  const totalSize = match.sizeBytes
  const baseHeaders: Record<string, string> = {
    'Content-Type': match.contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  }

  const range = parseByteRange(request.headers.get('range'), totalSize)
  if (range.kind === 'invalid') {
    return new Response(
      request.method === 'HEAD' ? null : 'Ugyldigt byteinterval',
      {
        status: 416,
        headers: {
          'Content-Range': `bytes */${totalSize}`,
          'Accept-Ranges': 'bytes',
          'X-Content-Type-Options': 'nosniff',
        },
      },
    )
  }

  if (request.method === 'HEAD') {
    if (range.kind === 'range') {
      const chunkLength = range.end - range.start + 1
      return new Response(null, {
        status: 206,
        headers: {
          ...baseHeaders,
          'Content-Range': `bytes ${range.start}-${range.end}/${totalSize}`,
          'Content-Length': String(chunkLength),
        },
      })
    }
    return new Response(null, {
      status: 200,
      headers: {
        ...baseHeaders,
        'Content-Length': String(totalSize),
      },
    })
  }

  const upstreamUrl = await ctx.storage.getUrl(match.storageId)
  if (upstreamUrl === null) {
    return new Response('Filen findes ikke', { status: 404 })
  }

  let upstream: Response
  try {
    upstream =
      range.kind === 'range'
        ? await fetch(upstreamUrl, {
            headers: { Range: `bytes=${range.start}-${range.end}` },
          })
        : await fetch(upstreamUrl)
  } catch {
    return new Response('Videoen kunne ikke hentes', { status: 502 })
  }

  if (upstream.status === 404) {
    await upstream.body?.cancel()
    return new Response('Filen findes ikke', { status: 404 })
  }

  if (upstream.status === 416) {
    await upstream.body?.cancel()
    return new Response('Ugyldigt byteinterval', {
      status: 416,
      headers: {
        'Content-Range': `bytes */${totalSize}`,
        'Accept-Ranges': 'bytes',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }

  if (!upstream.ok || upstream.body === null) {
    await upstream.body?.cancel()
    return new Response('Videoen kunne ikke hentes', { status: 502 })
  }

  if (range.kind === 'range') {
    const requestedLength = range.end - range.start + 1
    if (upstream.status === 206) {
      const contentRange =
        upstream.headers.get('content-range') ??
        `bytes ${range.start}-${range.end}/${totalSize}`
      const contentLength =
        upstream.headers.get('content-length') ?? String(requestedLength)
      return new Response(upstream.body, {
        status: 206,
        headers: {
          ...baseHeaders,
          'Content-Range': contentRange,
          'Content-Length': contentLength,
        },
      })
    }

    const sliced = sliceReadableStream(upstream.body, range.start, range.end)
    return new Response(sliced, {
      status: 206,
      headers: {
        ...baseHeaders,
        'Content-Range': `bytes ${range.start}-${range.end}/${totalSize}`,
        'Content-Length': String(requestedLength),
      },
    })
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...baseHeaders,
      'Content-Length': String(totalSize),
    },
  })
})
