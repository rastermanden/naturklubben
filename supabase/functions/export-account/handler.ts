import { isRecentLogin } from '../_shared/recentLogin.ts'

const MAX_LOGIN_AGE_MS = 5 * 60 * 1000
export const SIGNED_URL_TTL_SECONDS = 15 * 60
export const EXPORT_PAGE_SIZE = 500

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export interface ExportUser {
  id: string
  email?: string
  created_at: string
  last_sign_in_at?: string | null
}

export interface ProfileExport {
  id: string
  full_name: string | null
  avatar_url: string | null
  chat_color: string
  is_admin: boolean
  created_at: string
}

export interface MessageExport {
  id: string
  content: string
  created_at: string
  reply_to_message_id: string | null
  deleted_at: string | null
}

export interface PhotoExport {
  id: string
  storage_path: string
  optimized_path: string | null
  thumbnail_path: string | null
  caption: string | null
  event_id: string | null
  created_at: string
  optimization_status: string
  optimization_attempts: number
  optimization_started_at: string | null
  optimization_completed_at: string | null
  optimization_error: string | null
}

export interface PhotoDownloadUrls {
  original: string
  optimized: string | null
  thumbnail: string | null
}

export interface AttendanceExport {
  event_id: string
  created_at: string
  event: {
    id: string
    title: string
    description: string | null
    location: string | null
    start_at: string
    end_at: string | null
    created_at: string
  } | null
}

export interface AccountExportRepository {
  getUser(token: string): Promise<ExportUser | null>
  getProfile(userId: string): Promise<ProfileExport>
  getMessages(userId: string): Promise<MessageExport[]>
  getPhotos(userId: string): Promise<PhotoExport[]>
  getAttendance(userId: string): Promise<AttendanceExport[]>
  getPhotoDownloadUrls(photo: PhotoExport): Promise<PhotoDownloadUrls>
}

export async function collectPages<T>(
  loadPage: (from: number, to: number) => Promise<T[]>,
  pageSize = EXPORT_PAGE_SIZE,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new RangeError('pageSize skal være et positivt heltal')
  }

  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    const page = await loadPage(from, from + pageSize - 1)
    rows.push(...page)
    if (page.length < pageSize) return rows
  }
}

type ErrorCode = 'unauthorized' | 'recent_login_required' | 'export_failed'

function jsonError(code: ErrorCode, status: number, message: string) {
  return new Response(JSON.stringify({ code, error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get('Authorization')
  return header?.startsWith('Bearer ') ? header.slice(7) : null
}

export async function handleExportAccount(
  req: Request,
  repository: AccountExportRepository,
  nowMs = Date.now(),
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: corsHeaders,
    })
  }

  const token = bearerToken(req)
  if (!token) return jsonError('unauthorized', 401, 'Ikke autentificeret')

  const user = await repository.getUser(token)
  if (!user) return jsonError('unauthorized', 401, 'Ikke autentificeret')

  if (!isRecentLogin(user.last_sign_in_at, nowMs, MAX_LOGIN_AGE_MS)) {
    return jsonError(
      'recent_login_required',
      401,
      'Login skal bekræftes igen for at hente data',
    )
  }

  try {
    const [profile, messages, photos, attendance] = await Promise.all([
      repository.getProfile(user.id),
      repository.getMessages(user.id),
      repository.getPhotos(user.id),
      repository.getAttendance(user.id),
    ])
    const photosWithUrls = await Promise.all(
      photos.map(async (photo) => ({
        ...photo,
        download_urls: await repository.getPhotoDownloadUrls(photo),
      })),
    )
    const exportedAt = new Date(nowMs).toISOString()

    return new Response(
      JSON.stringify({
        format: 'naturklubben-account-export',
        version: 1,
        exported_at: exportedAt,
        signed_urls_expire_at: new Date(
          nowMs + SIGNED_URL_TTL_SECONDS * 1000,
        ).toISOString(),
        account: {
          id: user.id,
          email: user.email ?? null,
          created_at: user.created_at,
          last_sign_in_at: user.last_sign_in_at ?? null,
        },
        profile,
        messages,
        photos: photosWithUrls,
        activity_registrations: attendance,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="naturklubben-data-${exportedAt.slice(0, 10)}.json"`,
          'Cache-Control': 'no-store',
        },
      },
    )
  } catch (caught) {
    console.error('Dataudlevering fejlede', {
      userId: user.id,
      error: caught instanceof Error ? caught.message : String(caught),
    })
    return jsonError(
      'export_failed',
      500,
      'Dataudleveringen kunne ikke oprettes',
    )
  }
}
