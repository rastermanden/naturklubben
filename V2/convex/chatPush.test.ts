/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from 'vitest'
import { convexTest } from 'convex-test'
import { api } from './_generated/api'
import schema from './schema'
import type { Id } from './_generated/dataModel'
import {
  ADMIN_CHAT_TAG,
  ADMIN_MENTION_TAG,
  buildChatPushPayload,
  CHAT_PREVIEW_MAX_LENGTH,
  CHAT_PUSH_TTL_SECONDS,
  CHAT_TAG,
  MENTION_TAG,
  previewOfChatMessage,
  selectChatPushRecipients,
  type ChatNotificationPreference,
} from './push'

const modules = import.meta.glob('./**/*.ts')

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

type SubscriberKeys = {
  privateKey: CryptoKey
  publicBytes: Uint8Array
  auth: Uint8Array
  p256dh: string
  authEncoded: string
}

async function createSubscriberKeys(): Promise<SubscriberKeys> {
  const pair = (await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  )) as CryptoKeyPair
  const publicBytes = new Uint8Array(
    await crypto.subtle.exportKey('raw', pair.publicKey),
  )
  const auth = crypto.getRandomValues(new Uint8Array(16))
  return {
    privateKey: pair.privateKey,
    publicBytes,
    auth,
    p256dh: bytesToBase64Url(publicBytes),
    authEncoded: bytesToBase64Url(auth),
  }
}

async function decryptPushBody(
  encrypted: Uint8Array,
  subscriber: SubscriberKeys,
): Promise<Record<string, unknown>> {
  const salt = encrypted.slice(0, 16)
  const idLen = encrypted[20] ?? 0
  const serverPublic = encrypted.slice(21, 21 + idLen)
  const ciphertext = encrypted.slice(21 + idLen)
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
    subscriber.auth,
    shared,
    labelInfo('WebPush: info', subscriber.publicBytes, serverPublic),
    32,
  )
  const keyBytes = await hkdf(
    salt,
    ikm,
    labelInfo('Content-Encoding: aes128gcm'),
    16,
  )
  const nonce = await hkdf(salt, ikm, labelInfo('Content-Encoding: nonce'), 12)
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
  return JSON.parse(new TextDecoder().decode(plain.slice(0, -1))) as Record<
    string,
    unknown
  >
}

async function seedMember(
  t: ReturnType<typeof convexTest>,
  options: {
    email: string
    fullName: string
    isAdmin?: boolean
    preference?: ChatNotificationPreference
  },
) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { email: options.email })
    const profileId = await ctx.db.insert('profiles', {
      userId,
      fullName: options.fullName,
      isAdmin: options.isAdmin ?? false,
      chatColor: '#16a34a',
      causes: [],
      chatNotificationPreference: options.preference ?? 'all',
      featureNotificationsEnabled: true,
      createdAt: 1,
    })
    return { userId, profileId }
  })
}

async function seedSubscription(
  t: ReturnType<typeof convexTest>,
  profileId: Id<'profiles'>,
  endpoint: string,
  keys: SubscriberKeys,
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('pushSubscriptions', {
      profileId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.authEncoded,
      createdAt: 1,
      updatedAt: 1,
    })
  })
}

