// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import {
  createGuestRequestHandler,
  hmacSignal,
  validateGuestRequest,
  type GuestRequestRpcArguments,
  type GuestRequestRpcResult,
} from './handler'

const eventId = '3f2c1a4e-5b6d-4c7e-8f90-1a2b3c4d5e6f'

const validBody = {
  eventId: eventId.toUpperCase(),
  fullName: '  Gitte Gæst  ',
  email: '  Gitte@Example.com ',
  message: '  Vi er to voksne.  ',
  partySize: 2,
}

function request(
  body: unknown = validBody,
  headers: Record<string, string> = {},
) {
  return new Request(
    'https://project.supabase.co/functions/v1/submit-event-guest-request',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': '198.51.100.42',
        ...headers,
      },
      body: JSON.stringify(body),
    },
  )
}

function handlerWith(
  submit: (
    arguments_: GuestRequestRpcArguments,
  ) => Promise<GuestRequestRpcResult>,
) {
  return createGuestRequestHandler({
    secret: 'server-secret',
    submit,
    sleep: () => Promise.resolve(),
    random: () => 0,
  })
}

describe('guest request validation', () => {
  it('normalizes the fields and defaults the party size to one', () => {
    expect(validateGuestRequest(validBody)).toEqual({
      eventId,
      fullName: 'Gitte Gæst',
      email: 'gitte@example.com',
      message: 'Vi er to voksne.',
      partySize: 2,
    })
    expect(
      validateGuestRequest({
        ...validBody,
        message: '   ',
        partySize: undefined,
      }),
    ).toMatchObject({ message: null, partySize: 1 })
  })

  it('rejects a malformed event id, e-mail or party size', () => {
    expect(validateGuestRequest({ ...validBody, eventId: '42' })).toBeNull()
    expect(
      validateGuestRequest({ ...validBody, email: 'ikke-en-adresse' }),
    ).toBeNull()
    expect(validateGuestRequest({ ...validBody, partySize: 0 })).toBeNull()
    expect(validateGuestRequest({ ...validBody, partySize: 21 })).toBeNull()
    expect(validateGuestRequest({ ...validBody, partySize: 1.5 })).toBeNull()
    expect(validateGuestRequest({ ...validBody, partySize: '2' })).toBeNull()
    expect(validateGuestRequest({ ...validBody, fullName: '' })).toBeNull()
    expect(
      validateGuestRequest({ ...validBody, message: 'x'.repeat(2001) }),
    ).toBeNull()
  })
})

describe('rate-limit signal hashing', () => {
  it('uses a fixed digest format, separates domains and differs from the probation form', async () => {
    const exact = await hmacSignal('secret', 'exact-ip', '198.51.100.42')
    const network = await hmacSignal('secret', 'network', '198.51.100.42')
    const email = await hmacSignal('secret', 'email', '198.51.100.42')

    expect(exact).toMatch(/^[0-9a-f]{64}$/)
    expect(new Set([exact, network, email]).size).toBe(3)
    expect(exact).not.toContain('198.51.100.42')
  })
})

describe('guest request handler', () => {
  it('passes normalized guest data and only hashed network signals', async () => {
    const submit = vi.fn(async () => ({
      submission_outcome: 'accepted' as const,
      retry_after_seconds: null,
    }))
    const response = await handlerWith(submit)(request())

    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toEqual({ accepted: true })
    expect(submit).toHaveBeenCalledOnce()
    const arguments_ = submit.mock.calls[0][0]
    expect(arguments_).toMatchObject({
      target_event_id: eventId,
      guest_full_name: 'Gitte Gæst',
      guest_email: 'gitte@example.com',
      guest_message: 'Vi er to voksne.',
      guest_party_size: 2,
    })
    expect(arguments_.exact_ip_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(arguments_.client_network_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(arguments_.normalized_email_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(arguments_)).not.toContain('198.51.100.42')
  })

  it('returns Retry-After for a limited request', async () => {
    const response = await handlerWith(async () => ({
      submission_outcome: 'rate_limited',
      retry_after_seconds: 847.2,
    }))(request())

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('848')
    await expect(response.json()).resolves.toEqual({
      code: 'rate_limited',
      retryAfterSeconds: 848,
    })
  })

  it('answers 404 when the event is not open for guests', async () => {
    const response = await handlerWith(async () => ({
      submission_outcome: 'event_unavailable',
      retry_after_seconds: null,
    }))(request())

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      code: 'event_unavailable',
    })
  })

  it('fails closed when only a spoofed forwarding header is present', async () => {
    const submit = vi.fn()
    const response = await handlerWith(submit)(
      request(validBody, {
        'cf-connecting-ip': '',
        'x-forwarded-for': '203.0.113.9',
      }),
    )

    expect(response.status).toBe(503)
    expect(submit).not.toHaveBeenCalled()
  })

  it('rejects malformed data before the RPC', async () => {
    const submit = vi.fn()
    const response = await handlerWith(submit)(
      request({ ...validBody, partySize: 99 }),
    )

    expect(response.status).toBe(400)
    expect(submit).not.toHaveBeenCalled()
  })

  it('returns a generic temporary error and logs only a category', async () => {
    const reportError = vi.fn()
    const handler = createGuestRequestHandler({
      secret: 'server-secret',
      submit: () => Promise.reject(new Error('contains-sensitive-details')),
      sleep: () => Promise.resolve(),
      random: () => 0,
      reportError,
    })

    const response = await handler(request())

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      code: 'temporarily_unavailable',
    })
    expect(reportError).toHaveBeenCalledWith(
      expect.any(String),
      'submission_backend_failure',
    )
    expect(JSON.stringify(reportError.mock.calls)).not.toContain(
      'contains-sensitive-details',
    )
  })
})
