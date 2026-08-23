import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import {
  isPendingOptimizationActive,
  isStaleOptimization,
  STALE_OPTIMIZATION_MS,
} from './optimizationStatus'
import type { Photo } from './types'

export const PHOTO_PAGE_SIZE = 40
export const PHOTO_OPTIMIZATION_POLL_LIMIT = 40
export const photosQueryKey = ['photos'] as const
const photoQueryKey = (photoId: string) => ['photo', photoId] as const
const photoFields =
  'id, storage_path, optimized_path, thumbnail_path, caption, event_id, event:events(id, title), uploaded_by, created_at, optimization_status, optimization_attempts, optimization_started_at, optimization_completed_at, optimization_error'

export interface PhotoPage {
  photos: Photo[]
  hasMore: boolean
}

export interface PhotoCursor {
  createdAt: string
  id: string
}

function comparePhotos(left: Photo, right: Photo) {
  return (
    right.created_at.localeCompare(left.created_at) ||
    right.id.localeCompare(left.id)
  )
}

export function mergePhotoPages(pages: PhotoPage[]): Photo[] {
  const seen = new Set<string>()
  return pages
    .flatMap((page) => page.photos)
    .sort(comparePhotos)
    .filter((photo) => {
      if (seen.has(photo.id)) return false
      seen.add(photo.id)
      return true
    })
}

export function photoIdsToPoll(photos: Photo[], now = Date.now()): string[] {
  return photos
    .filter(
      (photo) =>
        isPendingOptimizationActive(photo, now) ||
        (photo.optimization_status === 'processing' &&
          !isStaleOptimization(photo, now)),
    )
    .slice(0, PHOTO_OPTIMIZATION_POLL_LIMIT)
    .map((photo) => photo.id)
    .sort()
}

async function fetchPhotoPage(
  cursor: PhotoCursor | undefined,
): Promise<PhotoPage> {
  let query = supabase
    .from('photos')
    .select(photoFields)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PHOTO_PAGE_SIZE + 1)

  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    )
  }

  const { data, error } = await query
  if (error) throw error
  const photos = data as unknown as Photo[]
  return {
    photos: photos.slice(0, PHOTO_PAGE_SIZE),
    hasMore: photos.length > PHOTO_PAGE_SIZE,
  }
}

async function fetchPhoto(photoId: string): Promise<Photo | null> {
  const { data, error } = await supabase
    .from('photos')
    .select(photoFields)
    .eq('id', photoId)
    .maybeSingle()
  if (error) throw error
  return data as unknown as Photo | null
}

export function upsertPhotoInHistory(
  history: InfiniteData<PhotoPage> | undefined,
  incoming: Photo,
): InfiniteData<PhotoPage> | undefined {
  if (!history || history.pages.length === 0) return history

  const existingPageIndex = history.pages.findIndex((page) =>
    page.photos.some((photo) => photo.id === incoming.id),
  )
  let targetPageIndex = existingPageIndex

  if (targetPageIndex < 0) {
    targetPageIndex = history.pages.findIndex((page) => {
      const oldest = page.photos.at(-1)
      return !oldest || comparePhotos(incoming, oldest) <= 0
    })
    const lastPage = history.pages.at(-1)
    if (targetPageIndex < 0 && lastPage && !lastPage.hasMore) {
      targetPageIndex = history.pages.length - 1
    }
  }

  // En ny række, der ligger efter den endnu ikke indlæste cursor, hører ikke
  // til i den cachede del af galleriet.
  if (targetPageIndex < 0) return history

  const pages = history.pages.map((page, pageIndex) => {
    const photos = page.photos.filter((photo) => photo.id !== incoming.id)
    if (pageIndex !== targetPageIndex && photos.length === page.photos.length) {
      return page
    }
    if (pageIndex === targetPageIndex) photos.push(incoming)
    photos.sort(comparePhotos)
    return { ...page, photos }
  })
  return { ...history, pages }
}

export function removePhotoFromHistory(
  history: InfiniteData<PhotoPage> | undefined,
  photoId: string,
): InfiniteData<PhotoPage> | undefined {
  if (!history) return history
  let changed = false
  const pages = history.pages.map((page) => {
    const photos = page.photos.filter((photo) => photo.id !== photoId)
    if (photos.length === page.photos.length) return page
    changed = true
    return { ...page, photos }
  })
  return changed ? { ...history, pages } : history
}

function usePhotoCache() {
  const queryClient = useQueryClient()

  const cachePhoto = useCallback(
    (photo: Photo) => {
      queryClient.setQueryData(photoQueryKey(photo.id), photo)
      queryClient.setQueryData<InfiniteData<PhotoPage>>(
        photosQueryKey,
        (history) => upsertPhotoInHistory(history, photo),
      )
    },
    [queryClient],
  )

  const removePhoto = useCallback(
    (photoId: string) => {
      queryClient.setQueryData(photoQueryKey(photoId), null)
      queryClient.setQueryData<InfiniteData<PhotoPage>>(
        photosQueryKey,
        (history) => removePhotoFromHistory(history, photoId),
      )
    },
    [queryClient],
  )

  const refreshPhoto = useCallback(
    async (photoId: string) => {
      const photo = await fetchPhoto(photoId)
      if (photo) cachePhoto(photo)
      else removePhoto(photoId)
      return photo
    },
    [cachePhoto, removePhoto],
  )

  return { cachePhoto, refreshPhoto, removePhoto }
}

