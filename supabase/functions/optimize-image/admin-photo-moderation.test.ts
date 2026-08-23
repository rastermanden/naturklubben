// @vitest-environment node

import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const migrationUrl = new URL(
  '../../migrations/20260823215500_admin_photo_moderation.sql',
  import.meta.url,
)

describe('admin photo moderation migration contract', () => {
  it('allows only the uploader or an administrator to claim deletion', async () => {
    const sql = await readFile(migrationUrl, 'utf8')

    expect(sql).toContain(
      '(photo.uploaded_by = p_user_id or actor_profile.is_admin)',
    )
    expect(sql).toContain(
      'grant execute on function public.claim_photo_deletion(uuid, uuid)',
    )
    expect(sql).toContain('to service_role')
  })

  it('keeps an admin-readable audit trail for moderation outcomes', async () => {
    const sql = await readFile(migrationUrl, 'utf8')

    expect(sql).toContain('create table public.photo_moderation_log')
    expect(sql).toContain('using (public.is_admin())')
    expect(sql).toMatch(
      /set status = 'completed',[\s\S]+where photo_id = p_photo_id/,
    )
    expect(sql).toMatch(
      /set status = 'failed',[\s\S]+where photo_id = p_photo_id/,
    )
    expect(sql).toContain(
      "error = 'Sletningen blev overhalet af et nyt forsøg.'",
    )
    expect(sql).toMatch(
      /or not exists \(\s+select 1 from public[.]photos where id = p_photo_id/,
    )
  })
})
