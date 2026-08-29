import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { BadgeUserFacingError } from './badgeErrors'
import { badgePrintPollInterval } from './printStatus'
import type { Badge } from './types'

export const BADGE_IMAGE_BUCKET = 'badge-images'

// Skal matche file_size_limit og allowed_mime_types på bucketten (se
// migrationen 20260826120000_badges.sql). Grænsen er større end avatars' 5 MB,
// fordi originalen er forlægget for trykket.
export const MAX_BADGE_IMAGE_SIZE = 10 * 1024 * 1024
export const BADGE_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const

export const badgesQueryKey = ['badges'] as const

const BADGE_COLUMNS =
  'id, slug, name, description, image_path, image_width, image_height, image_mime_type, crop_x, crop_y, crop_size, diameter_mm, bleed_mm, print_path, print_status, print_error, print_started_at, is_active, created_at, updated_at'

/** Den permanente offentlige URL. Bucketten er offentlig, netop derfor. */
export function badgeImageUrl(path: string) {
  return supabase.storage.from(BADGE_IMAGE_BUCKET).getPublicUrl(path).data
    .publicUrl
}

async function fetchBadges(): Promise<Badge[]> {
  const { data, error } = await supabase
    .from('badges')
    .select(BADGE_COLUMNS)
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []) as Badge[]
}

// Så længe en trykfil er undervejs, henter kataloget sig selv igen. Uden det
// bliver "Trykfilen laves…" stående, til admin genindlæser siden. Pollingen
// stopper, når renderingen enten er færdig eller er gået i stå -- se
// printStatus.ts.
export function useBadges() {
  return useQuery({
    queryKey: badgesQueryKey,
    queryFn: fetchBadges,
    refetchInterval: (query) => badgePrintPollInterval(query.state.data),
    refetchIntervalInBackground: false,
  })
}

export interface BadgeImageUpload {
  file: File
  width: number
  height: number
}

export interface BadgeFormValues {
  name: string
  slug: string
  description: string
  cropX: number
  cropY: number
  cropSize: number
  diameterMm: number
  bleedMm: number
  isActive: boolean
}

interface SaveBadgeInput {
  badgeId?: string
  values: BadgeFormValues
  image?: BadgeImageUpload
  /** Den nuværende fil -- ryddes op, når den erstattes. */
  previousImagePath?: string
}

function fileExtension(file: File) {
  const fromName = file.name.split('.').pop()?.toLowerCase()
  if (fromName && /^[a-z0-9]{1,5}$/.test(fromName)) return fromName
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  return 'jpg'
}

/** Svaret fra render-badge-print. 202 er ikke en fejl -- se nedenfor. */
export interface PrintRenderResult {
  /**
   * 'ready' = filen ligger klar. 'rendering' = en anden (eller en tidligere)
   * rendering af samme badge er i gang. 'superseded' = et nyere forsøg overhalede
   * vores; det er det nyere forsøg, der bestemmer.
   */
  status: 'ready' | 'rendering' | 'superseded'
  printPath: string | null
}

// Renderingen tager sekunder, ikke minutter. Bliver svaret væk alligevel --
// koldstart, en worker der dør, et netværk der falder ud -- skal klienten ikke
// vente i det uendelige på det: knappen ville stå som "i gang" resten af
// sessionen. Kataloget poller selv videre bagefter.
const PRINT_RENDER_TIMEOUT_MS = 60_000

function isAbortError(error: unknown): boolean {
  const named = (value: unknown) =>
    typeof value === 'object' && value !== null && 'name' in value
      ? String((value as { name?: unknown }).name)
      : ''
  const context =
    typeof error === 'object' && error !== null && 'context' in error
      ? (error as { context?: unknown }).context
      : undefined
  const names = [named(error), named(context)]
  return names.includes('AbortError') || names.includes('TimeoutError')
}

/**
 * Functionen svarer med en dansk forklaring i `error`-feltet ved 4xx/5xx.
 * supabase-js pakker det svar væk i en generisk FunctionsHttpError, så teksten
 * hentes ud her -- ellers ville admin få "Prøv igen om lidt" på en fejl, der
 * fortæller præcis, hvad der er galt.
 */
async function functionErrorMessage(error: unknown): Promise<string | null> {
  const context =
    typeof error === 'object' && error !== null && 'context' in error
      ? (error as { context?: unknown }).context
      : undefined
  if (!(context instanceof Response)) return null
  try {
    const body: unknown = await context.clone().json()
    const message =
      typeof body === 'object' && body !== null && 'error' in body
        ? (body as { error?: unknown }).error
        : null
    return typeof message === 'string' && message ? message : null
  } catch {
    return null
  }
}

