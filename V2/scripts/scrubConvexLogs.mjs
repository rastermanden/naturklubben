/**
 * Printer de loglinjer, der kan forklare en fejlet oprettelse.
 * Koder, hashes og tokens bliver stående i filen, ikke i outputtet.
 */
import { readFileSync } from 'node:fs'

const text = readFileSync(process.argv[2] ?? '/tmp/convex-logs.txt', 'utf8')
  .replace(/code=[^&\s]+/g, 'code=[redacted]')
  .replace(/\$2[aby]\$\S+/g, '[hash]')
  .replace(/eyJ[A-Za-z0-9._-]+/g, '[jwt]')

const keys = [
  'signup',
  'signin',
  'account',
  'already',
  'agentmail',
  'error',
  'exception',
  'email',
  'allow',
]
const hits = text
  .split('\n')
  .filter((line) => keys.some((key) => line.toLowerCase().includes(key)))
console.log(`LOG_HITS ${hits.length}`)
for (const line of hits.slice(-40)) console.log(line.slice(0, 400))
