/// <reference types="vite/client" />
import { registerCore, sessionIdentity } from '@convex-dev/auth/test'
import { registerPassword } from '@convex-dev/auth/components/password/test'
import {
  registerEmail,
  registerResendStub,
  sentEmails,
} from '@convex-dev/auth/components/email/test'
import { convexTest, type TestConvex } from 'convex-test'
import type { GenericSchema, SchemaDefinition } from 'convex/server'
import { components } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import schema from '../convex/schema'

const modules = import.meta.glob('../convex/**/*.ts')

export function testEnv(): Record<string, string | undefined> {
  const g = globalThis as {
    process?: { env?: Record<string, string | undefined> }
  }
  if (!g.process) g.process = { env: {} }
  if (!g.process.env) g.process.env = {}
  return g.process.env
}

export function registerAuthComponents<
  S extends SchemaDefinition<GenericSchema, boolean>,
>(t: TestConvex<S>): TestConvex<S> {
  testEnv().CONVEX_CLOUD_URL ??= 'https://test.convex.cloud'
  const untyped = t as unknown as TestConvex<
    SchemaDefinition<GenericSchema, boolean>
  >
  registerCore(untyped)
  registerPassword(untyped)
  registerEmail(untyped)
  registerResendStub(untyped)
  return t
}

export function createTestConvex() {
  return registerAuthComponents(
    convexTest(schema, modules),
  ).withRequestMetadata({
    ip: '127.0.0.1',
  })
}

export type TestConvexInstance = ReturnType<typeof createTestConvex>

export async function withAuthUser(
  t: TestConvexInstance,
  userId: Id<'users'> | string,
) {
  testEnv().CONVEX_CLOUD_URL ??= 'https://test.convex.cloud'
  const tokens = await t.mutation(
    components.auth.public._internal_dangerous_signIn,
    {
      claims: { method: 'emailPassword', profile: {} },
      componentPath: 'auth',
      userId,
      accessTokenTtlSeconds: 60,
      refreshInactivityTimeoutSeconds: 30 * 24 * 60 * 60,
      sessionMaxLifetimeSeconds: 30 * 24 * 60 * 60,
    },
  )
  return t
    .withRequestMetadata({ ip: '127.0.0.1' })
    .withIdentity(sessionIdentity(tokens))
}

export async function sentTestEmails(t: TestConvexInstance) {
  return await sentEmails(
    t as unknown as TestConvex<SchemaDefinition<GenericSchema, boolean>>,
  )
}

export {
  registerCore,
  registerEmail,
  registerPassword,
  registerResendStub,
  sentEmails,
  sessionIdentity,
}
