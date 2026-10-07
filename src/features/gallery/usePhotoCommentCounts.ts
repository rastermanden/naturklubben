import { useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'

export interface PhotoCommentCount {
  photo_id: string
  comment_count: number
}

function sortedIdsOf(photoIds: string[]) {
  return [...photoIds].sort()
}

export function photoCommentCountsQueryKey(photoIds: string[]) {
  return ['photo-comment-counts', sortedIdsOf(photoIds)] as const
}

async function fetchCommentCounts(
  photoIds: string[],
): Promise<PhotoCommentCount[]> {
  if (photoIds.length === 0) return []
  const { data, error } = await supabase
    .from('photo_comment_counts')
    .select('photo_id, comment_count')
    .in('photo_id', photoIds)
  if (error) throw error
  return data as PhotoCommentCount[]
}

/** Antal kommentarer for en liste billeder, til badgen på PhotoThumbnail. */
export function commentCountFor(
  counts: PhotoCommentCount[] | undefined,
  photoId: string,
): number {
  return counts?.find((row) => row.photo_id === photoId)?.comment_count ?? 0
}

/**
 * Batchet kommentarantal for de billeder, der rent faktisk vises (#218) --
 * ét opslag for hele den synlige side, ikke ét pr. thumbnail.
 */
export function usePhotoCommentCounts(photoIds: string[]) {
  const queryClient = useQueryClient()
  const sortedIds = useMemo(() => sortedIdsOf(photoIds), [photoIds])

  const query = useQuery({
    queryKey: ['photo-comment-counts', sortedIds] as const,
    queryFn: () => fetchCommentCounts(sortedIds),
    enabled: sortedIds.length > 0,
    staleTime: 30_000,
  })

  useEffect(() => {
    function bumpInsert(photoId: string) {
      queryClient.setQueriesData<PhotoCommentCount[]>(
        { queryKey: ['photo-comment-counts'] },
        (current) => {
          if (!current) return current
          const existing = current.find((row) => row.photo_id === photoId)
          if (!existing) {
            return [...current, { photo_id: photoId, comment_count: 1 }]
          }
          return current.map((row) =>
            row.photo_id === photoId
              ? { ...row, comment_count: row.comment_count + 1 }
              : row,
          )
        },
      )
    }

    const channel = supabase
      .channel('photo-comment-counts-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'photo_comments' },
        (payload) => {
          const row = payload.new as { photo_id: string }
          bumpInsert(row.photo_id)
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'photo_comments' },
        // `old` bærer kun primærnøglen (id) med tabellens almindelige replica
        // identity -- ikke photo_id -- så en enkelt sletning kan ikke bumpes
        // præcist. En let invalidering genberegner det lille view i stedet.
        () => {
          void queryClient.invalidateQueries({
            queryKey: ['photo-comment-counts'],
          })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [queryClient])

  return query
}
