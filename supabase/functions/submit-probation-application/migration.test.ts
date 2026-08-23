// @vitest-environment node

import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const migrationUrl = new URL(
  '../../migrations/20260823161500_probation_application_rate_limits.sql',
  import.meta.url,
)

describe('probation rate-limit migration contract', () => {
  it('serializes overlapping signals in deterministic order', async () => {
    const sql = await readFile(migrationUrl, 'utf8')

    expect(sql).toContain(
      'pg_advisory_xact_lock(hashtextextended(lock_key, 0))',
    )
    expect(sql).toMatch(
      /for lock_key in[\s\S]+values\s+\('global'\),\s+\('email:' \|\| normalized_email_hash\),\s+\('ip:' \|\| exact_ip_hash\),\s+\('network:' \|\| client_network_hash\)[\s\S]+order by value[\s\S]+loop\s+perform pg_advisory_xact_lock/,
    )
    expect(
      sql.indexOf('insert into private.probation_submission_attempts'),
    ).toBeLessThan(sql.indexOf('if ip_short_count > 3'))
  })

  it('keeps the selected boundaries and a separate emergency global cap', async () => {
    const sql = await readFile(migrationUrl, 'utf8')

    expect(sql).toContain('if ip_short_count > 3')
    expect(sql).toContain('or ip_daily_count > 10')
    expect(sql).toContain('or email_daily_count > 3')
    expect(sql).toContain('or network_daily_count > 25')
    expect(sql).toContain('or global_daily_count > 1000')
    expect(sql).toContain('offset greatest(ip_short_count - 3, 0)')
    expect(sql).toContain('offset greatest(ip_daily_count - 10, 0)')
    expect(sql).toContain('offset greatest(email_daily_count - 3, 0)')
    expect(sql).toContain('offset greatest(network_daily_count - 25, 0)')
    expect(sql).toContain('offset greatest(global_daily_count - 1000, 0)')
  })

  it('returns the same accepted outcome for created, pending, and allowed e-mails', async () => {
    const sql = await readFile(migrationUrl, 'utf8')
    const uniqueNoOp = sql.match(
      /exception\s+when unique_violation then([\s\S]+?)return;/,
    )

    expect(uniqueNoOp?.[1]).toContain("'accepted'::text")
    expect(uniqueNoOp?.[1]).not.toContain("'conflict'")
    expect(sql.match(/'accepted'::text/g)).toHaveLength(2)
  })

  it('keeps both RPCs inaccessible to public roles', async () => {
    const sql = await readFile(migrationUrl, 'utf8')

    expect(sql).toMatch(
      /revoke all on function public[.]submit_probation_application\([\s\S]+from public, anon, authenticated;/,
    )
    expect(sql).toMatch(
      /revoke all on function public[.]submit_probation_application_limited\([\s\S]+from public, anon, authenticated;/,
    )
    expect(sql).toContain("if auth.role() <> 'service_role' then")
  })

  it('retains only hashed limiter events for 25 hours', async () => {
    const sql = await readFile(migrationUrl, 'utf8')

    expect(sql).toContain("where attempted_at <= now() - interval '25 hours'")
    expect(sql).not.toContain("'cleanup-probation-applications'")
    expect(sql).not.toMatch(/delete from public[.]probation_applications/)
  })
})
