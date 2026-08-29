import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { photoFields } from '../gallery/usePhotos'
import { requestPhotoOptimization } from '../gallery/useRetryPhotoOptimization'
import {
  createUploadQueueItems,
  uploadQueuedPhoto,
} from '../gallery/useUploadPhotos'
import type { Observation, ObservationInput } from './types'

export const observationsQueryKey = ['observations'] as const

/** En lille klub når ikke hertil foreløbig; paginering kan komme senere. */
const OBSERVATION_LIMIT = 500

const observationFields = `id, species, location, observed_on, notes, latitude, longitude, photo_id, created_by, created_at, updated_at, observer:profiles(id, full_name), photo:photos(${photoFields})`

async function fetchObservations(): Promise<Observation[]> {
  const { data, error } = await supabase
    .from('observations')
    .select(observationFields)
    .order('observed_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(OBSERVATION_LIMIT)

  if (error) throw error
  return data as unknown as Observation[]
}

export function useObservations() {
  return useQuery({
    queryKey: observationsQueryKey,
    queryFn: fetchObservations,
  })
}

/**
 * Lægger observationens billede i galleriet ad samme vej som en almindelig
 * upload, så det også dukker op under Billeder og bliver optimeret der.
 */
export async function uploadObservationPhoto(
  file: File,
  userId: string,
  caption: string,
): Promise<string> {
  const [item] = createUploadQueueItems({
    files: [file],
    caption,
    eventId: null,
  })
  await uploadQueuedPhoto(item, userId)
  void requestPhotoOptimization(item.photoId).catch((error) =>
    console.warn(
      'Billedet er gemt, men optimeringen kunne ikke startes',
      error,
    ),
  )
  return item.photoId
}

export function useObservationMutations(userId: string | undefined) {
  const queryClient = useQueryClient()
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: observationsQueryKey })

  const createObservation = useMutation({
    mutationFn: async (input: ObservationInput) => {
      if (!userId) throw new Error('Ikke logget ind')
      const { error } = await supabase
        .from('observations')
        .insert({ ...input, created_by: userId })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const updateObservation = useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string
      input: ObservationInput
    }) => {
      const { error } = await supabase
        .from('observations')
        .update(input)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const deleteObservation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('observations')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: observationsQueryKey })
      const previous =
        queryClient.getQueryData<Observation[]>(observationsQueryKey) ?? []
      queryClient.setQueryData<Observation[]>(
        observationsQueryKey,
        previous.filter((observation) => observation.id !== id),
      )
      return { previous }
    },
    onError: (_error, _id, context) => {
      if (context) {
        queryClient.setQueryData(observationsQueryKey, context.previous)
      }
    },
    onSettled: invalidate,
  })

  return { createObservation, updateObservation, deleteObservation }
}
