import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'

export interface PhotoComment {
  id: string
  photo_id: string
  user_id: string
  body: string
  created_at: string
  author: { full_name: string | null } | null
}

interface PhotoCommentRow {
  id: string
  photo_id: string
  user_id: string
  body: string
  created_at: string
  author?: { full_name: string | null } | { full_name: string | null }[] | null
}

const commentFields =
  'id, photo_id, user_id, body, created_at, author:profiles(full_name)'

export function photoCommentsQueryKey(photoId: string) {
  return ['photo-comments', photoId] as const
}

function normalizeComment(row: PhotoCommentRow): PhotoComment {
  const author = Array.isArray(row.author)
    ? (row.author[0] ?? null)
    : (row.author ?? null)
  return {
    id: row.id,
    photo_id: row.photo_id,
    user_id: row.user_id,
    body: row.body,
    created_at: row.created_at,
    author,
  }
}

async function fetchPhotoComments(photoId: string): Promise<PhotoComment[]> {
  const { data, error } = await supabase
    .from('photo_comments')
    .select(commentFields)
    .eq('photo_id', photoId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })

  if (error) throw error
  return (data as unknown as PhotoCommentRow[]).map(normalizeComment)
}

export function addComment(
  current: PhotoComment[] | undefined,
  incoming: PhotoComment,
): PhotoComment[] {
  if (!current) return [incoming]
  if (current.some((comment) => comment.id === incoming.id)) return current
  return [...current, incoming].sort(
    (a, b) =>
      a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  )
}

export function removeComment(
  current: PhotoComment[] | undefined,
  commentId: string,
): PhotoComment[] | undefined {
  return current?.filter((comment) => comment.id !== commentId)
}

/**
 * Kommentarer til ét billede, med Realtime-opdatering mens lysbordet er åbent
 * (#218). Kanalen er global for tabellen, ligesom photos/reactions -- men kun
 * det åbne billedes kommentarer holdes i cachen, så filtreringen sker
 * client-side på `photo_id`.
 */
export function usePhotoComments(photoId: string | null) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: photoCommentsQueryKey(photoId ?? ''),
    queryFn: () => fetchPhotoComments(photoId as string),
    enabled: photoId !== null,
    staleTime: 10_000,
  })

  useEffect(() => {
    if (!photoId) return

    function updateCache(
      update: (
        current: PhotoComment[] | undefined,
      ) => PhotoComment[] | undefined,
    ) {
      queryClient.setQueryData<PhotoComment[]>(
        photoCommentsQueryKey(photoId as string),
        update,
      )
    }

    const channel = supabase
      .channel(`photo-comments-realtime-${photoId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'photo_comments' },
        (payload) => {
          const row = payload.new as PhotoCommentRow
          if (row.photo_id !== photoId) return
          // Realtime bærer ikke embeddet forfatternavn -- det hentes ved
          // næste almindelige fetch. Kommentaren vises med det samme uden
          // navn, indtil da, fremfor slet ikke at vise den.
          updateCache((current) => addComment(current, normalizeComment(row)))
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'photo_comments' },
        (payload) => {
          const row = payload.old as { id: string; photo_id?: string }
          updateCache((current) => removeComment(current, row.id))
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [photoId, queryClient])

  return query
}

export function useCreatePhotoComment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      photoId,
      body,
    }: {
      photoId: string
      body: string
    }) => {
      const { data, error } = await supabase.rpc('create_photo_comment', {
        p_photo_id: photoId,
        p_body: body,
      })
      if (error) throw error
      return normalizeComment(data as PhotoCommentRow)
    },
    onSuccess: (comment) => {
      queryClient.setQueryData<PhotoComment[]>(
        photoCommentsQueryKey(comment.photo_id),
        (current) => addComment(current, comment),
      )
    },
  })
}

export function useDeletePhotoComment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      commentId,
    }: {
      commentId: string
      photoId: string
    }) => {
      const { error } = await supabase.rpc('delete_photo_comment', {
        p_comment_id: commentId,
      })
      if (error) throw error
    },
    onSuccess: (_data, { commentId, photoId }) => {
      queryClient.setQueryData<PhotoComment[]>(
        photoCommentsQueryKey(photoId),
        (current) => removeComment(current, commentId),
      )
    },
  })
}