/**
 * Beder render-badge-print om en ny trykfil. Kaldet er bevidst "best effort":
 * badges.print_status står som pending, indtil den lykkes, så admin-panelet kan
 * vise, at der mangler en trykfil, og prøve igen.
 */
async function requestPrintRender(badgeId: string): Promise<PrintRenderResult> {
  const { data, error } = await supabase.functions.invoke<{
    status?: string
    printPath?: string | null
  }>('render-badge-print', {
    body: { badgeId },
    timeout: PRINT_RENDER_TIMEOUT_MS,
  })

  if (error) {
    // Et afbrudt kald siger intet om renderingen: den kører videre i Edge
    // Functionen, og statussen på rækken er svaret.
    if (isAbortError(error)) return { status: 'rendering', printPath: null }
    const message = await functionErrorMessage(error)
    throw message ? new BadgeUserFacingError(message) : error
  }

  const status = data?.status
  return {
    status:
      status === 'ready' || status === 'superseded' ? status : 'rendering',
    printPath: data?.printPath ?? null,
  }
}

/**
 * Opretter eller retter en badge. Rækkefølgen er upload -> række -> rendering:
 * en badge uden billede må ikke kunne gemmes, og en ny beskæring skal have en
 * ny trykfil.
 */
export function useSaveBadge() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      badgeId,
      values,
      image,
      previousImagePath,
    }: SaveBadgeInput) => {
      if (!badgeId && !image) {
        throw new Error('badge_image_required')
      }

      // Id'et dannes her frem for i databasen, fordi billedet skal ligge i
      // badgens egen mappe, *før* rækken kan indsættes med image_path.
      const id = badgeId ?? crypto.randomUUID()
      let imagePath = previousImagePath

      if (image) {
        const path = `${id}/original-${crypto.randomUUID()}.${fileExtension(image.file)}`
        const { error: uploadError } = await supabase.storage
          .from(BADGE_IMAGE_BUCKET)
          .upload(path, image.file, { contentType: image.file.type })
        if (uploadError) throw uploadError
        imagePath = path
      }

      const row = {
        slug: values.slug,
        name: values.name.trim(),
        description: values.description.trim() || null,
        crop_x: values.cropX,
        crop_y: values.cropY,
        crop_size: values.cropSize,
        diameter_mm: values.diameterMm,
        bleed_mm: values.bleedMm,
        is_active: values.isActive,
        ...(image
          ? {
              image_path: imagePath!,
              image_width: image.width,
              image_height: image.height,
              image_mime_type: image.file.type,
            }
          : {}),
      }

      if (badgeId) {
        const { error } = await supabase
          .from('badges')
          .update(row)
          .eq('id', badgeId)
          .select('id')
          .single()
        if (error) throw error
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        // Politikken kræver created_by = auth.uid(); uden en session ville
        // insert'et blive afvist med en rå RLS-fejl i stedet.
        if (!user) throw new Error('badge_save_not_authorized')
        const { error } = await supabase
          .from('badges')
          .insert({ id, ...row, created_by: user.id })
          .select('id')
          .single()
        if (error) throw error
      }

      // Bedste indsats: den gamle original er kun til besvær, når en ny er
      // gemt. Fejler oprydningen, er badgen stadig rigtig.
      if (image && previousImagePath && previousImagePath !== imagePath) {
        await supabase.storage
          .from(BADGE_IMAGE_BUCKET)
          .remove([previousImagePath])
      }

      return { id, renderStarted: true }
    },
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({ queryKey: badgesQueryKey })
      // Trykfilen laves i baggrunden. Ventede vi på den her, ville "Gemmer…"
      // stå på knappen, til renderingen var færdig -- og hænge helt, hvis
      // svaret aldrig kom. Kataloget poller selv, mens filen er undervejs.
      void requestPrintRender(id)
        .catch((renderError: unknown) => {
          console.error('Trykfilen kunne ikke genereres', renderError)
        })
        .finally(() => {
          void queryClient.invalidateQueries({ queryKey: badgesQueryKey })
        })
    },
  })
}

/** Genforsøg på en trykrendering, der fejlede. */
export function useRenderBadgePrint() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (badgeId: string) => requestPrintRender(badgeId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: badgesQueryKey }),
  })
}

export function useSetBadgeActive() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      badgeId,
      isActive,
    }: {
      badgeId: string
      isActive: boolean
    }) => {
      const { error } = await supabase
        .from('badges')
        .update({ is_active: isActive })
        .eq('id', badgeId)
        .select('id')
        .single()
      if (error) throw error
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: badgesQueryKey }),
  })
}
