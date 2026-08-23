// @vitest-environment node

import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const migrationUrl = new URL(
  '../../migrations/20260823212500_events_end_after_start.sql',
  import.meta.url,
)

describe('event time range migration contract', () => {
  it('allows a missing or equal end time but rejects an earlier end time', async () => {
    const sql = await readFile(migrationUrl, 'utf8')

    expect(sql).toContain('add constraint events_end_after_start')
    expect(sql).toMatch(/check\s*[(]end_at is null or end_at >= start_at[)]/)
  })
})