describe('chat-push hjælpere', () => {
  it('forkorter lange beskeder til 140 tegn og samler mellemrum', () => {
    expect(previewOfChatMessage('  Hej   alle\n\ti skoven  ')).toBe(
      'Hej alle i skoven',
    )
    const long = 'a'.repeat(CHAT_PREVIEW_MAX_LENGTH + 20)
    const preview = previewOfChatMessage(long)
    expect(preview).toHaveLength(CHAT_PREVIEW_MAX_LENGTH)
    expect(preview.endsWith('…')).toBe(true)
  })

  it('matcher V1-payload for almindelig besked, mention og admin-rum', () => {
    expect(
      buildChatPushPayload({
        senderName: 'Ada ',
        preview: 'Kommer I?',
        messageId: 'm1',
        isMentioned: false,
      }),
    ).toEqual({
      title: 'Ada',
      body: 'Kommer I?',
      tag: CHAT_TAG,
      path: 'chat',
      messageId: 'm1',
    })

    expect(
      buildChatPushPayload({
        senderName: 'Ada',
        preview: 'Hej @Bo',
        messageId: 'm2',
        isMentioned: true,
      }),
    ).toEqual({
      title: 'Ada nævnte dig',
      body: 'Hej @Bo',
      tag: MENTION_TAG,
      path: 'chat',
      messageId: 'm2',
    })

    expect(
      buildChatPushPayload({
        senderName: null,
        preview: 'Referat',
        messageId: 'm3',
        isMentioned: false,
        room: 'admin',
      }),
    ).toEqual({
      title: 'Ny besked i Naturklubben',
      body: 'Referat',
      tag: ADMIN_CHAT_TAG,
      path: 'admin/chat',
      messageId: 'm3',
    })

    expect(
      buildChatPushPayload({
        senderName: '   ',
        preview: 'Hej',
        messageId: 'm4',
        isMentioned: true,
        room: 'admin',
      }),
    ).toEqual({
      title: 'Du er nævnt i Naturklubben',
      body: 'Hej',
      tag: ADMIN_MENTION_TAG,
      path: 'admin/chat',
      messageId: 'm4',
    })
  })

  it('filtrerer modtagere på præference, afsender, admin-rum og alle enheder', () => {
    const senderId = 'sender' as Id<'profiles'>
    const allId = 'all' as Id<'profiles'>
    const mentionsId = 'mentions' as Id<'profiles'>
    const noneId = 'none' as Id<'profiles'>
    const subscriptions = [
      { id: 'sender-phone', profileId: senderId },
      { id: 'all-phone', profileId: allId },
      { id: 'all-laptop', profileId: allId },
      { id: 'mentions-phone', profileId: mentionsId },
      { id: 'none-phone', profileId: noneId },
    ]
    const preferences = new Map<Id<'profiles'>, ChatNotificationPreference>([
      [senderId, 'all'],
      [allId, 'all'],
      [mentionsId, 'mentions'],
      [noneId, 'none'],
    ])

    const general = selectChatPushRecipients({
      subscriptions,
      preferences,
      mentionedIds: [mentionsId, noneId, senderId],
      senderId,
      room: 'general',
    })
    expect(
      general.map((entry) => [entry.subscription.id, entry.isMentioned]),
    ).toEqual([
      ['all-phone', false],
      ['all-laptop', false],
      ['mentions-phone', true],
    ])

    const admin = selectChatPushRecipients({
      subscriptions,
      preferences,
      mentionedIds: [mentionsId],
      senderId,
      room: 'admin',
      adminIds: new Set([mentionsId]),
    })
    expect(
      admin.map((entry) => [entry.subscription.id, entry.isMentioned]),
    ).toEqual([['mentions-phone', true]])
  })
})

