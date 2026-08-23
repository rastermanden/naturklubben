import { createClient } from 'npm:@supabase/supabase-js@2.112.3'
import {
  collectPages,
  handleExportAccount,
  SIGNED_URL_TTL_SECONDS,
  type AccountExportRepository,
  type AttendanceExport,
  type MessageExport,
  type PhotoDownloadUrls,
  type PhotoExport,
  type ProfileExport,
} from './handler.ts'

function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    (Deno.env.get('SUPABASE_SECRET_KEY') ??
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    { auth: { persistSession: false } },
  )
}

function queryError(context: string, error: { message: string } | null) {
  if (error) throw new Error(`${context}: ${error.message}`)
}

Deno.serve(async (req) => {
  const supabase = serviceClient()

  const repository: AccountExportRepository = {
    async getUser(token) {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(token)
      if (error || !user) return null
      return {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at,
      }
    },

    async getProfile(userId) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, chat_color, is_admin, created_at')
        .eq('id', userId)
        .single()
      queryError('Profil kunne ikke hentes', error)
      if (!data) throw new Error('Profil mangler')
      return data as ProfileExport
    },

    async getMessages(userId) {
      return collectPages(async (from, to) => {
        const { data, error } = await supabase
          .from('messages')
          .select('id, content, created_at, reply_to_message_id, deleted_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
        queryError('Beskeder kunne ikke hentes', error)
        return (data ?? []) as MessageExport[]
      })
    },

    async getPhotos(userId) {
      return collectPages(async (from, to) => {
        const { data, error } = await supabase
          .from('photos')
          .select(
            'id, storage_path, optimized_path, thumbnail_path, caption, event_id, created_at, optimization_status, optimization_attempts, optimization_started_at, optimization_completed_at, optimization_error',
          )
          .eq('uploaded_by', userId)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
        queryError('Billedmetadata kunne ikke hentes', error)
        return (data ?? []) as PhotoExport[]
      })
    },

    async getAttendance(userId) {
      return collectPages(async (from, to) => {
        const { data, error } = await supabase
          .from('event_attendance')
          .select(
            'event_id, created_at, event:events(id, title, description, location, start_at, end_at, created_at)',
          )
          .eq('user_id', userId)
          .order('created_at', { ascending: true })
          .order('event_id', { ascending: true })
          .range(from, to)
        queryError('Aktivitetstilmeldinger kunne ikke hentes', error)
        return (data ?? []).map(({ event, ...attendance }) => ({
          ...attendance,
          event: Array.isArray(event) ? (event[0] ?? null) : event,
        })) satisfies AttendanceExport[]
      })
    },

    async getPhotoDownloadUrls(photo) {
      async function sign(
        bucket: string,
        path: string | null,
      ): Promise<string | null> {
        if (!path) return null
        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
        queryError(`Kunne ikke signere ${bucket}/${path}`, error)
        if (!data?.signedUrl)
          throw new Error(`Signeret URL mangler for ${path}`)
        return data.signedUrl
      }

      const [original, optimized, thumbnail] = await Promise.all([
        sign('photos-original', photo.storage_path),
        sign('photos-optimized', photo.optimized_path),
        sign('photos-optimized', photo.thumbnail_path),
      ])
      if (!original) throw new Error('Originalbilledets signerede URL mangler')
      return { original, optimized, thumbnail } satisfies PhotoDownloadUrls
    },
  }

  return handleExportAccount(req, repository)
})
