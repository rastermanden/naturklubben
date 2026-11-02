/**
 * Læser V1 i Supabase og skriver det til det Convex-deployment, CLI'en
 * peger på. Supabase ændres ikke. Kørslen kan gentages.
 *
 * Hemmeligheder skrives ikke ud. Argumenter med hashes sendes til Convex
 * uden at blive printet. Importen kan køres igen lige før skiftet.
 */
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const project = process.env.SUPABASE_PROJECT_REF
const token = process.env.SUPABASE_ACCESS_TOKEN
const target = process.env.MIGRATE_TARGET
const confirmProd = process.env.CONFIRM_PROD_IMPORT

if (!project || !token) {
  console.error('Mangler Supabase-adgang.')
  process.exit(1)
}
if (target !== 'rehearsal' && target !== 'prod') {
  console.error('MIGRATE_TARGET skal være rehearsal eller prod.')
  process.exit(1)
}
if (target === 'prod' && confirmProd !== 'IMPORT_V1_TO_PROD') {
  console.error('Prod-import mangler bekræftelse.')
  process.exit(1)
}

const previewArgs =
  target === 'rehearsal' ? ['--preview-name', 'migration-rehearsal'] : []

function convex(args, input) {
  const result = spawnSync(
    'npx',
    ['convex', ...args, ...previewArgs, '--typecheck', 'disable'],
    {
      cwd: new URL('..', import.meta.url).pathname,
      encoding: 'utf8',
      input,
      env: process.env,
    },
  )
  const combined = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  if (result.status !== 0) {
    const err = combined
      .replace(/re_[A-Za-z0-9_-]+/g, '[key]')
      .replace(/eyJ[A-Za-z0-9._-]+/g, '[jwt]')
      .replace(/\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{20,}/g, '[hash]')
    console.error(err.slice(0, 2000))
    process.exit(result.status ?? 1)
  }
  return combined
}

async function sql(query) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${project}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    },
  )
  if (!response.ok) {
    console.error(`Supabase-kald fejlede: HTTP ${response.status}`)
    process.exit(1)
  }
  return await response.json()
}

