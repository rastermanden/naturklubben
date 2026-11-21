import { ConvexError, v } from 'convex/values'
import { httpAction, internalQuery, mutation, query } from './_generated/server'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { requireProfile, requireWritableProfile } from './authz'

/**
 * Lydfiler: upload, liste, afspilning gennem token-HTTP-handling og sletning.
 *
 * Sikkerhedsmodellen følger galleriet (`convex/gallery.ts`):
 * - Kun medlemmer (`requireProfile`) må hente listen og dermed afspilnings-URL'er.
 * - Kun skrivbare medlemmer (`requireWritableProfile`) må uploade og slette.
 * - Klienten får aldrig et råt `storageId` eller `ctx.storage.getUrl`.
 * - Afspilningen går gennem `GET /audio?token=...`, som understøtter
 *   `Range`-forespørgsler (`206 Partial Content`), så HTML5 `<audio>` kan
 *   afspille og spole på mobil (bl.a. iOS Safari).
 */

/** Samme filstørrelsesloft som billeder i galleriet: 15 MB. */
export const MAX_AUDIO_BYTES = 15 * 1024 * 1024

export const MAX_AUDIO_TITLE_LENGTH = 120

const ALLOWED_AUDIO_MIME_TYPES = new Set(['audio/mpeg', 'audio/mp3'])

const MAX_LIST_ITEMS = 200

export type CreateAudioError =
  | 'AUDIO_UPLOAD_NOT_FOUND'
  | 'AUDIO_NOT_MP3'
  | 'AUDIO_EMPTY'
  | 'AUDIO_TOO_LARGE'
  | 'AUDIO_TITLE_REQUIRED'
  | 'AUDIO_TITLE_TOO_LONG'

export function normalizeAudioMime(
  contentType: string | undefined,
): string | null {
  if (!contentType) return null
  const base = contentType.split(';', 1)[0]?.trim().toLowerCase() ?? ''
  return ALLOWED_AUDIO_MIME_TYPES.has(base) ? base : null
}

function newFileToken(): string {
  return crypto.randomUUID().replaceAll('-', '')
}

function displayName(fullName: string | undefined): string {
  const trimmed = fullName?.trim()
  return trimmed ? trimmed : 'Unavngivet medlem'
}

export function audioFileUrl(token: string | undefined): string | null {
  if (!token) return null
  const site = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env?.CONVEX_SITE_URL
  if (!site) return null
  const base = site.replace(/\/+$/, '')
  return `${base}/audio?token=${encodeURIComponent(token)}`
}

export type ByteRangeResult =
  | { kind: 'none' }
  | { kind: 'invalid' }
  | { kind: 'range'; start: number; end: number }

/**
 * Parser en enkelt `Range: bytes=...`-header efter RFC 9110.
 * Understøtter `bytes=start-end`, `bytes=start-` og `bytes=-suffix`.
 */
export function parseByteRange(
  header: string | null,
  totalSize: number,
): ByteRangeResult {
  if (header === null) return { kind: 'none' }
  if (totalSize <= 0) return { kind: 'invalid' }

  const trimmed = header.trim()
  if (!trimmed.toLowerCase().startsWith('bytes=')) {
    return { kind: 'invalid' }
  }
  const spec = trimmed.slice('bytes='.length).trim()
  if (spec.includes(',') || !spec.includes('-')) {
    return { kind: 'invalid' }
  }

  const parts = spec.split('-')
  if (parts.length !== 2) return { kind: 'invalid' }
  const [rawStart, rawEnd] = parts as [string, string]

  if (rawStart === '' && rawEnd === '') {
    return { kind: 'invalid' }
  }

  if (rawStart === '') {
    if (!/^\d+$/.test(rawEnd)) return { kind: 'invalid' }
    const suffixLength = Number(rawEnd)
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return { kind: 'invalid' }
    }
    const start = Math.max(0, totalSize - suffixLength)
    return { kind: 'range', start, end: totalSize - 1 }
  }

  if (!/^\d+$/.test(rawStart)) return { kind: 'invalid' }
  const start = Number(rawStart)
  if (!Number.isSafeInteger(start) || start < 0 || start >= totalSize) {
    return { kind: 'invalid' }
  }

  if (rawEnd === '') {
    return { kind: 'range', start, end: totalSize - 1 }
  }

  if (!/^\d+$/.test(rawEnd)) return { kind: 'invalid' }
  const requestedEnd = Number(rawEnd)
  if (!Number.isSafeInteger(requestedEnd) || requestedEnd < start) {
    return { kind: 'invalid' }
  }

  return {
    kind: 'range',
    start,
    end: Math.min(requestedEnd, totalSize - 1),
  }
}

/**
 * Engangs-upload-URL til Convex fillager. Selve type- og størrelseskontrollen
 * sker i `createClip` ud fra filens server-metadata.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireWritableProfile(ctx)
    return { uploadUrl: await ctx.storage.generateUploadUrl() }
  },
})

/**
 * Registrerer en uploadet mp3-fil.
 *
 * En kastet fejl i en Convex-mutation ruller også `ctx.storage.delete`
 * tilbage. Derfor returneres valideringsfejl som `{ ok: false, error }`, så en
 * afvist fil faktisk bliver slettet fra fillageret. Autorisationsfejl kaster
 * stadig `ConvexError` via `requireWritableProfile`.
 */
