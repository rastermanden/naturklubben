import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  collectPages,
  handleExportAccount,
  type AccountExportRepository,
  type PhotoExport,
} from '../export-account/handler.ts'

const now = new Date('2026-08-23T18:00:00.000Z').getTime()
const userId = '11111111-1111-4111-8111-111111111111'
const photo: PhotoExport = {
  id: 'photo-1',
  storage_path: `${userId}/photo.jpg`,
  optimized_path: `${userId}/photo.webp`,
  thumbnail_path: null,
  caption: 'Skovtur',
  event_id: null,
  created_at: '2026-08-01T10:00:00.000Z',
  optimization_status: 'ready',
  optimization_attempts: 1,
  optimization_started_at: '2026-08-01T10:00:01.000Z',
  optimization_completed_at: '2026-08-01T10:00:02.000Z',
  optimization_error: null,
}

function repository(overrides: Partial<AccountExportRepository> = {}) {
  const seenUserIds: string[] = []
  const base: AccountExportRepository = {
    getUser: async () => ({
      id: userId,
      email: 'medlem@example.com',
      created_at: '2026-01-01T00:00:00.000Z',
      last_sign_in_at: new Date(now - 60_000).toISOString(),
    }),
    getProfile: async (id) => {
      seenUserIds.push(id)
      return {
        id,
        full_name: 'Medlem',
        avatar_url: null,
        chat_color: '#166534',
        is_admin: false,
        created_at: '2026-01-01T00:00:00.000Z',
      }
    },
    getMessages: async (id) => {
      seenUserIds.push(id)
      return [
        {
          id: 'message-1',
          content: 'Hej',
          created_at: '2026-08-01T10:00:00.000Z',
          reply_to_message_id: null,
          deleted_at: null,
        },
      ]
    },
    getPhotos: async (id) => {
      seenUserIds.push(id)
      return [photo]
    },
    getAttendance: async (id) => {
      seenUserIds.push(id)
      return []
    },
    getPhotoDownloadUrls: async () => ({
      original: 'https://storage.test/original?token=short-lived',
      optimized: 'https://storage.test/optimized?token=short-lived',
      thumbnail: null,
    }),
    ...overrides,
  }
  return { repository: base, seenUserIds }
}

Deno.test(
  'exports only data loaded with the authenticated user id',
  async () => {
    const { repository: repo, seenUserIds } = repository()
    const response = await handleExportAccount(
      new Request('https://example.test/export-account', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid-token' },
      }),
      repo,
      now,
    )
    const body = await response.json()

    assertEquals(response.status, 200)
    assertEquals(seenUserIds, [userId, userId, userId, userId])
    assertEquals(body.account.email, 'medlem@example.com')
    assertEquals(body.messages[0].content, 'Hej')
    assertEquals(
      body.photos[0].download_urls.original,
      'https://storage.test/original?token=short-lived',
    )
    assertEquals(body.signed_urls_expire_at, '2026-08-23T18:15:00.000Z')
    assert(response.headers.get('Cache-Control') === 'no-store')
    assert(response.headers.get('Content-Disposition')?.includes('.json'))
  },
)

Deno.test('rejects a session without a fresh reauthentication', async () => {
  const { repository: repo, seenUserIds } = repository({
    getUser: async () => ({
      id: userId,
      created_at: '2026-01-01T00:00:00.000Z',
      last_sign_in_at: new Date(now - 5 * 60_000 - 1).toISOString(),
    }),
  })
  const response = await handleExportAccount(
    new Request('https://example.test/export-account', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-token' },
    }),
    repo,
    now,
  )

  assertEquals(response.status, 401)
  assertEquals((await response.json()).code, 'recent_login_required')
  assertEquals(seenUserIds, [])
})

Deno.test('rejects requests without authentication', async () => {
  const { repository: repo } = repository()
  const response = await handleExportAccount(
    new Request('https://example.test/export-account', { method: 'POST' }),
    repo,
    now,
  )

  assertEquals(response.status, 401)
  assertEquals((await response.json()).code, 'unauthorized')
})

Deno.test('collectPages returns every row across full pages', async () => {
  const allRows = ['a', 'b', 'c', 'd', 'e']
  const requestedRanges: Array<[number, number]> = []

  const rows = await collectPages((from, to) => {
    requestedRanges.push([from, to])
    return Promise.resolve(allRows.slice(from, to + 1))
  }, 2)

  assertEquals(rows, allRows)
  assertEquals(requestedRanges, [
    [0, 1],
    [2, 3],
    [4, 5],
  ])
})