export function usePhotos() {
  const queryClient = useQueryClient()
  const { cachePhoto, removePhoto } = usePhotoCache()
  const livePhotos = useRef(new Map<string, Photo>())
  const deletedPhotoIds = useRef(new Set<string>())
  const operationVersions = useRef(new Map<string, number>())
  const wasFetching = useRef(false)

  const query = useInfiniteQuery({
    queryKey: photosQueryKey,
    initialPageParam: undefined as PhotoCursor | undefined,
    queryFn: ({ pageParam }) => fetchPhotoPage(pageParam),
    getNextPageParam: (lastPage) => {
      const oldest = lastPage.photos.at(-1)
      return lastPage.hasMore && oldest
        ? { createdAt: oldest.created_at, id: oldest.id }
        : undefined
    },
    select: (history) => ({
      ...history,
      photos: mergePhotoPages(history.pages),
    }),
    staleTime: 10_000,
  })

  const optimizingPhotoIds = useMemo(
    () => photoIdsToPoll(query.data?.photos ?? []),
    [query.data?.photos],
  )

  const optimizationPoll = useQuery({
    queryKey: ['photos-optimization', optimizingPhotoIds],
    enabled: optimizingPhotoIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('photos')
        .select(photoFields)
        .in('id', optimizingPhotoIds)
        .limit(PHOTO_OPTIMIZATION_POLL_LIMIT)
      if (error) throw error
      return data as unknown as Photo[]
    },
    refetchInterval: optimizingPhotoIds.length > 0 ? 3000 : false,
    refetchIntervalInBackground: false,
  })

  useEffect(() => {
    for (const photo of optimizationPoll.data ?? []) cachePhoto(photo)
  }, [cachePhoto, optimizationPoll.data, optimizationPoll.dataUpdatedAt])

  // En sidehentning er et snapshot. Genanvend Realtime-hændelser bagefter, så
  // snapshot-resultatet ikke kan overskrive en samtidig ændring.
  useEffect(() => {
    if (query.isFetching) {
      wasFetching.current = true
      return
    }
    if (!wasFetching.current) return
    wasFetching.current = false
    queryClient.setQueryData<InfiniteData<PhotoPage>>(
      photosQueryKey,
      (history) => {
        let updated = history
        for (const photoId of deletedPhotoIds.current) {
          updated = removePhotoFromHistory(updated, photoId)
        }
        for (const photo of livePhotos.current.values()) {
          if (!deletedPhotoIds.current.has(photo.id)) {
            updated = upsertPhotoInHistory(updated, photo)
          }
        }
        return updated
      },
    )
  }, [query.isFetching, queryClient])

  useEffect(() => {
    const refreshRealtimePhoto = async (photoId: string) => {
      const version = (operationVersions.current.get(photoId) ?? 0) + 1
      operationVersions.current.set(photoId, version)
      try {
        const photo = await fetchPhoto(photoId)
        if (operationVersions.current.get(photoId) !== version) return
        if (!photo) {
          livePhotos.current.delete(photoId)
          deletedPhotoIds.current.add(photoId)
          removePhoto(photoId)
          return
        }
        deletedPhotoIds.current.delete(photoId)
        livePhotos.current.set(photoId, photo)
        cachePhoto(photo)
      } catch (error) {
        console.warn('Billedændringen kunne ikke hentes', error)
      }
    }

    const channel = supabase
      .channel('photos-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'photos' },
        (payload) => {
          void refreshRealtimePhoto((payload.new as { id: string }).id)
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'photos' },
        (payload) => {
          void refreshRealtimePhoto((payload.new as { id: string }).id)
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'photos' },
        (payload) => {
          const photoId = (payload.old as { id: string }).id
          operationVersions.current.set(
            photoId,
            (operationVersions.current.get(photoId) ?? 0) + 1,
          )
          livePhotos.current.delete(photoId)
          deletedPhotoIds.current.add(photoId)
          removePhoto(photoId)
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [cachePhoto, removePhoto])

  return query
}

export function useRefreshPhoto() {
  return usePhotoCache().refreshPhoto
}

export function usePhoto(photoId: string | null, cachedPhoto?: Photo) {
  return useQuery({
    queryKey: photoQueryKey(photoId ?? ''),
    enabled: Boolean(photoId && !cachedPhoto),
    queryFn: () => fetchPhoto(photoId as string),
    initialData: cachedPhoto,
    staleTime: 10_000,
  })
}

export { STALE_OPTIMIZATION_MS }
