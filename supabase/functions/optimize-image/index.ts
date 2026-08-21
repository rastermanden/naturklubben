// Edge Function: optimize-image
//
// Kaldes fra klienten (src/features/gallery/useUploadPhotos.ts) lige efter et
// billede er uploadet til den private `photos-original`-bucket. Genererer en
// web-str­ørrelse og en thumbnail, lægger dem i den offentlige
// `photos-optimized`-bucket, og opdaterer photos-rækken.
//
// Bruger `imagescript` -- et rent Deno/WASM-billedbibliotek uden native
// afhængigheder (kører derfor problemfrit i Edge Runtime, i modsætning til
// fx Sharp/libvips). Output er WebP, som imagescript understøtter direkte.
//
// Kræver SUPABASE_SECRET_KEY sat som function-secret (se
// .github/workflows/deploy-functions.yml), da den omgår RLS for at kunne
// skrive optimerede filer og opdatere andres photos-rækker.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts'

const WEB_MAX_WIDTH = 1600
const THUMBNAIL_MAX_WIDTH = 400
const WEB_WEBP_QUALITY = 80
const THUMBNAIL_WEBP_QUALITY = 75

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
      Deno.env.get('SUPABASE_SECRET_KEY')!,
    )

    const { data: original, error: downloadError } = await supabase.storage
      .from('photos-original')
      .download(storagePath)
    if (downloadError || !original) {
      throw downloadError ?? new Error('Kunne ikke hente originalbilledet')
    }
    const bytes = new Uint8Array(await original.arrayBuffer())

    const basePath = storagePath.replace(/\.[^/.]+$/, '')
    const webPath = `${basePath}.webp`
    const thumbnailPath = `${basePath}-thumb.webp`

    const web = await Image.decode(bytes)
    if (web.width > WEB_MAX_WIDTH) {
      web.resize(WEB_MAX_WIDTH, Image.RESIZE_AUTO)
    }
    const webBytes = await web.encodeWEBP(WEB_WEBP_QUALITY)

    const thumbnail = await Image.decode(bytes)
    if (thumbnail.width > THUMBNAIL_MAX_WIDTH) {
      thumbnail.resize(THUMBNAIL_MAX_WIDTH, Image.RESIZE_AUTO)
    }
    const thumbnailBytes = await thumbnail.encodeWEBP(THUMBNAIL_WEBP_QUALITY)

    const { error: webUploadError } = await supabase.storage
      .from('photos-optimized')
      .upload(webPath, webBytes, { contentType: 'image/webp', upsert: true })
    if (webUploadError) throw webUploadError

    const { error: thumbnailUploadError } = await supabase.storage
      .from('photos-optimized')
      .upload(thumbnailPath, thumbnailBytes, {
        contentType: 'image/webp',
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
    return jsonResponse({ error: 'Billedoptimering fejlede' }, 500)
  }
})
