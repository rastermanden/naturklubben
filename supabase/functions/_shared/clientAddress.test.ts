import { strict as assert } from 'node:assert'
import { extractTrustedClientAddress } from './clientAddress.ts'

Deno.test('klientadresse: IPv4 normaliseres til adresse og /24', () => {
  assert.deepEqual(
    extractTrustedClientAddress(
      new Headers({ 'cf-connecting-ip': '198.51.100.42' }),
    ),
    { exact: '198.51.100.42', network: '198.51.100.0/24' },
  )
})

Deno.test(
  'klientadresse: IPv6 normaliseres til /64, IPv4-mappet som IPv4',
  () => {
    assert.deepEqual(
      extractTrustedClientAddress(
        new Headers({ 'cf-connecting-ip': '2001:db8:1234:5678::1' }),
      ),
      {
        exact: '2001:db8:1234:5678:0:0:0:1',
        network: '2001:db8:1234:5678:0:0:0:0/64',
      },
    )
    assert.deepEqual(
      extractTrustedClientAddress(
        new Headers({ 'cf-connecting-ip': '::ffff:198.51.100.42' }),
      ),
      { exact: '198.51.100.42', network: '198.51.100.0/24' },
    )
  },
)

Deno.test(
  'klientadresse: kun CF-Connecting-IP tæller, og den fejler lukket',
  () => {
    assert.equal(
      extractTrustedClientAddress(
        new Headers({ 'x-forwarded-for': '203.0.113.9' }),
      ),
      null,
    )
    assert.equal(
      extractTrustedClientAddress(
        new Headers({ 'cf-connecting-ip': '198.51.100.42, 203.0.113.9' }),
      ),
      null,
    )
    assert.equal(
      extractTrustedClientAddress(new Headers({ 'cf-connecting-ip': 'nope' })),
      null,
    )
  },
)
