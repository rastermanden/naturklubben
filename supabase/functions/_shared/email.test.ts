import { strict as assert } from 'node:assert'
import { emailSenderFromEnv, sendEmail } from './email.ts'

function envWith(values: Record<string, string | undefined>) {
  return { get: (name: string) => values[name] }
}

Deno.test(
  'e-mail: manglende nøgle eller afsender betyder ingen afsender -- ikke en exception',
  () => {
    assert.equal(emailSenderFromEnv(envWith({})), null)
    assert.equal(
      emailSenderFromEnv(
        envWith({ RESEND_API_KEY: '   ', EMAIL_FROM: 'Klubben <hej@klub.dk>' }),
      ),
      null,
    )
    assert.equal(emailSenderFromEnv(envWith({ RESEND_API_KEY: 're_x' })), null)
    assert.equal(
      emailSenderFromEnv(envWith({ RESEND_API_KEY: 're_x', EMAIL_FROM: ' ' })),
      null,
    )
    assert.deepEqual(
      emailSenderFromEnv(
        envWith({
          RESEND_API_KEY: 're_x',
          EMAIL_FROM: 'Klubben <hej@klub.dk>',
        }),
      ),
      { apiKey: 're_x', from: 'Klubben <hej@klub.dk>' },
    )
  },
)

Deno.test('e-mail: sender via Resend med nøglen som bearer', async () => {
  const calls: { url: string; init: RequestInit }[] = []
  const fetchImpl = ((url: string, init: RequestInit) => {
    calls.push({ url, init })
    return Promise.resolve(new Response('{"id":"1"}', { status: 200 }))
  }) as unknown as typeof fetch

  const result = await sendEmail(
    { to: 'gitte@example.com', subject: 'Hej', text: 'Velkommen' },
    { apiKey: 're_secret', from: 'Naturklubben <hej@klub.dk>' },
    fetchImpl,
  )

  assert.deepEqual(result, { ok: true, status: 200 })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://api.resend.com/emails')
  const headers = new Headers(calls[0].init.headers)
  assert.equal(headers.get('Authorization'), 'Bearer re_secret')
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    from: 'Naturklubben <hej@klub.dk>',
    to: ['gitte@example.com'],
    subject: 'Hej',
    text: 'Velkommen',
  })
})

Deno.test(
  'e-mail: et afslag fra udbyderen bliver en kort fejl uden modtager',
  async () => {
    const fetchImpl = (() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            message: 'Domain not verified for gitte@example.com',
            statusCode: 403,
          }),
          { status: 403 },
        ),
      )) as unknown as typeof fetch

    const result = await sendEmail(
      { to: 'gitte@example.com', subject: 'Hej', text: 'Velkommen' },
      { apiKey: 're_secret', from: 'x <x@y.dk>' },
      fetchImpl,
    )

    assert.equal(result.ok, false)
    assert.equal(result.status, 403)
    assert.match(result.error ?? '', /^Mailudbyderen svarede 403/)
  },
)
