/**
 * Convex Auth kan ikke udstede en session uden JWT_PRIVATE_KEY og JWKS.
 * `npx convex dev` sætter dem lokalt, men et preview-deployment arver dem
 * ikke. Nøglerne sættes kun, hvis de mangler, og de skrives ikke i loggen.
 */
import { spawn } from 'node:child_process'
import { exportJWK, exportPKCS8, generateKeyPair } from 'jose'

const preview = process.argv[2]
if (!preview?.startsWith('pr-')) {
  console.error('Mangler preview-navn.')
  process.exit(1)
}

function convex(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['convex', ...args], {
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

const names = await convex([
  'env',
  'list',
  '--names-only',
  '--preview-name',
  preview,
])
const present = new Set(
  names
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean),
)
if (present.has('JWT_PRIVATE_KEY') && present.has('JWKS')) {
  console.log('Auth-nøgler findes allerede på previewet.')
  process.exit(0)
}

const keys = await generateKeyPair('RS256')
const privateKey = (await exportPKCS8(keys.privateKey))
  .trimEnd()
  .replaceAll('\n', ' ')
const jwks = JSON.stringify({
  keys: [{ use: 'sig', ...(await exportJWK(keys.publicKey)) }],
})
await convex(
  ['env', 'set', 'JWT_PRIVATE_KEY', '--preview-name', preview],
  privateKey,
)
await convex(['env', 'set', 'JWKS', '--preview-name', preview], jwks)
console.log('Satte JWT_PRIVATE_KEY og JWKS på previewet.')
