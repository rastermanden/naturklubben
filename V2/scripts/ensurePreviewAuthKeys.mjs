/**
 * Convex Auth kan ikke udstede en session uden JWT_PRIVATE_KEY og JWKS.
 * `npx convex dev` sætter dem lokalt, men hverken et preview eller prod
 * arver dem. Nøglerne sættes kun, hvis de mangler, og de skrives ikke i loggen.
 * Kald med `pr-<nr>` eller `prod`.
 */
import { spawn } from 'node:child_process'
import { exportJWK, exportPKCS8, generateKeyPair } from 'jose'

const target = process.argv[2]
const previewArgs =
  target === 'prod'
    ? []
    : target?.startsWith('pr-')
      ? ['--preview-name', target]
      : null
if (previewArgs === null) {
  console.error('Brug et preview-navn (pr-…) eller prod.')
  process.exit(1)
}

function convex(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['convex', ...args, ...previewArgs], {
      stdio: ['pipe', 'pipe', 'inherit'],
    })
    let out = ''
    child.stdout.on('data', (chunk) => {
      out += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`convex exited ${code}`))
      else resolve(out)
    })
    child.stdin.end(input ?? '')
  })
}

const names = await convex(['env', 'list', '--names-only'])
const present = new Set(
  names
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean),
)
if (present.has('JWT_PRIVATE_KEY') && present.has('JWKS')) {
  console.log(
    target === 'prod'
      ? 'Auth-nøgler findes allerede på prod.'
      : 'Auth-nøgler findes allerede på previewet.',
  )
  process.exit(0)
}

const keys = await generateKeyPair('RS256')
const privateKey = (await exportPKCS8(keys.privateKey))
  .trimEnd()
  .replaceAll('\n', ' ')
const jwks = JSON.stringify({
  keys: [{ use: 'sig', ...(await exportJWK(keys.publicKey)) }],
})
await convex(['env', 'set', 'JWT_PRIVATE_KEY'], privateKey)
await convex(['env', 'set', 'JWKS'], jwks)
console.log(
  target === 'prod'
    ? 'Satte JWT_PRIVATE_KEY og JWKS på prod.'
    : 'Satte JWT_PRIVATE_KEY og JWKS på previewet.',
)
