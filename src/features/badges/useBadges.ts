import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
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
  'id, slug, name, description, image_path, image_width, image_height, image_mime_type, crop_x, crop_y, crop_size, diameter_mm, bleed_mm, print_path, print_status, print_error, is_active, created_at'

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

export function useBadges() {
  return useQuery({ queryKey: badgesQueryKey, queryFn: fetchBadges })
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

/**
 * Beder render-badge-print om en ny trykfil. Kaldet er bevidst "best effort":
 * badges.print_status står som pending, indtil den lykkes, så admin-panelet kan
 * vise, at der mangler en trykfil, og prøve igen.
 */
async function requestPrintRender(badgeId: string) {
  const { error } = await supabase.functions.invoke('render-badge-print', {
    body: { badgeId },
  })
  if (error) throw error
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
      try {
        await requestPrintRender(id)
      } catch (renderError) {
        console.error('Trykfilen kunne ikke genereres', renderError)
      }
      await queryClient.invalidateQueries({ queryKey: badgesQueryKey })
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
