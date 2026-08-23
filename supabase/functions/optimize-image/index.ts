// Edge Function: optimize-image
//
// Kaldes fra klienten (src/features/gallery/useUploadPhotos.ts) med et photo-id,
// når originalen og photos-rækken er gemt. Functionen validerer uploaderen,
// claimer arbejdet atomisk og gemmer vedvarende status på photos-rækken.
//
// Bruger `imagescript` -- et rent Deno/WASM-billedbibliotek uden native
// afhængigheder (kører derfor problemfrit i Edge Runtime, i modsætning til
// fx Sharp/libvips). Output er JPEG: deno.land/x's registry for
// imagescript stoppede med at indeksere nye tags efter 1.3.0 (senere
// versioner mangler et Deno-kompatibelt mod.ts-entrypoint i kildekoden),
// og præcis den version har ingen encodeWEBP-implementering -- kun
// encodeJPEG er tilgængelig i den faktisk deploybare version.
//
// Bruger Secret key til at omgå RLS, så den kan skrive optimerede filer
// og opdatere photos-rækken. Kalderen valideres først mod rækkens ejer, og
// profiles.deletion_reserved_at kontrolleres både før og efter det dyre
// billedarbejde. Den dobbelte kontrol forhindrer, at en optimering, der allerede
// kørte, efterlader nye filer efter delete-account har tømt brugerens præfiks.
// Secret key er reserveret og
// auto-injiceres af platformen i alle Edge Functions (kan ikke sættes
// manuelt via `supabase secrets set`, se .github/workflows/deploy-functions.yml)
// -- SUPABASE_SERVICE_ROLE_KEY er det historiske reserverede variabelnavn,
// så vi falder tilbage til det hvis SUPABASE_SECRET_KEY ikke er sat.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors } from '../_shared/cors.ts'
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts'

/**
 * Læser EXIF-orientation-tag fra JPEG-bytes (APP1/Exif-segment).
 * Returnerer 1–8 jf. EXIF-standarden, eller 1 (ingen transformation) ved fejl.
 */
function readExifOrientation(bytes: Uint8Array): number {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    // JPEG starter altid med FF D8
    if (view.getUint16(0) !== 0xffd8) return 1

    let offset = 2
    while (offset + 4 <= bytes.length) {
      const marker = view.getUint16(offset)
      const segmentLength = view.getUint16(offset + 2)
      // APP1-markør (0xFFE1) kan indeholde Exif
      if (marker === 0xffe1) {
        // "Exif\0\0" = 45 78 69 66 00 00
        if (
          offset + 10 <= bytes.length &&
          view.getUint32(offset + 4) === 0x45786966 &&
          view.getUint16(offset + 8) === 0x0000
        ) {
          const tiffOffset = offset + 10
          if (tiffOffset + 8 > bytes.length) return 1
          const littleEndian = view.getUint16(tiffOffset) === 0x4949
          const ifdOffset =
            tiffOffset +
            (littleEndian
              ? view.getUint32(tiffOffset + 4, true)
              : view.getUint32(tiffOffset + 4, false))
          if (ifdOffset + 2 > bytes.length) return 1
          const entryCount = littleEndian
            ? view.getUint16(ifdOffset, true)
            : view.getUint16(ifdOffset, false)
          for (let i = 0; i < entryCount; i++) {
            const entryOffset = ifdOffset + 2 + i * 12
            if (entryOffset + 12 > bytes.length) break
            const tag = littleEndian
              ? view.getUint16(entryOffset, true)
              : view.getUint16(entryOffset, false)
            if (tag === 0x0112) {
              // Orientation
              return littleEndian
                ? view.getUint16(entryOffset + 8, true)
                : view.getUint16(entryOffset + 8, false)
            }
          }
        }
      }
      if (segmentLength < 2) break
      offset += 2 + segmentLength
    }
  } catch {
    // Malformed EXIF — ingen transformation
  }
  return 1
}

/**
 * Anvender EXIF-orientation på et Image-objekt in-place.
 * Orientation 1 = ingen transform; 2–8 = spejl/rotation kombinationer.
 */
function applyOrientation(img: Image, orientation: number) {
  switch (orientation) {
    case 2:
      return img.flip('horizontal')
    case 3:
      return img.rotate(180)
    case 4:
      return img.flip('vertical')
    case 5:
      return img.rotate(270).flip('horizontal')
    case 6:
      return img.rotate(90)
    case 7:
      return img.rotate(90).flip('horizontal')
    case 8:
      return img.rotate(270)
    default:
      return img
  }
}