describe('chat.sendMessage -> Web Push', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('sender krypteret push til berettigede enheder, udelader afsender/none og sender ikke dublet ved idempotent gensendelse', async () => {
    vi.useFakeTimers()
    const t = convexTest(schema, modules)
    const sender = await seedMember(t, {
      email: 'ada@example.com',
      fullName: 'Ada',
      preference: 'all',
    })
    const allMember = await seedMember(t, {
      email: 'bo@example.com',
      fullName: 'Bo',
      preference: 'all',
    })
    const mentionOnly = await seedMember(t, {
      email: 'carl@example.com',
      fullName: 'Carl',
      preference: 'mentions',
    })
    const silentMember = await seedMember(t, {
      email: 'dina@example.com',
      fullName: 'Dina',
      preference: 'none',
    })

    const senderKeys = await createSubscriberKeys()
    const boPhoneKeys = await createSubscriberKeys()
    const boLaptopKeys = await createSubscriberKeys()
    const carlKeys = await createSubscriberKeys()
    const dinaKeys = await createSubscriberKeys()

    const senderEndpoint = 'https://fcm.googleapis.com/fcm/send/sender-phone'
    const boPhoneEndpoint = 'https://fcm.googleapis.com/fcm/send/bo-phone'
    const boLaptopEndpoint = 'https://fcm.googleapis.com/fcm/send/bo-laptop'
    const carlEndpoint = 'https://fcm.googleapis.com/fcm/send/carl-phone'
    const dinaEndpoint = 'https://fcm.googleapis.com/fcm/send/dina-phone'

    await seedSubscription(t, sender.profileId, senderEndpoint, senderKeys)
    await seedSubscription(t, allMember.profileId, boPhoneEndpoint, boPhoneKeys)
    await seedSubscription(
      t,
      allMember.profileId,
      boLaptopEndpoint,
      boLaptopKeys,
    )
    await seedSubscription(t, mentionOnly.profileId, carlEndpoint, carlKeys)
    await seedSubscription(t, silentMember.profileId, dinaEndpoint, dinaKeys)

    const sentRequests: {
      url: string
      headers: Record<string, string>
      body: Uint8Array
    }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const raw = init?.body
        const bytes =
          raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBuffer)
        sentRequests.push({
          url,
          headers: (init?.headers ?? {}) as Record<string, string>,
          body: bytes,
        })
        return new Response(null, { status: 201 })
      }),
    )

    const asSender = t.withIdentity({ subject: sender.userId })
    const sent = await asSender.mutation(api.chat.sendMessage, {
      clientId: 'msg-1',
      room: 'general',
      content: 'Hej @Carl og @Dina, ses vi ved søen?',
      mentions: [mentionOnly.profileId, silentMember.profileId],
    })
    // Idempotent gentagelse (fx fra offline-køen) må ikke udløse en ny push.
    const duplicate = await asSender.mutation(api.chat.sendMessage, {
      clientId: 'msg-1',
      room: 'general',
      content: 'Hej @Carl og @Dina, ses vi ved søen?',
      mentions: [mentionOnly.profileId, silentMember.profileId],
    })
    expect(duplicate.inserted).toBe(false)

    await t.finishAllScheduledFunctions(vi.runAllTimers)

    expect(sentRequests.map((req) => req.url).sort()).toEqual(
      [boLaptopEndpoint, boPhoneEndpoint, carlEndpoint].sort(),
    )

    for (const req of sentRequests) {
      expect(req.headers['Content-Encoding']).toBe('aes128gcm')
      expect(req.headers.Urgency).toBe('high')
      expect(req.headers.TTL).toBe(String(CHAT_PUSH_TTL_SECONDS))
      expect(req.headers.Authorization).toMatch(/^vapid t=/)
    }

    const boReq = sentRequests.find((req) => req.url === boPhoneEndpoint)!
    const carlReq = sentRequests.find((req) => req.url === carlEndpoint)!
    expect(await decryptPushBody(boReq.body, boPhoneKeys)).toEqual({
      title: 'Ada',
      body: 'Hej @Carl og @Dina, ses vi ved søen?',
      tag: CHAT_TAG,
      path: 'chat',
      messageId: String(sent.messageId),
    })
    expect(await decryptPushBody(carlReq.body, carlKeys)).toEqual({
      title: 'Ada nævnte dig',
      body: 'Hej @Carl og @Dina, ses vi ved søen?',
      tag: MENTION_TAG,
      path: 'chat',
      messageId: String(sent.messageId),
    })
  })

  it('sender kun til admins i admin-rummet og sletter udløbne 410-abonnementer', async () => {
    vi.useFakeTimers()
    const t = convexTest(schema, modules)
    const adminSender = await seedMember(t, {
      email: 'admin1@example.com',
      fullName: 'Admin 1',
      isAdmin: true,
    })
    const adminReceiver = await seedMember(t, {
      email: 'admin2@example.com',
      fullName: 'Admin 2',
      isAdmin: true,
    })
    const regularMember = await seedMember(t, {
      email: 'member@example.com',
      fullName: 'Medlem',
      isAdmin: false,
    })

    const adminLiveKeys = await createSubscriberKeys()
    const adminGoneKeys = await createSubscriberKeys()
    const memberKeys = await createSubscriberKeys()

    const adminLiveEndpoint = 'https://fcm.googleapis.com/fcm/send/admin-live'
    const adminGoneEndpoint = 'https://fcm.googleapis.com/fcm/send/admin-gone'
    const memberEndpoint = 'https://fcm.googleapis.com/fcm/send/member-device'

    const liveSubId = await seedSubscription(
      t,
      adminReceiver.profileId,
      adminLiveEndpoint,
      adminLiveKeys,
    )
    const goneSubId = await seedSubscription(
      t,
      adminReceiver.profileId,
      adminGoneEndpoint,
      adminGoneKeys,
    )
    await seedSubscription(
      t,
      regularMember.profileId,
      memberEndpoint,
      memberKeys,
    )

    const calledUrls: string[] = []
    let liveBody: Uint8Array | null = null
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calledUrls.push(url)
        if (url === adminGoneEndpoint) {
          return new Response(null, { status: 410 })
        }
        const raw = init?.body
        liveBody =
          raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBuffer)
        return new Response(null, { status: 201 })
      }),
    )

    const sent = await t
      .withIdentity({ subject: adminSender.userId })
      .mutation(api.chat.sendMessage, {
        clientId: 'admin-msg-1',
        room: 'admin',
        content: 'Husk referat',
      })

    await t.finishAllScheduledFunctions(vi.runAllTimers)

    expect(calledUrls.sort()).toEqual(
      [adminGoneEndpoint, adminLiveEndpoint].sort(),
    )
    expect(liveBody).not.toBeNull()
    expect(await decryptPushBody(liveBody!, adminLiveKeys)).toEqual({
      title: 'Admin 1',
      body: 'Husk referat',
      tag: ADMIN_CHAT_TAG,
      path: 'admin/chat',
      messageId: String(sent.messageId),
    })

    const remaining = await t.run(async (ctx) => {
      return {
        live: await ctx.db.get(liveSubId),
        gone: await ctx.db.get(goneSubId),
      }
    })
    expect(remaining.live).not.toBeNull()
    expect(remaining.gone).toBeNull()
  })

  it('sender ingen push hvis beskeden slettes før leveringen kører', async () => {
    vi.useFakeTimers()
    const t = convexTest(schema, modules)
    const sender = await seedMember(t, {
      email: 'ada@example.com',
      fullName: 'Ada',
    })
    const receiver = await seedMember(t, {
      email: 'bo@example.com',
      fullName: 'Bo',
    })
    await seedSubscription(
      t,
      receiver.profileId,
      'https://fcm.googleapis.com/fcm/send/bo-device',
      await createSubscriberKeys(),
    )

    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    const asSender = t.withIdentity({ subject: sender.userId })
    const { messageId } = await asSender.mutation(api.chat.sendMessage, {
      clientId: 'deleted-msg',
      room: 'general',
      content: 'Ups',
    })
    await asSender.mutation(api.chat.softDeleteMessage, { messageId })

    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sender ingen push til et medlem med præference mentions, når det ikke er nævnt', async () => {
    vi.useFakeTimers()
    const t = convexTest(schema, modules)
    const sender = await seedMember(t, {
      email: 'ada@example.com',
      fullName: 'Ada',
      preference: 'all',
    })
    const allMember = await seedMember(t, {
      email: 'bo@example.com',
      fullName: 'Bo',
      preference: 'all',
    })
    const mentionOnly = await seedMember(t, {
      email: 'carl@example.com',
      fullName: 'Carl',
      preference: 'mentions',
    })

    const boEndpoint = 'https://fcm.googleapis.com/fcm/send/bo-all'
    const carlEndpoint = 'https://fcm.googleapis.com/fcm/send/carl-mentions'
    await seedSubscription(
      t,
      allMember.profileId,
      boEndpoint,
      await createSubscriberKeys(),
    )
    await seedSubscription(
      t,
      mentionOnly.profileId,
      carlEndpoint,
      await createSubscriberKeys(),
    )

    const calledUrls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calledUrls.push(url)
        return new Response(null, { status: 201 })
      }),
    )

    await t
      .withIdentity({ subject: sender.userId })
      .mutation(api.chat.sendMessage, {
        clientId: 'general-no-mention',
        room: 'general',
        content: 'God tur i morgen!',
        mentions: [],
      })

    await t.finishAllScheduledFunctions(vi.runAllTimers)

    expect(calledUrls).toEqual([boEndpoint])
  })

  it('sender ikke til en nævnt ikke-admin i admin-rummet, men sender mention-push til en nævnt admin', async () => {
    vi.useFakeTimers()
    const t = convexTest(schema, modules)
    const adminSender = await seedMember(t, {
      email: 'admin1@example.com',
      fullName: 'Admin 1',
      isAdmin: true,
      preference: 'all',
    })
    const adminMentioned = await seedMember(t, {
      email: 'admin2@example.com',
      fullName: 'Admin 2',
      isAdmin: true,
      preference: 'mentions',
    })
    const regularMember = await seedMember(t, {
      email: 'member@example.com',
      fullName: 'Medlem',
      isAdmin: false,
      preference: 'all',
    })

    const adminKeys = await createSubscriberKeys()
    const adminEndpoint = 'https://fcm.googleapis.com/fcm/send/admin-mentioned'
    const memberEndpoint =
      'https://fcm.googleapis.com/fcm/send/member-mentioned'
    await seedSubscription(
      t,
      adminMentioned.profileId,
      adminEndpoint,
      adminKeys,
    )
    await seedSubscription(
      t,
      regularMember.profileId,
      memberEndpoint,
      await createSubscriberKeys(),
    )

    const sentRequests: { url: string; body: Uint8Array }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const raw = init?.body
        const bytes =
          raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBuffer)
        sentRequests.push({ url, body: bytes })
        return new Response(null, { status: 201 })
      }),
    )

    const sent = await t
      .withIdentity({ subject: adminSender.userId })
      .mutation(api.chat.sendMessage, {
        clientId: 'admin-mention-privacy',
        room: 'admin',
        content: 'Hej @Admin 2 og @Medlem',
        mentions: [adminMentioned.profileId, regularMember.profileId],
      })

    await t.finishAllScheduledFunctions(vi.runAllTimers)

    expect(sentRequests.map((req) => req.url)).toEqual([adminEndpoint])
    expect(await decryptPushBody(sentRequests[0]!.body, adminKeys)).toEqual({
      title: 'Admin 1 nævnte dig',
      body: 'Hej @Admin 2 og @Medlem',
      tag: ADMIN_MENTION_TAG,
      path: 'admin/chat',
      messageId: String(sent.messageId),
    })
  })
})
