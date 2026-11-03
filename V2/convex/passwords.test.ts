/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'
import { ConvexError } from 'convex/values'
import { convexTest } from 'convex-test'
import { Scrypt } from 'lucia'
import { internal } from './_generated/api'
import schema from './schema'
import { isBcryptHash } from './passwordCrypto'
import {
  PASSWORD_IMPORT_CONFIRM,
  SMOKE_DELETE_CONFIRM,
  rehashImportedPassword,
  writeImportedPassword,
} from './passwords'

const modules = import.meta.glob('./**/*.ts')

const BCRYPT_ABC =
  '$2a$06$If6bvum7DFjUnE9p2uDeDu0YHzrHM6tf.iqN8.yx.jNN1ILEf7h0i'

describe('importerede adgangskoder', () => {
  it('gemmer bcrypt-hashen urørt og skriver den om ved rigtigt login', async () => {
    const t = convexTest(schema, modules)
    await t.run(async (ctx) => {
      await writeImportedPassword(ctx, {
        email: 'Medlem@Example.com',
        bcryptHash: BCRYPT_ABC,
        name: 'Medlem',
      })
    })

    const before = await t.run(async (ctx) => {
      return await ctx.db.query('authAccounts').collect()
    })
    expect(before).toHaveLength(1)
    expect(before[0]?.providerAccountId).toBe('medlem@example.com')
    expect(before[0]?.secret).toBe(BCRYPT_ABC)
    expect(before[0]?.emailVerified).toBe('medlem@example.com')

    const mismatch = await t.run(async (ctx) => {
      return await rehashImportedPassword(ctx, 'medlem@example.com', 'forkert')
    })
    expect(mismatch).toBe('mismatch')

    const rehashed = await t.run(async (ctx) => {
      return await rehashImportedPassword(ctx, 'medlem@example.com', 'abc')
    })
    expect(rehashed).toBe('rehashed')

    const after = await t.run(async (ctx) => {
      const account = await ctx.db.query('authAccounts').unique()
      return account?.secret ?? ''
    })
    expect(isBcryptHash(after)).toBe(false)
    expect(await new Scrypt().verify(after, 'abc')).toBe(true)
  })

  it('tager is_admin med fra Supabase til listen og en eksisterende profil', async () => {
    const t = convexTest(schema, modules)
    const userId = await t.run(async (ctx) => {
      return await writeImportedPassword(ctx, {
        email: 'Admin@Example.com',
        bcryptHash: BCRYPT_ABC,
        isAdmin: true,
      })
    })
    await t.run(async (ctx) => {
      await ctx.db.insert('profiles', {
        userId,
        fullName: 'Admin',
        isAdmin: false,
        chatColor: '#16a34a',
        causes: [],
        chatNotificationPreference: 'all',
        featureNotificationsEnabled: true,
        createdAt: 1,
      })
      await writeImportedPassword(ctx, {
        email: 'admin@example.com',
        bcryptHash: BCRYPT_ABC,
        isAdmin: true,
      })
    })
    const rows = await t.run(async (ctx) => ({
      allowed: await ctx.db.query('allowedEmails').collect(),
      profiles: await ctx.db.query('profiles').collect(),
    }))
    expect(rows.allowed).toEqual([
      expect.objectContaining({
        email: 'admin@example.com',
        isAdmin: true,
      }),
    ])
    expect(rows.profiles[0]?.isAdmin).toBe(true)
  })

  it('nægter import uden bekræftelsessætningen', async () => {
    const t = convexTest(schema, modules)
    const failure = await t
      .mutation(internal.passwords.importHashes, {
        confirm: 'nej',
        accounts: [{ email: 'a@example.com', bcryptHash: BCRYPT_ABC }],
      })
      .then(
        () => null,
        (error: unknown) => error,
      )
    expect(failure).toBeInstanceOf(ConvexError)
    expect(JSON.parse((failure as ConvexError<string>).data)).toBe(
      'PASSWORD_IMPORT_NOT_CONFIRMED',
    )
  })

  it('importerer, når bekræftelsen er med', async () => {
    const t = convexTest(schema, modules)
    const count = await t.mutation(internal.passwords.importHashes, {
      confirm: PASSWORD_IMPORT_CONFIRM,
      accounts: [{ email: 'a@example.com', bcryptHash: BCRYPT_ABC }],
    })
    expect(count).toBe(1)
  })

  it('sletter kun en agentmail-testkonto', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(internal.passwords.importHashes, {
      confirm: PASSWORD_IMPORT_CONFIRM,
      accounts: [
        {
          email: 'naturklubben-reset-smoke@agentmail.to',
          bcryptHash: BCRYPT_ABC,
        },
      ],
    })
    const removed = await t.mutation(internal.passwords.deleteSmokeAuthUser, {
      confirm: SMOKE_DELETE_CONFIRM,
      email: 'Naturklubben-Reset-Smoke@agentmail.to',
    })
    expect(removed.deletedAccounts).toBe(1)
    const left = await t.run(async (ctx) =>
      ctx.db.query('authAccounts').collect(),
    )
    expect(left).toHaveLength(0)

    const refused = await t
      .mutation(internal.passwords.deleteSmokeAuthUser, {
        confirm: SMOKE_DELETE_CONFIRM,
        email: 'martin.martinjensen@gmail.com',
      })
      .then(
        () => null,
        (error: unknown) => error,
      )
    expect(refused).toBeInstanceOf(ConvexError)
    expect(JSON.parse((refused as ConvexError<string>).data)).toBe(
      'SMOKE_EMAIL_ONLY',
    )
  })

  it('rapporterer en ugyldig kode som udløbet uden at vise den', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(internal.passwords.importHashes, {
      confirm: PASSWORD_IMPORT_CONFIRM,
      accounts: [
        {
          email: 'martin.martinjensen@gmail.com',
          bcryptHash: BCRYPT_ABC,
        },
      ],
    })
    const before = await t.query(internal.passwords.resetCodeStatus, {
      email: 'Martin.MartinJensen@gmail.com',
    })
    expect(before).toEqual({ account: true, unexpiredCode: false })
  })
})
