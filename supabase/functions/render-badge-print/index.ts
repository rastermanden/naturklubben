// Edge Function: render-badge-print
//
// Genererer den trykklare PNG til et badge (#159). Kaldes fra admin-panelet,
// når en badge oprettes eller dens billede/beskæring ændres -- samme mønster
// som optimize-image kaldes efter et upload.
//
// Hvorfor overhovedet en function? Den runde *visning* i appen har ingen brug
// for den: `border-radius: 50%` plus et billede, der er skaleret og forskudt
// efter crop-værdierne, gør arbejdet i CSS (se src/features/badges/badgeCrop.ts).
// Men knapmaskinen folder 3-5 mm af trykket om bag kanten, så
// trykfilen skal være større end den synlige cirkel og have en synlig
// skærelinje. Det kan CSS ikke levere.
//
// Filen indeholder derfor:
//   - motivet beskåret efter badges.crop_x/crop_y/crop_size,
//   - plus bleed hele vejen rundt (badges.bleed_mm),
//   - med en stiplet cirkel dér, hvor badget skæres (badges.diameter_mm).
//
// PNG, ikke JPEG: trykfilen skal være tabsfri, og imagescript@1.3.0 kan kun
// encode JPEG og PNG (se kommentaren i optimize-image).
//
// Bruger Secret key til at læse originalen og skrive trykfilen. Kalderen
// valideres først som admin -- både her og igen i claim_badge_print, som er den
// eneste vej til at ændre badges.print_*.

import { createClient } from 'npm:@supabase/supabase-js@2.112.3'
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts'
import { handleCors } from '../_shared/cors.ts'
import {
  applyOrientation,
  readExifOrientation,
} from '../_shared/exifOrientation.ts'
import { badgePrintGeometry } from '../_shared/badgePrint.ts'

const BUCKET = 'badge-images'

interface ClaimedBadge {
  claimed_image_path: string
  claimed_attempt: number
  claimed_crop_x: number
  claimed_crop_y: number
  claimed_crop_size: number
  claimed_diameter_mm: number | string
  claimed_bleed_mm: number | string
}

interface BadgeState {
  print_status: string
  print_path: string | null
}

class RenderError extends Error {
  constructor(
    message: string,
    readonly publicMessage: string,
  ) {
    super(message)
  }
}

