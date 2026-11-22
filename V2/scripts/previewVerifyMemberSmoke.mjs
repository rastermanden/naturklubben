/**
 * Verificerer at preview-deploymentets egen `POST /preview/verify-member`-rute
 * godkender CI-testbrugeren og afviser forkert adgangskode og ukendt e-mail med
 * identisk 401-svar. Hemmeligheder skrives aldrig ud.
 */

function normalizePreviewEmail(value) {
  return value
    .replace(/[\r\n]/g, '')
    .trim()
    .toLowerCase()
}

function normalizePreviewPassword(value) {
  return value.replace(/[\r\n]+$/g, '')
}

const email = normalizePreviewEmail(process.env.PREVIEW_TEST_EMAIL ?? '')
const password = normalizePreviewPassword(
  process.env.PREVIEW_TEST_PASSWORD ?? '',
)
const siteUrl = (process.env.PREVIEW_CONVEX_SITE_URL ?? '').replace(/\/+$/, '')

if (!email || !password || !siteUrl) {
  console.error(
    'Mangler PREVIEW_TEST_EMAIL, PREVIEW_TEST_PASSWORD eller PREVIEW_CONVEX_SITE_URL.',
  )
  process.exit(1)
}

if (siteUrl.includes('quaint-parakeet-652')) {
  console.error('PREVIEW_CONVEX_SITE_URL må ikke pege på produktion.')
  process.exit(1)
}

function redact(value) {
  return String(value)
    .split(email)
    .join('[redacted]')
    .split(password)
    .join('[redacted]')
}

async function postVerify(payload) {
  const response = await fetch(`${siteUrl}/preview/verify-member`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const text = await response.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(
      `Forventede JSON fra /preview/verify-member (status ${response.status}): ${redact(text).slice(0, 120)}`,
    )
  }
  return { response, json }
}

const valid = await postVerify({ email, password })
if (
  valid.response.status !== 200 ||
  valid.response.headers.get('cache-control') !== 'no-store' ||
  valid.json?.ok !== true ||
  valid.json?.member?.isAdmin !== false ||
  valid.json?.member?.fullName !== 'Preview-tester'
) {
  throw new Error(
    `Gyldig testbruger fejlede /preview/verify-member: status=${valid.response.status} body=${redact(JSON.stringify(valid.json))}`,
  )
}

const wrongPassword = await postVerify({
  email,
  password: `${password}-forkert`,
})
if (
  wrongPassword.response.status !== 401 ||
  wrongPassword.json?.ok !== false ||
  Object.keys(wrongPassword.json ?? {}).length !== 1
) {
  throw new Error(
    `Forkert adgangskode gav uventet svar: status=${wrongPassword.response.status} body=${redact(JSON.stringify(wrongPassword.json))}`,
  )
}

const uniqueUnknownEmail = `ukendt-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
const unknownEmail = await postVerify({
  email: uniqueUnknownEmail,
  password: `${password}-forkert`,
})
if (
  unknownEmail.response.status !== 401 ||
  unknownEmail.json?.ok !== false ||
  Object.keys(unknownEmail.json ?? {}).length !== 1
) {
  throw new Error(
    `Ukendt e-mail gav uventet svar: status=${unknownEmail.response.status} body=${redact(JSON.stringify(unknownEmail.json))}`,
  )
}

console.log(`verify-member smoke bestod mod ${siteUrl}.`)
