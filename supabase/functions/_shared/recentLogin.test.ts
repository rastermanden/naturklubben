// Enhedstests for isRecentLogin (#86). Kør med `deno test supabase/functions`.
//
// Deno's indbyggede testkører er ikke koblet til projektets øvrige
// testopsætning (Vitest, som kun dækker src/ -- se package.json) -- Edge
// Functions kører i Deno, ikke i det Node/Vite-byggede frontend-miljø, og har
// derfor deres egen testkommando. Ingen ekstra afhængighed er nødvendig:
// node:assert er indbygget i Deno's Node-kompatibilitetslag.

import { strict as assert } from 'node:assert'
import { isRecentLogin } from './recentLogin.ts'

const NOW = Date.parse('2026-08-23T12:00:00.000Z')
const FIVE_MIN_MS = 5 * 60 * 1000

Deno.test('isRecentLogin: login for få sekunder siden er frisk', () => {
  const lastSignInAt = new Date(NOW - 10_000).toISOString()
  assert.equal(isRecentLogin(lastSignInAt, NOW, FIVE_MIN_MS), true)
})

Deno.test('isRecentLogin: login præcis på grænsen tæller som frisk', () => {
  const lastSignInAt = new Date(NOW - FIVE_MIN_MS).toISOString()
  assert.equal(isRecentLogin(lastSignInAt, NOW, FIVE_MIN_MS), true)
})

Deno.test('isRecentLogin: login lige over grænsen er ikke frisk', () => {
  const lastSignInAt = new Date(NOW - FIVE_MIN_MS - 1).toISOString()
  assert.equal(isRecentLogin(lastSignInAt, NOW, FIVE_MIN_MS), false)
})

Deno.test('isRecentLogin: login for længe siden er ikke frisk', () => {
  const lastSignInAt = new Date(NOW - 60 * 60 * 1000).toISOString()
  assert.equal(isRecentLogin(lastSignInAt, NOW, FIVE_MIN_MS), false)
})

Deno.test('isRecentLogin: manglende last_sign_in_at er ikke frisk', () => {
  assert.equal(isRecentLogin(null, NOW, FIVE_MIN_MS), false)
  assert.equal(isRecentLogin(undefined, NOW, FIVE_MIN_MS), false)
})

Deno.test('isRecentLogin: ugyldig dato-streng er ikke frisk', () => {
  assert.equal(isRecentLogin('not-a-date', NOW, FIVE_MIN_MS), false)
})

Deno.test('isRecentLogin: et tidspunkt i fremtiden er ikke frisk', () => {
  assert.equal(
    isRecentLogin(new Date(NOW + 1).toISOString(), NOW, FIVE_MIN_MS),
    false,
  )
})
