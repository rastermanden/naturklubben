// Klientens IP-adresse bag Cloudflare, normaliseret til eksakt adresse og
// netværk (/24 for IPv4, /64 for IPv6). Delt af de offentlige formularer
// (prøvemedlemskab og gæsteansøgninger til begivenheder), så
// rate-limit-signalerne dannes ens.

export interface ParsedAddress {
  exact: string
  network: string
}

function parseIpv4(value: string): ParsedAddress | null {
  const parts = value.split('.')
  if (parts.length !== 4) return null

  const octets = parts.map((part) => {
    if (!/^(0|[1-9][0-9]{0,2})$/.test(part)) return null
    const octet = Number(part)
    return octet <= 255 ? octet : null
  })
  if (octets.some((octet) => octet === null)) return null

  const normalized = octets.join('.')
  return {
    exact: normalized,
    network: `${octets[0]}.${octets[1]}.${octets[2]}.0/24`,
  }
}

function ipv6Parts(value: string): number[] | null {
  if (
    value.length === 0 ||
    value.includes('%') ||
    value.startsWith('[') ||
    value.endsWith(']')
  ) {
    return null
  }

  let normalized = value.toLowerCase()
  if (normalized.includes('.')) {
    const lastColon = normalized.lastIndexOf(':')
    if (lastColon < 0) return null
    const ipv4 = parseIpv4(normalized.slice(lastColon + 1))
    if (!ipv4) return null
    const octets = ipv4.exact.split('.').map(Number)
    normalized = `${normalized.slice(0, lastColon)}:${(
      octets[0] * 256 +
      octets[1]
    ).toString(16)}:${(octets[2] * 256 + octets[3]).toString(16)}`
  }

  const halves = normalized.split('::')
  if (halves.length > 2) return null

  const parseHalf = (half: string) => {
    if (half === '') return []
    const parts = half.split(':')
    if (parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null
    return parts.map((part) => Number.parseInt(part, 16))
  }

  const left = parseHalf(halves[0])
  const right = parseHalf(halves[1] ?? '')
  if (!left || !right) return null

  if (halves.length === 1) {
    return left.length === 8 ? left : null
  }

  const missing = 8 - left.length - right.length
  if (missing < 1) return null
  return [...left, ...Array<number>(missing).fill(0), ...right]
}

function parseIpAddress(value: string): ParsedAddress | null {
  const trimmed = value.trim()
  const ipv4 = parseIpv4(trimmed)
  if (ipv4) return ipv4

  const parts = ipv6Parts(trimmed)
  if (!parts) return null

  const isIpv4Mapped =
    parts.slice(0, 5).every((part) => part === 0) && parts[5] === 0xffff
  if (isIpv4Mapped) {
    return parseIpv4(
      [parts[6] >> 8, parts[6] & 0xff, parts[7] >> 8, parts[7] & 0xff].join(
        '.',
      ),
    )
  }

  const normalized = parts.map((part) => part.toString(16)).join(':')
  const network = [...parts.slice(0, 4), 0, 0, 0, 0]
    .map((part) => part.toString(16))
    .join(':')
  return { exact: normalized, network: `${network}/64` }
}

export function extractTrustedClientAddress(
  headers: Headers,
): ParsedAddress | null {
  // Supabase's hosted edge runs behind Cloudflare. CF-Connecting-IP is set on
  // Cloudflare-to-origin traffic; X-Forwarded-For is deliberately ignored
  // because an incoming chain can contain caller-controlled entries.
  const value = headers.get('cf-connecting-ip')
  if (!value || value.includes(',')) return null
  return parseIpAddress(value)
}