const WEB_MAX_WIDTH = 1600
const THUMBNAIL_MAX_WIDTH = 400
const WEB_JPEG_QUALITY = 80
const THUMBNAIL_JPEG_QUALITY = 75
interface PhotoState {
  optimized_path: string | null
  thumbnail_path: string | null
  optimization_status:
    'pending' | 'processing' | 'ready' | 'failed' | 'deleting' | 'delete_failed'
  optimization_attempts: number
}

interface ClaimedPhoto {
  claimed_storage_path: string
  claimed_attempt: number
}

interface ClaimedDeletion {
  claimed_storage_path: string
  claimed_optimized_path: string | null
  claimed_thumbnail_path: string | null
  claimed_attempt: number
}

class OptimizationError extends Error {
  constructor(
    message: string,
    readonly publicMessage: string,
  ) {
    super(message)
  }
}

function createJsonResponse(body: unknown, corsHeaders: Headers, status = 200) {
  const headers = new Headers(corsHeaders)
  headers.set('Content-Type', 'application/json')
  return new Response(JSON.stringify(body), {
    status,
    headers,
  })
}

function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    (Deno.env.get('SUPABASE_SECRET_KEY') ??
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    { auth: { persistSession: false } },
  )
}

function bearerToken(req: Request) {
  const header = req.headers.get('Authorization')
  return header?.startsWith('Bearer ') ? header.slice(7) : null
}

function storageParts(storagePath: string) {
  const slash = storagePath.lastIndexOf('/')
  const folder = slash >= 0 ? storagePath.slice(0, slash) : ''
  const filename = slash >= 0 ? storagePath.slice(slash + 1) : storagePath
  return {
    folder,
    baseName: filename.replace(/\.[^/.]+$/, ''),
  }
}

async function removePhotoFiles(
  supabase: ReturnType<typeof serviceClient>,
  deletion: ClaimedDeletion,
) {
  const { error: originalError } = await supabase.storage
    .from('photos-original')
    .remove([deletion.claimed_storage_path])
  if (originalError) throw originalError

  const { folder, baseName } = storageParts(deletion.claimed_storage_path)
  const { data: listed, error: listError } = await supabase.storage
    .from('photos-optimized')
    .list(folder, { limit: 1000, search: baseName })
  if (listError) throw listError

  const escapedBase = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const ownedOutputPattern = new RegExp(
    `^${escapedBase}(?:[.]jpg|-thumb[.]jpg|-optimized-[0-9]+[.]jpg|-thumb-[0-9]+[.]jpg)$`,
  )
  const listedPaths = (listed ?? [])
    .filter((object) => ownedOutputPattern.test(object.name))
    .map((object) => (folder ? `${folder}/${object.name}` : object.name))
  const optimizedPaths = [
    deletion.claimed_optimized_path,
    deletion.claimed_thumbnail_path,
    ...listedPaths,
  ].filter((path): path is string => Boolean(path))

  if (optimizedPaths.length > 0) {
    const { error: optimizedError } = await supabase.storage
      .from('photos-optimized')
      .remove([...new Set(optimizedPaths)])
    if (optimizedError) throw optimizedError
  }
}

