import { strict as assert } from 'node:assert'
import { handleCors, isAllowedCorsOrigin } from './cors.ts'

const endpoint = 'https://project.supabase.co/functions/v1/example'

Deno.test(
  'CORS: produktion og alle GitHub Pages-preview-stier deler en tilladt origin',
  () => {
    assert.equal(isAllowedCorsOrigin('https://rastermanden.github.io'), true)

    const request = new Request(endpoint, {
      method: 'OPTIONS',
      headers: {
        Origin: new URL(
          'https://rastermanden.github.io/naturklubben/pr-preview/pr-128/',
        ).origin,
      },
    })
    const result = handleCors(request, { methods: ['POST'] })

    assert.equal(result.response?.status, 204)
    assert.equal(
      result.response?.headers.get('Access-Control-Allow-Origin'),
      'https://rastermanden.github.io',
    )
    assert.equal(
      result.response?.headers.get('Access-Control-Allow-Methods'),
      'POST, OPTIONS',
    )

    const post = handleCors(
      new Request(endpoint, {
        method: 'POST',
        headers: { Origin: 'https://rastermanden.github.io' },
      }),
      {
        methods: ['POST'],
        exposeHeaders: ['Retry-After', 'X-Request-Id'],
      },
    )
    assert.equal(post.response, null)
    assert.equal(
      post.headers.get('Access-Control-Allow-Origin'),
      'https://rastermanden.github.io',
    )
    assert.equal(
      post.headers.get('Access-Control-Expose-Headers'),
      'Retry-After, X-Request-Id',
    )
  },
)

Deno.test('CORS: localhost og loopback med vilkårlige porte er tilladt', () => {
  assert.equal(isAllowedCorsOrigin('http://localhost:5173'), true)
  assert.equal(isAllowedCorsOrigin('https://localhost:4173'), true)
  assert.equal(isAllowedCorsOrigin('http://127.0.0.1:3000'), true)
  assert.equal(isAllowedCorsOrigin('http://[::1]:5173'), true)
})

Deno.test('CORS: ekstra deployment-origins kan konfigureres eksakt', () => {
  const configured =
    'https://app.naturklubben.dk, https://staging.naturklubben.dk'
  assert.equal(
    isAllowedCorsOrigin('https://app.naturklubben.dk', configured),
    true,
  )
  assert.equal(
    isAllowedCorsOrigin('https://other.naturklubben.dk', configured),
    false,
  )
})

Deno.test(
  'CORS: uvedkommende og lookalike-origins afvises før handleren',
  async () => {
    for (const origin of [
      'https://example.com',
      'https://rastermanden.github.io.example.com',
      'null',
    ]) {
      const result = handleCors(
        new Request(endpoint, { method: 'POST', headers: { Origin: origin } }),
        { methods: ['POST'] },
      )

      assert.equal(result.response?.status, 403)
      assert.equal(
        result.response?.headers.get('Access-Control-Allow-Origin'),
        null,
      )
      assert.deepEqual(await result.response?.json(), {
        code: 'origin_not_allowed',
      })
    }
  },
)

Deno.test(
  'CORS: serverkald og lokale tests uden Origin fortsætter uændret',
  () => {
    const regular = handleCors(new Request(endpoint, { method: 'POST' }), {
      methods: ['POST'],
    })
    const preflight = handleCors(new Request(endpoint, { method: 'OPTIONS' }), {
      methods: ['POST'],
    })

    assert.equal(regular.response, null)
    assert.equal(regular.headers.get('Access-Control-Allow-Origin'), null)
    assert.equal(preflight.response?.status, 204)
  },
)