async function serviceKey() {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${project}/api-keys`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!response.ok) {
    console.error(`Kunne ikke hente storage-nøgle: HTTP ${response.status}`)
    process.exit(1)
  }
  const keys = await response.json()
  const secret = keys.find((key) => key.name === 'service_role')?.api_key
  if (!secret) {
    console.error('Storage-nøgle manglede.')
    process.exit(1)
  }
  return secret
}

console.log(`Mål: ${target}`)
const deploy = convex(['deploy', '--typecheck', 'disable'])
const url = (deploy.match(/https:\/\/[a-z0-9-]+\.convex\.cloud/) ?? [])[0]
if (!url) {
  console.error('Fandt ikke deployment-URL.')
  process.exit(1)
}
const prod = url.includes('quaint-parakeet-652')
if (target === 'prod' && !prod) {
  console.error('Prod-import ramte ikke produktions-deploymentet.')
  process.exit(1)
}
if (target === 'rehearsal' && prod) {
  console.error('Prøven må ikke ramme produktion.')
  process.exit(1)
}
console.log(`Deployment ok (${prod ? 'prod' : 'rehearsal'})`)

const users = await sql(`
  select u.id, u.email, u.encrypted_password as hash,
         p.full_name, p.is_admin, p.chat_color, p.pronouns, p.causes,
         p.chat_notification_preference, p.feature_notifications_enabled,
         p.created_at, p.avatar_url
  from auth.users u
  left join public.profiles p on p.id = u.id
`)
for (const user of users) {
  if (
    String(user.email ?? '')
      .toLowerCase()
      .endsWith('@agentmail.to')
  ) {
    console.error('Udtrækket indeholder test-indbakken.')
    process.exit(1)
  }
}

const [
  allowed,
  activities,
  events,
  attendance,
  tasks,
  messages,
  reactions,
  reads,
  photos,
  observations,
  announcements,
  announcementReads,
  pushSubs,
  announcementDeliveries,
  pushDeliveries,
  games,
  tournaments,
  participants,
  matches,
  gamesInMatch,
  badges,
  nominations,
  approvals,
  datePolls,
  dateOptions,
  dateVotes,
  probation,
  vapidRows,
  objects,
] = await Promise.all([
  sql('select email, note, created_at, is_admin from public.allowed_emails'),
  sql('select * from public.activities'),
  sql(
    'select id, title, description, location, start_at, end_at, created_by, created_at, is_public, max_participants from public.events',
  ),
  sql(
    'select event_id, user_id, created_at, status from public.event_attendance',
  ),
  sql('select * from public.event_tasks'),
  sql(
    'select id, user_id, content, created_at, reply_to_message_id, deleted_at, message_type, mentions, room, written_at from public.messages',
  ),
  sql('select * from public.message_reactions'),
  sql('select * from public.chat_read_positions'),
  sql('select * from public.photos'),
  sql('select * from public.observations'),
  sql('select * from public.feature_announcements'),
  sql('select * from public.feature_announcement_reads'),
  sql(
    'select id, user_id, endpoint, p256dh, auth, created_at, updated_at from public.push_subscriptions',
  ),
  sql('select * from public.feature_announcement_push_deliveries'),
  sql('select * from public.push_deliveries'),
  sql('select * from public.game_scores'),
  sql('select * from public.tournaments'),
  sql('select * from public.tournament_participants'),
  sql('select * from public.tournament_matches'),
  sql('select * from public.tournament_games'),
  sql('select * from public.badges'),
  sql('select * from public.badge_nominations'),
  sql('select * from public.badge_nomination_approvals'),
  sql('select * from public.date_polls'),
  sql('select * from public.date_poll_options'),
  sql('select * from public.date_poll_votes'),
  sql(
    'select id::text as id, full_name, email, motivation, status, created_at, reviewed_at, reviewed_by::text as reviewed_by, notification_token, admin_notification_attempts, decision_notification_attempts from public.probation_applications',
  ),
  sql(
    'select public_key, private_key, created_at from public.push_vapid_keys limit 1',
  ),
  sql('select bucket_id, name from storage.objects'),
])

const sourceCounts = {
  users: users.length,
  allowed: allowed.length,
  activities: activities.length,
  events: events.length,
  photos: photos.length,
  messages: messages.length,
  files: objects.length,
}
console.log(`Kilde: ${JSON.stringify(sourceCounts)}`)
console.log(`probation ${probation.length} id ${typeof probation[0]?.id}`)

const key = await serviceKey()
const files = {}
for (const object of objects) {
  const path = `${object.bucket_id}/${object.name}`
  const encoded = object.name
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
  const response = await fetch(
    `https://${project}.supabase.co/storage/v1/object/${object.bucket_id}/${encoded}`,
    { headers: { Authorization: `Bearer ${key}` } },
  )
  if (!response.ok) {
    console.error(`Fil manglede i ${object.bucket_id}: HTTP ${response.status}`)
    process.exit(1)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  const type =
    response.headers.get('content-type') ?? 'application/octet-stream'
  const args = JSON.stringify({
    contentType: type.split(';')[0],
  })
  writeFileSync('/tmp/migrate-upload-args.json', args)
  const urlOut = convex(['run', 'migrateV1:makeUploadUrl', '{}'])
  const matches = [...urlOut.matchAll(/https:\/\/\S+/g)]
  const uploadUrl = (matches.at(-1)?.[0] ?? '').replace(/["',]/g, '')
  if (!uploadUrl.startsWith('https://')) {
    console.error('Upload-adresse blev ikke oprettet.')
    process.exit(1)
  }
  const uploaded = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': type.split(';')[0] },
    body: bytes,
  })
  if (!uploaded.ok) {
    console.error(`Upload fejlede: HTTP ${uploaded.status}`)
    process.exit(1)
  }
  const stored = await uploaded.json()
  files[object.name] = stored.storageId
  files[path] = stored.storageId
}
console.log(`Filer lagret: ${objects.length}`)

function avatarPath(url) {
  if (typeof url !== 'string') return undefined
  const marker = '/avatars/'
  const index = url.indexOf(marker)
  if (index === -1) return undefined
  return decodeURIComponent(url.slice(index + marker.length).split('?')[0])
}
for (const user of users) user.avatar_path = avatarPath(user.avatar_url)

const bundle = {
  users,
  allowed,
  activities,
  events,
  attendance,
  tasks,
  messages,
  reactions,
  reads,
  photos,
  observations,
  announcements,
  announcementReads,
  pushSubs,
  announcementDeliveries,
  pushDeliveries,
  games,
  tournaments,
  participants,
  matches,
  gamesInMatch,
  badges,
  nominations,
  approvals,
  datePolls,
  dateOptions,
  dateVotes,
  probation,
  vapid: vapidRows[0] ?? null,
  files,
}
const payload = JSON.stringify({ confirm: 'IMPORT_V1', bundle })
writeFileSync('/tmp/migrate-payload.json', payload, { mode: 0o600 })
const imported = convex(['run', 'migrateV1:importBundle', payload])
console.log(imported.replace(/\$2[aby]\$[^\s"]+/g, '[hash]').slice(0, 500))
const report = convex(['run', 'migrateV1:report', '{}'])
console.log(report.replace(/\$2[aby]\$[^\s"]+/g, '[hash]'))