Deno.serve(async (req) => {
  const cors = handleCors(req, { methods: ['POST'] })
  if (cors.response) return cors.response
  const corsHeaders = cors.headers
  const jsonResponse = (body: unknown, status = 200) =>
    createJsonResponse(body, corsHeaders, status)

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  let photoId: string | undefined
  let action: 'optimize' | 'delete' = 'optimize'
  let claimedAttempt: number | undefined
  let claimedDeletionAttempt: number | undefined
  let attemptedOutputPaths: string[] = []
  const supabase = serviceClient()

  try {
    try {
      const body = await req.json()
      photoId = body.photoId
      action = body.action ?? 'optimize'
    } catch {
      return jsonResponse({ error: 'Ugyldig JSON i request-body' }, 400)
    }
    if (typeof photoId !== 'string' || !photoId) {
      return jsonResponse({ error: 'photoId er påkrævet' }, 400)
    }
    if (action !== 'optimize' && action !== 'delete') {
      return jsonResponse({ error: 'Ukendt handling' }, 400)
    }

    const token = bearerToken(req)
    if (!token) return jsonResponse({ error: 'Ikke autoriseret' }, 401)

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return jsonResponse({ error: 'Ikke autoriseret' }, 401)
    }

    if (action === 'delete') {
      const { data: deletionRows, error: claimDeletionError } =
        await supabase.rpc('claim_photo_deletion', {
          p_photo_id: photoId,
          p_user_id: user.id,
        })
      if (claimDeletionError) throw claimDeletionError

      const deletion = (deletionRows?.[0] ?? null) as ClaimedDeletion | null
      if (!deletion) {
        const { data: existing } = await supabase
          .from('photos')
          .select('optimization_status')
          .eq('id', photoId)
          .eq('uploaded_by', user.id)
          .maybeSingle<{ optimization_status: string }>()
        if (!existing) {
          return jsonResponse(
            { error: 'Billedet findes ikke eller tilhører ikke dig' },
            403,
          )
        }
        return jsonResponse(
          { error: 'Billedet optimeres stadig. Prøv at slette igen om lidt.' },
          409,
        )
      }
      claimedDeletionAttempt = deletion.claimed_attempt

      await removePhotoFiles(supabase, deletion)
      const { data: deleted, error: deleteError } = await supabase.rpc(
        'delete_claimed_photo',
        {
          p_photo_id: photoId,
          p_expected_attempt: deletion.claimed_attempt,
        },
      )
      if (deleteError) {
        const { data: existing, error: reconcileError } = await supabase
          .from('photos')
          .select('id')
          .eq('id', photoId)
          .maybeSingle()
        if (!reconcileError && !existing) {
          return jsonResponse({ status: 'deleted' })
        }
        throw deleteError
      }
      if (!deleted) {
        const { data: existing } = await supabase
          .from('photos')
          .select('id')
          .eq('id', photoId)
          .maybeSingle()
        if (existing) throw new Error('Sletningsclaim blev overhalet')
      }
      return jsonResponse({ status: 'deleted' })
    }

    const { data: claimRows, error: claimError } = await supabase.rpc(
      'claim_photo_optimization',
      {
        p_photo_id: photoId,
        p_user_id: user.id,
      },
    )
    if (claimError) throw claimError

    const claimed = (claimRows?.[0] ?? null) as ClaimedPhoto | null
    if (!claimed) {
      const { data: state } = await supabase
        .from('photos')
        .select(
          'optimized_path, thumbnail_path, optimization_status, optimization_attempts',
        )
        .eq('id', photoId)
        .eq('uploaded_by', user.id)
        .maybeSingle<PhotoState>()
      if (!state) {
        return jsonResponse(
          { error: 'Billedet findes ikke eller tilhører ikke dig' },
          403,
        )
      }
      if (
        state.optimization_status === 'ready' &&
        state.optimized_path &&
        state.thumbnail_path
      ) {
        return jsonResponse({
          status: 'ready',
          optimizedPath: state.optimized_path,
          thumbnailPath: state.thumbnail_path,
        })
      }
      return jsonResponse({ status: 'processing' }, 202)
    }
    claimedAttempt = claimed.claimed_attempt

    const { data: original, error: downloadError } = await supabase.storage
      .from('photos-original')
      .download(claimed.claimed_storage_path)
    if (downloadError || !original) {
      throw new OptimizationError(
        downloadError?.message ?? 'Kunne ikke hente originalbilledet',
        'Originalfilen mangler eller kunne ikke læses. Upload billedet igen.',
      )
    }
    const bytes = new Uint8Array(await original.arrayBuffer())

    const basePath = claimed.claimed_storage_path.replace(/\.[^/.]+$/, '')
    const webPath = `${basePath}-optimized-${claimedAttempt}.jpg`
    const thumbnailPath = `${basePath}-thumb-${claimedAttempt}.jpg`
    attemptedOutputPaths = [webPath, thumbnailPath]

    const orientation = readExifOrientation(bytes)

    const web = applyOrientation(await Image.decode(bytes), orientation)
    if (web.width > WEB_MAX_WIDTH) {
      web.resize(WEB_MAX_WIDTH, Image.RESIZE_AUTO)
    }
    const webBytes = await web.encodeJPEG(WEB_JPEG_QUALITY)

    const thumbnail = applyOrientation(await Image.decode(bytes), orientation)
    if (thumbnail.width > THUMBNAIL_MAX_WIDTH) {
      thumbnail.resize(THUMBNAIL_MAX_WIDTH, Image.RESIZE_AUTO)
    }
    const thumbnailBytes = await thumbnail.encodeJPEG(THUMBNAIL_JPEG_QUALITY)

    const { error: webUploadError } = await supabase.storage
      .from('photos-optimized')
      .upload(webPath, webBytes, { contentType: 'image/jpeg', upsert: true })
    if (webUploadError) throw webUploadError

    const { error: thumbnailUploadError } = await supabase.storage
      .from('photos-optimized')
      .upload(thumbnailPath, thumbnailBytes, {
        contentType: 'image/jpeg',
        upsert: true,
      })
    if (thumbnailUploadError) throw thumbnailUploadError

    const { data: completed, error: updateError } = await supabase.rpc(
      'complete_photo_optimization',
      {
        p_photo_id: photoId,
        p_expected_attempt: claimedAttempt,
        p_succeeded: true,
        p_optimized_path: webPath,
        p_thumbnail_path: thumbnailPath,
        p_error: null,
      },
    )
    if (updateError) throw updateError
    if (!completed) {
      const { error: cleanupError } = await supabase.storage
        .from('photos-optimized')
        .remove(attemptedOutputPaths)
      if (cleanupError) {
        console.error('Kunne ikke rydde output fra overhalet optimering', {
          photoId,
          claimedAttempt,
          cleanupError,
        })
      }
      return jsonResponse({ status: 'superseded' }, 202)
    }

    return jsonResponse({
      status: 'ready',
      optimizedPath: webPath,
      thumbnailPath,
    })
  } catch (error) {
    if (
      action === 'delete' &&
      photoId &&
      claimedDeletionAttempt !== undefined
    ) {
      const { error: releaseError } = await supabase.rpc(
        'fail_photo_deletion',
        {
          p_photo_id: photoId,
          p_expected_attempt: claimedDeletionAttempt,
          p_error: 'Billedet kunne ikke slettes. Prøv igen.',
        },
      )
      if (releaseError) {
        console.error('Kunne ikke gemme fejlet sletningsstatus', {
          photoId,
          claimedDeletionAttempt,
          releaseError,
        })
      }
    }

    if (photoId && claimedAttempt !== undefined) {
      const publicMessage =
        error instanceof OptimizationError
          ? error.publicMessage
          : 'Billedet kunne ikke optimeres. Prøv igen.'
      const { error: statusError } = await supabase.rpc(
        'complete_photo_optimization',
        {
          p_photo_id: photoId,
          p_expected_attempt: claimedAttempt,
          p_succeeded: false,
          p_optimized_path: null,
          p_thumbnail_path: null,
          p_error: publicMessage,
        },
      )
      if (statusError) {
        console.error('Kunne ikke gemme fejlet optimeringsstatus', {
          photoId,
          claimedAttempt,
          statusError,
        })
      }

      const { data: persisted, error: persistedError } = await supabase
        .from('photos')
        .select(
          'optimized_path, thumbnail_path, optimization_status, optimization_attempts',
        )
        .eq('id', photoId)
        .maybeSingle<PhotoState>()
      const successWasCommitted =
        persisted?.optimization_status === 'ready' &&
        persisted.optimization_attempts === claimedAttempt &&
        attemptedOutputPaths.includes(persisted.optimized_path ?? '') &&
        attemptedOutputPaths.includes(persisted.thumbnail_path ?? '')

      if (successWasCommitted) {
        return jsonResponse({
          status: 'ready',
          optimizedPath: persisted.optimized_path,
          thumbnailPath: persisted.thumbnail_path,
        })
      }

      if (!persistedError && attemptedOutputPaths.length > 0) {
        const { error: cleanupError } = await supabase.storage
          .from('photos-optimized')
          .remove(attemptedOutputPaths)
        if (cleanupError) {
          console.error('Kunne ikke rydde output fra fejlet optimering', {
            photoId,
            claimedAttempt,
            cleanupError,
          })
        }
      }
    }

    // Originalen forbliver synlig via useDisplayUrl's signerede URL.
    console.error(
      action === 'delete'
        ? 'Sikker billedsletning fejlede'
        : 'optimize-image fejlede',
      { photoId, claimedAttempt, error },
    )
    return jsonResponse(
      {
        error:
          action === 'delete'
            ? 'Billedet kunne ikke slettes'
            : 'Billedoptimering fejlede',
      },
      500,
    )
  }
})
