// Edge Function: optimize-image
//
// Kaldes fra klienten (src/features/gallery/useUploadPhotos.ts) lige efter et
// billede er uploadet til den private `photos-original`-bucket. Genererer en
// web-str­ørrelse og en thumbnail, lægger dem i den offentlige
// `photos-optimized`-bucket, og opdaterer photos-rækken.
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
// og opdatere andres photos-rækker. Secret key er reserveret og
// auto-injiceres af platformen i alle Edge Functions (kan ikke sættes
// manuelt via `supabase secrets set`, se .github/workflows/deploy-functions.yml)
// -- SUPABASE_SERVICE_ROLE_KEY er det historiske reserverede variabelnavn,
// så vi falder tilbage til det hvis SUPABASE_SECRET_KEY ikke er sat.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
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
function applyOrientation(img: Image, orientation: number): Image {
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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let photoId: string | undefined
  let storagePath: string | undefined

  try {
    ;({ photoId, storagePath } = await req.json())
    if (!photoId || !storagePath) {
      return jsonResponse({ error: 'photoId og storagePath er påkrævet' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ??
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    )

    const { data: original, error: downloadError } = await supabase.storage
      .from('photos-original')
      .download(storagePath)
    if (downloadError || !original) {
      throw downloadError ?? new Error('Kunne ikke hente originalbilledet')
    }
    const bytes = new Uint8Array(await original.arrayBuffer())

    const basePath = storagePath.replace(/\.[^/.]+$/, '')
    const webPath = `${basePath}.jpg`
    const thumbnailPath = `${basePath}-thumb.jpg`

    const orientation = readExifOrientation(bytes)

    const web = applyOrientation(await Image.decode(bytes), orientation)
    if (web.width > WEB_MAX_WIDTH) {
      web.resize(WEB_MAX_WIDTH, Image.RESIZE_AUTO)
    }
    const webBytes = await web.encodeJPEG(WEB_JPEG_QUALITY)

    const thumbnail = applyOrientation(
      await Image.decode(bytes),
      orientation,
    )
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

    const { error: updateError } = await supabase
      .from('photos')
      .update({ optimized_path: webPath, thumbnail_path: thumbnailPath })
      .eq('id', photoId)
    if (updateError) throw updateError

    return jsonResponse({ optimizedPath: webPath, thumbnailPath })
  } catch (error) {
    // Fejler optimeringen, forbliver originalen synlig i galleriet via
    // useDisplayUrl's signerede-URL-fallback -- vi blokerer ikke uploadet.
    console.error('optimize-image fejlede', { photoId, storagePath, error })
    return jsonResponse(
      {
        error: 'Billedoptimering fejlede',
        detail: error instanceof Error ? error.message : String(error),
      },
      500,
    )
  }
})
