import { describe, expect, it, vi } from 'vitest'
import { sendPushNotification, type VapidDetails } from './webpush'

function asBuffer(bytes: Uint8Array): BufferSource {
  return bytes as BufferSource
}

function bytesToBase64Url(bytes: Uint8Array): string {
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

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
) {
  const key = await crypto.subtle.importKey(
    'raw',
    asBuffer(ikm),
    'HKDF',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: asBuffer(salt),
      info: asBuffer(info),
    },
    key,
    length * 8,
  )
  return new Uint8Array(bits)
}

function labelInfo(label: string, ...extra: Uint8Array[]) {
  return concatBytes(
    new TextEncoder().encode(label),
    new Uint8Array([0]),
    ...extra,
  )
}

describe('sendPushNotification', () => {
  it('sender en krypteret notifikation, som abonnenten kan læse', async () => {
    const subscriber = (await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits'],
    )) as CryptoKeyPair
    const publicBytes = new Uint8Array(
      await crypto.subtle.exportKey('raw', subscriber.publicKey),
    )
    const auth = crypto.getRandomValues(new Uint8Array(16))
    const vapidKeys = (await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign'],
    )) as CryptoKeyPair
    const vapidPublic = new Uint8Array(
      await crypto.subtle.exportKey('raw', vapidKeys.publicKey),
    )
    const vapidPrivate = await crypto.subtle.exportKey(
      'jwk',
      vapidKeys.privateKey,
    )
    const vapid: VapidDetails = {
      publicKey: bytesToBase64Url(vapidPublic),
      privateKey: vapidPrivate.d ?? '',
      subject: 'mailto:test@example.com',
    }

    let body: Uint8Array | null = null
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const raw = init.body
      body =
        raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBuffer)
      return new Response(null, { status: 201 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const endpoint = 'https://fcm.googleapis.com/fcm/send/test-endpoint'
    const payload = JSON.stringify({
      title: 'Naturklubben',
      body: 'Notifikationer virker.',
    })
    try {
      const result = await sendPushNotification(
        {
          endpoint,
          p256dh: bytesToBase64Url(publicBytes),
          auth: bytesToBase64Url(auth),
        },
        payload,
        vapid,
      )
      expect(result).toEqual({ status: 201, isGone: false })
    } finally {
      vi.unstubAllGlobals()
    }

    expect(fetchMock).toHaveBeenCalledOnce()
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({
      'Content-Encoding': 'aes128gcm',
      Urgency: 'high',
    })
    expect(
      String((init.headers as Record<string, string>).Authorization),
    ).toMatch(/^vapid t=/)
    if (body === null) throw new Error('ingen body')
    const sent = body as Uint8Array
    const salt = sent.slice(0, 16)
    const idLen = sent[20] ?? 0
    const serverPublic = sent.slice(21, 21 + idLen)
    const ciphertext = sent.slice(21 + idLen)
    const serverKey = await crypto.subtle.importKey(
      'raw',
      asBuffer(serverPublic),
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      [],
    )
    const shared = new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: 'ECDH', public: serverKey },
        subscriber.privateKey,
        256,
      ),
    )
    const ikm = await hkdf(
      auth,
      shared,
      labelInfo('WebPush: info', publicBytes, serverPublic),
      32,
    )
    const keyBytes = await hkdf(
      salt,
      ikm,
      labelInfo('Content-Encoding: aes128gcm'),
      16,
    )
    const nonce = await hkdf(
      salt,
      ikm,
      labelInfo('Content-Encoding: nonce'),
      12,
    )
    const aes = await crypto.subtle.importKey(
      'raw',
      asBuffer(keyBytes),
      'AES-GCM',
      false,
      ['decrypt'],
    )
    const plain = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: asBuffer(nonce) },
        aes,
        asBuffer(ciphertext),
      ),
    )
    expect(new TextDecoder().decode(plain.slice(0, -1))).toBe(payload)
    expect(plain[plain.length - 1]).toBe(2)
  })
})
