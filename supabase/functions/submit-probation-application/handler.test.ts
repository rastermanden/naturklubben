// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import {
  createSubmissionHandler,
  extractTrustedClientAddress,
  hmacSignal,
  type SubmissionRpcArguments,
  type SubmissionRpcResult,
} from './handler'

const validBody = {
  fullName: '  Anna Andersen  ',
  email: '  Anna@Example.com ',
  motivation: '  Jeg holder af naturen.  ',
  subscription: {
    endpoint: 'https://fcm.googleapis.com/fcm/send/subscription-id',
    p256dh: 'public-key',
    auth: 'auth-secret',
  },
}

function request(
  body: unknown = validBody,
  headers: Record<string, string> = {},
) {
  return new Request(
    'https://project.supabase.co/functions/v1/submit-probation-application',
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
  submit: (arguments_: SubmissionRpcArguments) => Promise<SubmissionRpcResult>,
) {
  return createSubmissionHandler({
    secret: 'server-secret',
    submit,
    sleep: () => Promise.resolve(),
    random: () => 0,
  })
}

describe('trusted client address', () => {
  it('normalizes an IPv4 address and its /24 network', () => {
    const headers = new Headers({ 'cf-connecting-ip': '198.51.100.42' })
    expect(extractTrustedClientAddress(headers)).toEqual({
      exact: '198.51.100.42',
      network: '198.51.100.0/24',
    })
  })

  it('normalizes equivalent IPv6 addresses to the same /64', () => {
    const expanded = new Headers({
      'cf-connecting-ip': '2001:0db8:1234:5678:0000:0000:0000:0001',
    })
    const compressed = new Headers({
      'cf-connecting-ip': '2001:db8:1234:5678::1',
    })
    expect(extractTrustedClientAddress(expanded)).toEqual(
      extractTrustedClientAddress(compressed),
    )
    expect(extractTrustedClientAddress(compressed)).toEqual({
      exact: '2001:db8:1234:5678:0:0:0:1',
      network: '2001:db8:1234:5678:0:0:0:0/64',
    })
  })

  it('normalizes IPv4-mapped IPv6 as IPv4', () => {
    const headers = new Headers({
      'cf-connecting-ip': '::ffff:198.51.100.42',
    })
    expect(extractTrustedClientAddress(headers)).toEqual({
      exact: '198.51.100.42',
      network: '198.51.100.0/24',
    })
  })

  it('ignores a caller-controlled X-Forwarded-For value', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.9' })
    expect(extractTrustedClientAddress(headers)).toBeNull()
  })

  it('fails closed for missing, invalid, or multiple trusted headers', () => {
    expect(extractTrustedClientAddress(new Headers())).toBeNull()
    expect(
      extractTrustedClientAddress(
        new Headers({ 'cf-connecting-ip': 'not-an-ip' }),
      ),
    ).toBeNull()
    expect(
      extractTrustedClientAddress(
        new Headers({
          'cf-connecting-ip': '198.51.100.42, 203.0.113.9',
        }),
      ),
    ).toBeNull()
  })
})

describe('rate-limit signal hashing', () => {
  it('uses a fixed digest format and separates signal domains', async () => {
    const exact = await hmacSignal('secret', 'exact-ip', '198.51.100.42')
    const network = await hmacSignal('secret', 'network', '198.51.100.42')
    const email = await hmacSignal('secret', 'email', '198.51.100.42')

    expect(exact).toMatch(/^[0-9a-f]{64}$/)
    expect(new Set([exact, network, email]).size).toBe(3)
    expect(exact).not.toContain('198.51.100.42')
    expect(await hmacSignal('secret', 'exact-ip', '198.51.100.42')).toBe(exact)
  })
})

describe('submission handler', () => {
  it('passes normalized application data and only hashed network signals', async () => {
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
      applicant_full_name: 'Anna Andersen',
      applicant_email: 'anna@example.com',
      applicant_motivation: 'Jeg holder af naturen.',
      push_endpoint: 'https://fcm.googleapis.com/fcm/send/subscription-id',
      push_p256dh: 'public-key',
      push_auth: 'auth-secret',
    })
    expect(arguments_.exact_ip_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(arguments_.client_network_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(arguments_.normalized_email_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(arguments_)).not.toContain('198.51.100.42')
  })

  it('returns the same public response for created and server-side no-op results', async () => {
    const created = await handlerWith(async () => ({
      submission_outcome: 'accepted',
      retry_after_seconds: null,
    }))(request())
    const noOp = await handlerWith(async () => ({
      submission_outcome: 'accepted',
      retry_after_seconds: null,
    }))(request())

    expect(noOp.status).toBe(created.status)
    expect(await noOp.text()).toBe(await created.text())
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

  it('fails closed when only a spoofed forwarding header is present', async () => {
    const submit = vi.fn()
    const spoofed = request(validBody, {
      'cf-connecting-ip': '',
      'x-forwarded-for': '203.0.113.9',
    })
    const response = await handlerWith(submit)(spoofed)

    expect(response.status).toBe(503)
    expect(submit).not.toHaveBeenCalled()
  })

  it('rejects malformed application and push data before the RPC', async () => {
    const submit = vi.fn()
    const response = await handlerWith(submit)(
      request({
        ...validBody,
        subscription: {
          ...validBody.subscription,
          endpoint: 'https://example.com/internal',
        },
      }),
    )

    expect(response.status).toBe(400)
    expect(submit).not.toHaveBeenCalled()
  })

  it('returns a generic temporary error and logs only a category', async () => {
    const reportError = vi.fn()
    const handler = createSubmissionHandler({
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
