// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { createClientErrorHandler, type ClientErrorReport } from './handler'

const endpoint = 'https://project.supabase.co/functions/v1/report-client-error'
const validReport: ClientErrorReport = {
  source: 'react-route',
  message: 'render failed',
  url: 'https://rastermanden.github.io/naturklubben/chat',
  userAgent: 'Test browser',
  occurredAt: '2026-08-23T19:00:00.000Z',
}

function request(body: unknown) {
  return new Request(endpoint, {
    method: 'POST',
    headers: {
      'CF-Connecting-IP': '192.0.2.10',
      'Content-Type': 'application/json',
      Origin: 'https://rastermanden.github.io',
    },
    body: JSON.stringify(body),
  })
}

describe('report-client-error handler', () => {
  it('accepts and logs a bounded client report', async () => {
    const writeReport = vi.fn()
    const handler = createClientErrorHandler({
      writeReport,
      getClientKey: (incomingRequest) =>
        incomingRequest.headers.get('cf-connecting-ip'),
    })

    const response = await handler(request(validReport))

    expect(response.status).toBe(204)
    expect(writeReport).toHaveBeenCalledWith(validReport)
  })

  it('rejects malformed reports', async () => {
    const writeReport = vi.fn()
    const handler = createClientErrorHandler({
      writeReport,
      getClientKey: () => '192.0.2.10',
    })

    const response = await handler(request({ ...validReport, source: 'other' }))

    expect(response.status).toBe(400)
    expect(writeReport).not.toHaveBeenCalled()
  })

  it('rate limits excessive reports in one isolate', async () => {
    const handler = createClientErrorHandler({
      writeReport: vi.fn(),
      getClientKey: () => '192.0.2.10',
      now: () => 1_000,
    })

    for (let index = 0; index < 20; index += 1) {
      expect((await handler(request(validReport))).status).toBe(204)
    }

    expect((await handler(request(validReport))).status).toBe(429)
  })

  it('does not let one client consume another client rate limit', async () => {
    let clientKey = '192.0.2.10'
    const handler = createClientErrorHandler({
      writeReport: vi.fn(),
      getClientKey: () => clientKey,
      now: () => 1_000,
    })

    for (let index = 0; index < 20; index += 1) {
      await handler(request(validReport))
    }
    clientKey = '192.0.2.11'

    expect((await handler(request(validReport))).status).toBe(204)
  })

  it('rejects requests without a browser origin', async () => {
    const handler = createClientErrorHandler({
      writeReport: vi.fn(),
      getClientKey: () => '192.0.2.10',
    })
    const response = await handler(
      new Request(endpoint, {
        method: 'POST',
        headers: { 'CF-Connecting-IP': '192.0.2.10' },
        body: JSON.stringify(validReport),
      }),
    )

    expect(response.status).toBe(403)
  })
})
