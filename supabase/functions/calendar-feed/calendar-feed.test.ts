// @vitest-environment node

import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const functionUrl = new URL('./index.ts', import.meta.url)
const migrationUrl = new URL(
  '../../migrations/20260823212500_public_calendar_feed.sql',
  import.meta.url,
)
const configUrl = new URL('../../config.toml', import.meta.url)
const workflowUrl = new URL(
  '../../../.github/workflows/deploy-functions.yml',
  import.meta.url,
)

describe('public calendar feed contract', () => {
  it('exposes only data-minimized event fields to anon', async () => {
    const sql = await readFile(migrationUrl, 'utf8')
    const viewProjection = sql.match(
      /create view public[.]calendar_feed_events[\s\S]+?as\s+select([\s\S]+?)from public[.]events/,
    )?.[1]

    expect(viewProjection).toMatch(
      /^\s+id,\s+title,\s+location,\s+start_at,\s+end_at\s+$/,
    )
    expect(viewProjection).not.toContain('description')
    expect(sql).toContain('security_invoker = true')
    expect(sql).toMatch(
      /grant select \(id, title, location, start_at, end_at\)\s+on table public[.]events\s+to anon/,
    )
    expect(sql).toContain(
      'grant select on table public.calendar_feed_events to anon',
    )
  })

  it('uses the publishable key and public view without descriptions', async () => {
    const source = await readFile(functionUrl, 'utf8')

    expect(source).toContain("Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')")
    expect(source).not.toContain('SUPABASE_ANON_KEY')
    expect(source).toContain(".from('calendar_feed_events')")
    expect(source).not.toContain('DESCRIPTION:')
  })

  it('disables gateway JWT verification in preview and production', async () => {
    const [config, workflow] = await Promise.all([
      readFile(configUrl, 'utf8'),
      readFile(workflowUrl, 'utf8'),
    ])

    expect(config).toMatch(
      /\[functions[.]calendar-feed]\s+enabled = true\s+verify_jwt = false/,
    )
    expect(workflow).toMatch(
      /supabase functions deploy calendar-feed --no-verify-jwt/,
    )
  })
})
