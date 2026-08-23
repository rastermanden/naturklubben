// @vitest-environment node

import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const migrationUrl = new URL(
  '../../migrations/20260823194500_message_soft_deletion.sql',
  import.meta.url,
)

describe('message soft-deletion migration contract', () => {
  it('removes direct mutation access and exposes only the narrow RPC', async () => {
    const sql = await readFile(migrationUrl, 'utf8')

    expect(sql).toContain(
      'revoke update, delete on table public.messages from anon, authenticated',
    )
    expect(sql).toContain(
      'drop policy if exists "Owners can delete own messages"',
    )
    expect(sql).toContain(
      'drop policy if exists "Admins can delete any message"',
    )
    expect(sql).toMatch(
      /revoke all on function public[.]soft_delete_message\(uuid\)[\s\S]+from public, anon, authenticated/,
    )
    expect(sql).toContain(
      'grant execute on function public.soft_delete_message(uuid) to authenticated',
    )
  })

  it('allows only the owner or an admin and irreversibly clears content', async () => {
    const sql = await readFile(migrationUrl, 'utf8')

    expect(sql).toContain('target_message.user_id is distinct from actor_id')
    expect(sql).toContain('and not public.is_admin()')
    expect(sql).toMatch(
      /update public[.]messages\s+set content = '',\s+deleted_at = now\(\),\s+deleted_by = actor_id/,
    )
  })
})
