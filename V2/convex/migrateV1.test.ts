/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'
import { convexTest } from 'convex-test'
import { internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const BCRYPT = '$2a$06$If6bvum7DFjUnE9p2uDeDu0YHzrHM6tf.iqN8.yx.jNN1ILEf7h0i'

describe('importBundle', () => {
  it('nægter uden bekræftelse og nægter test-indbakken', async () => {
    const t = convexTest(schema, modules)
    await expect(
      t.mutation(internal.migrateV1.importBundle, {
        confirm: 'nej',
        bundle: {},
      }),
    ).rejects.toThrow('IMPORT_NOT_CONFIRMED')
    await expect(
      t.mutation(internal.migrateV1.importBundle, {
        confirm: 'IMPORT_V1',
        bundle: {
          users: [
            {
              id: 'u1',
              email: 'naturklubben-test@agentmail.to',
              hash: BCRYPT,
            },
          ],
        },
      }),
    ).rejects.toThrow('IMPORT_REFUSED_TEST_DATA')
  })

  it('kan køres to gange uden at fordoble aktiviteten', async () => {
    const t = convexTest(schema, modules)
    const bundle = {
      activities: [
        {
          id: 'a1',
          title: 'Hornfisk',
          description: 'Tur',
          sort_order: 5,
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
    }
    await t.mutation(internal.migrateV1.importBundle, {
      confirm: 'IMPORT_V1',
      bundle,
    })
    const second = await t.mutation(internal.migrateV1.importBundle, {
      confirm: 'IMPORT_V1',
      bundle,
    })
    expect(second.reused).toBeGreaterThan(0)
    const rows = await t.run(async (ctx) =>
      ctx.db.query('activities').collect(),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.title).toBe('Hornfisk')
  })
})