function jsonResponse(body: unknown, corsHeaders: Headers, status = 200) {
  const headers = new Headers(corsHeaders)
  headers.set('Content-Type', 'application/json')
  return new Response(JSON.stringify(body), { status, headers })
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

/**
 * Tegner skærelinjen som en stiplet cirkel. Stiplerne skifter mellem sort og
 * hvid, så linjen kan ses uanset hvilken farve motivet har lige dér.
 */
function drawCutLine(image: Image, radius: number) {
  const black = Image.rgbaToColor(0, 0, 0, 255)
  const white = Image.rgbaToColor(255, 255, 255, 255)
  const centerX = image.width / 2
  const centerY = image.height / 2
  const thickness = Math.max(2, Math.round(image.width / 400))
  const half = (thickness - 1) / 2

  // Et halvt pixel pr. skridt langs omkredsen, så ringen bliver sammenhængende.
  const steps = Math.max(8, Math.ceil(2 * Math.PI * radius * 2))
  // ~2 mm stipler ved 300 dpi.
  const dashSteps = Math.max(4, Math.round(steps / 48))

  for (let step = 0; step < steps; step++) {
    const angle = (step / steps) * 2 * Math.PI
    const color = Math.floor(step / dashSteps) % 2 === 0 ? black : white
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    for (let offset = -half; offset <= half; offset += 0.5) {
      const distance = radius + offset
      // setPixelAt er 1-indekseret i imagescript og kaster uden for kanten.
      const x = Math.round(centerX + cos * distance)
      const y = Math.round(centerY + sin * distance)
      if (x >= 1 && y >= 1 && x <= image.width && y <= image.height) {
        image.setPixelAt(x, y, color)
      }
    }
  }
}

async function renderPrintFile(
  bytes: Uint8Array,
  claimed: ClaimedBadge,
): Promise<Uint8Array> {
  // Browseren viser JPEG'er med EXIF-orientation anvendt, og det er dét
  // billede, admin beskar. Trykfilen skal se ud på samme måde.
  const source = applyOrientation(
    await Image.decode(bytes),
    readExifOrientation(bytes),
  )

  const geometry = badgePrintGeometry({
    // Originalens faktiske mål, ikke de gemte: er der uenighed, skal
    // beskæringen klippes til den fil, vi rent faktisk har.
    imageWidth: source.width,
    imageHeight: source.height,
    cropX: claimed.claimed_crop_x,
    cropY: claimed.claimed_crop_y,
    cropSize: claimed.claimed_crop_size,
    diameterMm: Number(claimed.claimed_diameter_mm),
    bleedMm: Number(claimed.claimed_bleed_mm),
  })

  if (geometry.regionWidth < 1 || geometry.regionHeight < 1) {
    throw new RenderError(
      `Udsnittet ligger uden for billedet (${geometry.regionWidth}x${geometry.regionHeight})`,
      'Beskæringen ligger uden for billedet. Vælg udsnittet igen.',
    )
  }

  // Beskær originalen direkte frem for at klone den først: en klon af et stort
  // billede fordobler hukommelsesforbruget i Edge-runtimen uden gevinst.
  const region = source.crop(
    geometry.regionX,
    geometry.regionY,
    geometry.regionWidth,
    geometry.regionHeight,
  )

  const canvas = new Image(geometry.canvasSize, geometry.canvasSize)
  canvas.fill(Image.rgbaToColor(255, 255, 255, 255))

  if (geometry.needsEdgeFill) {
    // Bleed'en rækker uden for originalen. Frem for en hvid kant -- som ville
    // blive synlig, når knapmaskinen folder om -- lægges en let opskaleret
    // kopi af samme udsnit under. Den del af trykket ender bag på badget.
    canvas.composite(
      region.clone().resize(geometry.canvasSize, geometry.canvasSize),
      0,
      0,
    )
  }

  canvas.composite(region, geometry.offsetX, geometry.offsetY)
  canvas.resize(geometry.printPx, geometry.printPx)
  drawCutLine(canvas, geometry.cutRadiusPx)

  return await canvas.encode()
}

/** Fjerner trykfiler fra tidligere forsøg, så mappen ikke vokser. */
async function removeStalePrintFiles(
  supabase: ReturnType<typeof serviceClient>,
  badgeId: string,
  keepPath: string,
) {
  const { data: listed, error } = await supabase.storage
    .from(BUCKET)
    .list(badgeId, { limit: 1000 })
  if (error) throw error

  const stale = (listed ?? [])
    .filter((object) => /^print-[0-9]+\.png$/.test(object.name))
    .map((object) => `${badgeId}/${object.name}`)
    .filter((path) => path !== keepPath)

  if (stale.length > 0) {
    const { error: removeError } = await supabase.storage
      .from(BUCKET)
      .remove(stale)
    if (removeError) throw removeError
  }
}

Deno.serve(async (req) => {
  const cors = handleCors(req, { methods: ['POST'] })
  if (cors.response) return cors.response
  const corsHeaders = cors.headers
  const respond = (body: unknown, status = 200) =>
    jsonResponse(body, corsHeaders, status)

  if (req.method !== 'POST') {
    return respond({ error: 'Method not allowed' }, 405)
  }

  const supabase = serviceClient()
  let badgeId: string | undefined
  let claimedAttempt: number | undefined
  let uploadedPath: string | undefined

  try {
    let body: { badgeId?: unknown }
    try {
      body = await req.json()
    } catch {
      return respond({ error: 'Ugyldig JSON i request-body' }, 400)
    }
    if (typeof body.badgeId !== 'string' || !body.badgeId) {
      return respond({ error: 'badgeId er påkrævet' }, 400)
    }
    badgeId = body.badgeId

    const token = bearerToken(req)
    if (!token) return respond({ error: 'Ikke autoriseret' }, 401)

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return respond({ error: 'Ikke autoriseret' }, 401)
    }

    const { data: claimRows, error: claimError } = await supabase.rpc(
      'claim_badge_print',
      { p_badge_id: badgeId, p_user_id: user.id },
    )
    if (claimError) throw claimError

    const claimed = (claimRows?.[0] ?? null) as ClaimedBadge | null
    if (!claimed) {
      // Enten er kalderen ikke admin, badgen findes ikke, eller en anden
      // rendering er allerede i gang. De tre skelnes her, så admin-panelet kan
      // vise noget bedre end "prøv igen".
      const [{ data: badge }, { data: actor }] = await Promise.all([
        supabase
          .from('badges')
          .select('print_status, print_path')
          .eq('id', badgeId)
          .maybeSingle<BadgeState>(),
        supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', user.id)
          .maybeSingle<{ is_admin: boolean }>(),
      ])
      if (actor?.is_admin !== true) {
        return respond({ error: 'Kun administratorer kan lave trykfilen' }, 403)
      }
      if (!badge) {
        return respond({ error: 'Badgen findes ikke' }, 404)
      }
      return respond({ status: 'rendering', printPath: badge.print_path }, 202)
    }
    claimedAttempt = claimed.claimed_attempt

    const { data: original, error: downloadError } = await supabase.storage
      .from(BUCKET)
      .download(claimed.claimed_image_path)
    if (downloadError || !original) {
      throw new RenderError(
        downloadError?.message ?? 'Kunne ikke hente badgebilledet',
        'Billedfilen mangler eller kunne ikke læses. Upload billedet igen.',
      )
    }

    const printBytes = await renderPrintFile(
      new Uint8Array(await original.arrayBuffer()),
      claimed,
    )

    const printPath = `${badgeId}/print-${claimedAttempt}.png`
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(printPath, printBytes, {
        contentType: 'image/png',
        upsert: true,
      })
    if (uploadError) throw uploadError
    uploadedPath = printPath

    const { data: completed, error: completeError } = await supabase.rpc(
      'complete_badge_print',
      {
        p_badge_id: badgeId,
        p_expected_attempt: claimedAttempt,
        p_succeeded: true,
        p_print_path: printPath,
        p_error: null,
      },
    )
    if (completeError) throw completeError

    if (!completed) {
      // Et nyere forsøg har overhalet os. Ryd vores egen fil op frem for at
      // efterlade den som en forældet trykfil ingen peger på.
      const { error: cleanupError } = await supabase.storage
        .from(BUCKET)
        .remove([printPath])
      if (cleanupError) {
        console.error('Kunne ikke rydde overhalet trykfil', {
          badgeId,
          claimedAttempt,
          cleanupError,
        })
      }
      return respond({ status: 'superseded' }, 202)
    }

    try {
      await removeStalePrintFiles(supabase, badgeId, printPath)
    } catch (cleanupError) {
      // Oprydning må aldrig vælte en rendering, der lykkedes.
      console.error('Kunne ikke rydde tidligere trykfiler', {
        badgeId,
        cleanupError,
      })
    }

    return respond({ status: 'ready', printPath })
  } catch (error) {
    if (badgeId && claimedAttempt !== undefined) {
      const publicMessage =
        error instanceof RenderError
          ? error.publicMessage
          : 'Trykfilen kunne ikke laves. Prøv igen.'
      const { error: statusError } = await supabase.rpc(
        'complete_badge_print',
        {
          p_badge_id: badgeId,
          p_expected_attempt: claimedAttempt,
          p_succeeded: false,
          p_print_path: null,
          p_error: publicMessage,
        },
      )
      if (statusError) {
        console.error('Kunne ikke gemme fejlet trykstatus', {
          badgeId,
          claimedAttempt,
          statusError,
        })
      }

      if (uploadedPath) {
        const { error: cleanupError } = await supabase.storage
          .from(BUCKET)
          .remove([uploadedPath])
        if (cleanupError) {
          console.error('Kunne ikke rydde op efter fejlet rendering', {
            badgeId,
            cleanupError,
          })
        }
      }
    }

    console.error('render-badge-print fejlede', { badgeId, error })
    return respond({ error: 'Trykfilen kunne ikke laves' }, 500)
  }
})
