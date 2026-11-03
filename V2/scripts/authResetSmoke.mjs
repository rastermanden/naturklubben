/**
 * Opretter eller fjerner én @agentmail.to-testkonto på det deployment,
 * CONVEX_DEPLOY_KEY peger på. Adgangskoden genereres her og logges ikke.
 * Nulstillingsmailen sendes bagefter fra et almindeligt auth-kald, ikke her.
 */
import { spawn } from 'node:child_process'
import { hashSync } from 'bcryptjs'

const action = process.argv[2] || process.env.AUTH_SMOKE_ACTION
const email = (process.argv[3] || process.env.AUTH_SMOKE_EMAIL || '')
  .trim()
  .toLowerCase()
if (process.env.AUTH_SMOKE_CONFIRM !== 'RESET_SMOKE') {
  console.error('Mangler bekræftelse.')
  process.exit(1)
}
if (!email.endsWith('@agentmail.to')) {
  console.error('Kun en @agentmail.to-adresse.')
  process.exit(1)
}
if (action !== 'create' && action !== 'delete') {
  console.error('action skal være create eller delete.')
  process.exit(1)
}

function scrub(text) {
  return text
    .replace(/\$2[aby]\$[^\s"]+/g, '[hash]')
    .replace(/eyJ[A-Za-z0-9._-]+/g, '[jwt]')
}

function convex(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['convex', 'run', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    let err = ''
    child.stdout.on('data', (chunk) => {
      out += chunk
    })
    child.stderr.on('data', (chunk) => {
      err += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => {
      const combined = scrub(`${out}\n${err}`)
      if (code !== 0) reject(new Error(combined.slice(0, 500)))
      else resolve(scrub(out).trim())
    })
  })
}

if (action === 'create') {
  const password = `smoke-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
  const bcryptHash = hashSync(password, 8)
  const payload = JSON.stringify({
    confirm: 'IMPORT_BCRYPT_HASHES',
    accounts: [{ email, bcryptHash, name: 'Reset-test' }],
  })
  const result = await convex(['passwords:importHashes', payload])
  console.log(`Oprettede testkonto. importHashes=${result}`)
} else {
  const payload = JSON.stringify({
    confirm: 'DELETE_SMOKE_AUTH_USER',
    email,
  })
  const result = await convex(['passwords:deleteSmokeAuthUser', payload])
  console.log(`Fjernede testkonto. ${result}`)
}
