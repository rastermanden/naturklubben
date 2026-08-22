// Web Push uden eksterne afhængigheder.
//
// `web-push` fra npm er bygget til Node (node:crypto + node:https) og er ikke
// noget, vi vil satse Edge Runtime på. Protokollen er til gengæld lille nok til
// at implementere direkte oven på WebCrypto, som Deno har indbygget:
//
//   - RFC 8291: payloaden krypteres til modtagerens browser med ECDH (P-256)
//     + HKDF + AES-128-GCM, content-encoding `aes128gcm`.
//   - RFC 8292 (VAPID): requestet til push-tjenesten signeres med en ES256-JWT,
//     så tjenesten kan se, at det er *os*, der sender.
//
// Serveren ser aldrig indholdet i klartekst -- kun modtagerens browser kan
// dekryptere det.

const encoder = new TextEncoder()

// Record size fra RFC 8188. Vi sender altid ét enkelt record, så det skal blot
// være stort nok til payloaden (chat-titel + de første ~150 tegn af beskeden).
const RECORD_SIZE = 4096

export interface PushSubscriptionKeys {
  endpoint: string
  p256dh: string
  auth: string
}

export interface VapidDetails {
  publicKey: string
  privateKey: string
  subject: string
}

export function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

/**
 * WebCrypto tager BufferSource. TypeScripts Uint8Array er generisk over sin
 * bagvedliggende buffer, og en Uint8Array, hvis buffer *kunne* være en
 * SharedArrayBuffer, tæller ikke som BufferSource -- selv om ingen af vores
 * er det. Assertionen holder kaldene nedenfor læsbare.
 */
function bufferSource(bytes: Uint8Array): BufferSource {
  return bytes as BufferSource
}

/** HKDF-udtræk + -udvidelse i ét, som RFC 8291 bruger det. */
async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  lengthInBytes: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    bufferSource(ikm),
    'HKDF',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: bufferSource(salt),
      info: bufferSource(info),
    },
    key,
    lengthInBytes * 8,
  )
  return new Uint8Array(bits)
}

/** `label` efterfulgt af en nulbyte -- HKDF-info-formatet i RFC 8291/8188. */
function labelInfo(label: string, ...extra: Uint8Array[]): Uint8Array {
  return concatBytes(encoder.encode(label), new Uint8Array([0]), ...extra)
}

/**
 * Krypterer payloaden til én bestemt abonnent (RFC 8291, aes128gcm).
 *
 * Resultatet er hele HTTP-bodyen: header-blokken (salt, record size og vores
 * efemere offentlige nøgle) efterfulgt af selve ciphertexten.
 */
async function encryptPayload(
  subscription: PushSubscriptionKeys,
  payload: string,
): Promise<Uint8Array> {
  const uaPublicBytes = base64UrlToBytes(subscription.p256dh)
  const authSecret = base64UrlToBytes(subscription.auth)

  // Ny efemer nøgle per besked -- den er halvdelen af ECDH-hemmeligheden og må
  // aldrig genbruges på tværs af beskeder.
  const serverKeys = (await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  )) as CryptoKeyPair
  const serverPublicBytes = new Uint8Array(
    await crypto.subtle.exportKey('raw', serverKeys.publicKey),
  )

  const uaPublicKey = await crypto.subtle.importKey(
    'raw',
    bufferSource(uaPublicBytes),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: uaPublicKey },
      serverKeys.privateKey,
      256,
    ),
  )

  // Abonnentens auth-hemmelighed er salt her, så nøglen kun kan udledes af den
  // browser, der oprindeligt oprettede abonnementet.
  const ikm = await hkdf(
    authSecret,
    sharedSecret,
    labelInfo('WebPush: info', uaPublicBytes, serverPublicBytes),
    32,
  )

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const contentEncryptionKey = await hkdf(
    salt,
    ikm,
    labelInfo('Content-Encoding: aes128gcm'),
    16,
  )
  const nonce = await hkdf(salt, ikm, labelInfo('Content-Encoding: nonce'), 12)

  const aesKey = await crypto.subtle.importKey(
    'raw',
    bufferSource(contentEncryptionKey),
    'AES-GCM',
    false,
    ['encrypt'],
  )
  // 0x02 er padding-delimiteren for det *sidste* record i RFC 8188.
  const plaintext = concatBytes(encoder.encode(payload), new Uint8Array([2]))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: bufferSource(nonce) },
      aesKey,
      bufferSource(plaintext),
    ),
  )

  const recordSize = new Uint8Array(4)
  new DataView(recordSize.buffer).setUint32(0, RECORD_SIZE)

  return concatBytes(
    salt,
    recordSize,
    new Uint8Array([serverPublicBytes.length]),
    serverPublicBytes,
    ciphertext,
  )
}

/**
 * Bygger VAPID-JWT'en, der beviser over for push-tjenesten, at afsenderen er
 * indehaveren af den offentlige nøgle, browseren abonnerede med.
 */
async function createVapidAuthorization(
  endpoint: string,
  vapid: VapidDetails,
): Promise<string> {
  const publicKeyBytes = base64UrlToBytes(vapid.publicKey)
  // Den rå offentlige nøgle er 0x04 || x || y -- WebCrypto vil have x og y
  // hver for sig i en JWK for at kunne importere den private nøgle.
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      d: vapid.privateKey,
      x: bytesToBase64Url(publicKeyBytes.slice(1, 33)),
      y: bytesToBase64Url(publicKeyBytes.slice(33, 65)),
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )

  const header = { typ: 'JWT', alg: 'ES256' }
  const claims = {
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: vapid.subject,
  }
  const unsigned = `${bytesToBase64Url(
    encoder.encode(JSON.stringify(header)),
  )}.${bytesToBase64Url(encoder.encode(JSON.stringify(claims)))}`

  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      privateKey,
      bufferSource(encoder.encode(unsigned)),
    ),
  )

  return `vapid t=${unsigned}.${bytesToBase64Url(signature)}, k=${vapid.publicKey}`
}

export interface SendResult {
  status: number
  /** True når push-tjenesten siger, at abonnementet er dødt og bør slettes. */
  isGone: boolean
}

export async function sendPushNotification(
  subscription: PushSubscriptionKeys,
  payload: string,
  vapid: VapidDetails,
  ttlSeconds = 12 * 60 * 60,
): Promise<SendResult> {
  const body = await encryptPayload(subscription, payload)
  const authorization = await createVapidAuthorization(
    subscription.endpoint,
    vapid,
  )

  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttlSeconds),
      Urgency: 'high',
    },
    body: bufferSource(body),
  })

  // 404/410 = abonnementet findes ikke længere (appen er afinstalleret, eller
  // browseren har roteret det). Alt andet behandler vi som en midlertidig fejl.
  return {
    status: response.status,
    isGone: response.status === 404 || response.status === 410,
  }
}