export const createClip = mutation({
  args: {
    storageId: v.id('_storage'),
    title: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    { ok: true; id: Id<'audioClips'> } | { ok: false; error: CreateAudioError }
  > => {
    const profile = await requireWritableProfile(ctx)

    // Kontrollér om filen allerede ejes af en række, før noget kan slettes.
    const existing = await ctx.db
      .query('audioClips')
      .withIndex('by_storage_id', (q) => q.eq('storageId', args.storageId))
      .unique()
    if (existing !== null) {
      if (existing.uploaderId === profile._id) {
        return { ok: true, id: existing._id }
      }
      return { ok: false, error: 'AUDIO_UPLOAD_NOT_FOUND' }
    }

    const metadata = await ctx.db.system.get(args.storageId)
    if (metadata === null) {
      return { ok: false, error: 'AUDIO_UPLOAD_NOT_FOUND' }
    }

    const mime = normalizeAudioMime(metadata.contentType)
    if (mime === null) {
      await ctx.storage.delete(args.storageId)
      return { ok: false, error: 'AUDIO_NOT_MP3' }
    }

    if (metadata.size <= 0) {
      await ctx.storage.delete(args.storageId)
      return { ok: false, error: 'AUDIO_EMPTY' }
    }

    if (metadata.size > MAX_AUDIO_BYTES) {
      await ctx.storage.delete(args.storageId)
      return { ok: false, error: 'AUDIO_TOO_LARGE' }
    }

    const title = args.title.trim()
    if (title.length === 0) {
      await ctx.storage.delete(args.storageId)
      return { ok: false, error: 'AUDIO_TITLE_REQUIRED' }
    }

    if (title.length > MAX_AUDIO_TITLE_LENGTH) {
      await ctx.storage.delete(args.storageId)
      return { ok: false, error: 'AUDIO_TITLE_TOO_LONG' }
    }

    const clipId = await ctx.db.insert('audioClips', {
      storageId: args.storageId,
      playToken: newFileToken(),
      title,
      sizeBytes: metadata.size,
      contentType: mime,
      uploaderId: profile._id,
      createdAt: Date.now(),
    })

    return { ok: true, id: clipId }
  },
})

/** Alle klubbens lydfiler, nyeste først. Kræver medlemskab. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireProfile(ctx)

    const clips = await ctx.db
      .query('audioClips')
      .withIndex('by_created')
      .order('desc')
      .take(MAX_LIST_ITEMS)

    const uploaderNames = new Map<Id<'profiles'>, string>()
    const views = []
    for (const clip of clips) {
      let uploaderName = uploaderNames.get(clip.uploaderId)
      if (uploaderName === undefined) {
        const uploader = await ctx.db.get(clip.uploaderId)
        uploaderName =
          uploader === null
            ? 'Tidligere medlem'
            : displayName(uploader.fullName)
        uploaderNames.set(clip.uploaderId, uploaderName)
      }

      views.push({
        id: clip._id,
        title: clip.title,
        sizeBytes: clip.sizeBytes,
        createdAt: clip.createdAt,
        uploaderId: clip.uploaderId,
        uploaderName,
        canDelete: viewer.isAdmin || clip.uploaderId === viewer._id,
        audioUrl: audioFileUrl(clip.playToken),
      })
    }

    return views
  },
})

/**
 * Sletter en lydfil og fjerner selve filen fra Convex fillager.
 * Kun den, der lagde filen op, eller en administrator må slette.
 */
export const deleteClip = mutation({
  args: { clipId: v.id('audioClips') },
  handler: async (ctx, args) => {
    const profile = await requireWritableProfile(ctx)

    const clip = await ctx.db.get(args.clipId)
    if (clip === null) {
      throw new ConvexError('AUDIO_NOT_FOUND')
    }

    if (clip.uploaderId !== profile._id && !profile.isAdmin) {
      throw new ConvexError('AUDIO_DELETE_NOT_AUTHORIZED')
    }

    await ctx.storage.delete(clip.storageId)
    await ctx.db.delete(clip._id)
    return null
  },
})

export const clipForToken = internalQuery({
  args: { token: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{
    storageId: Id<'_storage'>
    contentType: string
    sizeBytes: number
  } | null> => {
    const clip = await ctx.db
      .query('audioClips')
      .withIndex('by_play_token', (q) => q.eq('playToken', args.token))
      .unique()
    if (clip === null) return null
    return {
      storageId: clip.storageId,
      // Standard-MIME for mp3 ved afspilning (bl.a. Safari/iOS).
      contentType: 'audio/mpeg',
      sizeBytes: clip.sizeBytes,
    }
  },
})

export const serveAudio = httpAction(async (ctx, request) => {
  const token = new URL(request.url).searchParams.get('token')
  if (!token) {
    return new Response('Mangler token', { status: 400 })
  }

  const match = await ctx.runQuery(internal.audio.clipForToken, { token })
  if (match === null) {
    return new Response('Linket virker ikke længere', { status: 404 })
  }

  const file = await ctx.storage.get(match.storageId)
  if (file === null) {
    return new Response('Filen findes ikke', { status: 404 })
  }

  const totalSize = file.size
  const baseHeaders: Record<string, string> = {
    'Content-Type': match.contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  }

  const range = parseByteRange(request.headers.get('range'), totalSize)
  if (range.kind === 'invalid') {
    return new Response('Ugyldigt byteinterval', {
      status: 416,
      headers: {
        'Content-Range': `bytes */${totalSize}`,
        'Accept-Ranges': 'bytes',
      },
    })
  }

  if (range.kind === 'range') {
    const chunkLength = range.end - range.start + 1
    const chunk = file.slice(range.start, range.end + 1)
    return new Response(chunk, {
      status: 206,
      headers: {
        ...baseHeaders,
        'Content-Range': `bytes ${range.start}-${range.end}/${totalSize}`,
        'Content-Length': String(chunkLength),
      },
    })
  }

  return new Response(file, {
    status: 200,
    headers: {
      ...baseHeaders,
      'Content-Length': String(totalSize),
    },
  })
})
