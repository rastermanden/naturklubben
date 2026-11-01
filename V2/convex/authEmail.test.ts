import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_AUTH_FROM,
  authFromAddress,
  authMail,
  deliverAuthEmail,
  postResendEmail,
} from './authEmail'

const url = 'https://naturklubben.dk/velkommen?code=abc'
const resetUrl = 'https://naturklubben.dk/ny-adgangskode?code=abc'

describe('authMail', () => {
  it('bekræftelsen peger på velkommen', () => {
    const mail = authMail('verify', url)
    expect(mail.subject).toContain('Bekræft')
    expect(mail.text).toContain(url)
    expect(mail.text).toContain('aktivere din bruger')
    expect(mail.html).toContain(`href="${url}"`)
  })

  it('nulstillingen peger på ny adgangskode', () => {
    const mail = authMail('reset', resetUrl)
    expect(mail.subject).toContain('Nulstil')
    expect(mail.text).toContain(resetUrl)
    expect(mail.text).toContain('ny adgangskode')
  })
})

describe('deliverAuthEmail', () => {
  it('logger mailen og kalder ikke Resend, når nøglen mangler', async () => {
    const fetchImpl = vi.fn()
    const lines: string[] = []
    await deliverAuthEmail({
      kind: 'verify',
      to: 'medlem@example.com',
      url,
      apiKey: undefined,
      from: undefined,
      fetchImpl,
      log: (line) => lines.push(line),
    })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(lines[0]).toContain('uden nøgle')
    expect(lines[0]).toContain(url)
    expect(authFromAddress(undefined)).toBe(DEFAULT_AUTH_FROM)
    expect(authFromAddress('  Klub <n@example.com>  ')).toBe(
      'Klub <n@example.com>',
    )
  })

  it('poster til Resend med afsenderen og linket', async () => {
    const calls: Array<[unknown, RequestInit | undefined]> = []
    const fetchImpl = vi.fn(async (url: unknown, init?: RequestInit) => {
      calls.push([url, init])
      return new Response('{}', { status: 200 })
    })
    await deliverAuthEmail({
      kind: 'reset',
      to: 'medlem@example.com',
      url: resetUrl,
      apiKey: 're_test',
      from: undefined,
      fetchImpl,
      log: () => {},
    })
    expect(calls[0]?.[0]).toBe('https://api.resend.com/emails')
    const init = calls[0]?.[1]
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer re_test',
    })
    const body = JSON.parse(String(init?.body)) as {
      from: string
      to: string[]
      text: string
    }
    expect(body.from).toBe(DEFAULT_AUTH_FROM)
    expect(body.to).toEqual(['medlem@example.com'])
    expect(body.text).toContain(resetUrl)
  })

  it('kaster, når Resend afviser, og gemmer ikke nøglen i fejlen', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ message: 'domain is not verified' }), {
          status: 403,
        }),
    )
    await expect(
      deliverAuthEmail({
        kind: 'verify',
        to: 'medlem@example.com',
        url,
        apiKey: 're_hemmelig',
        from: undefined,
        fetchImpl,
        log: () => {},
      }),
    ).rejects.toThrow('AUTH_EMAIL_NOT_SENT')
    const result = await postResendEmail({
      apiKey: 're_hemmelig',
      from: DEFAULT_AUTH_FROM,
      to: 'medlem@example.com',
      subject: 'x',
      text: 'y',
      html: 'z',
      fetchImpl,
    })
    expect(result.status).toBe(403)
    expect(result.detail).toBe('domain is not verified')
    expect(result.detail).not.toContain('re_hemmelig')
  })
})
