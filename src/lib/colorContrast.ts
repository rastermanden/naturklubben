type Rgb = [number, number, number]

function parseHexColor(color: string): Rgb | null {
  const match = color.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i)
  if (!match) return null

  const value = match[1]!
  const expanded =
    value.length === 3
      ? value
          .split('')
          .map((character) => character.repeat(2))
          .join('')
      : value

  return [
    Number.parseInt(expanded.slice(0, 2), 16),
    Number.parseInt(expanded.slice(2, 4), 16),
    Number.parseInt(expanded.slice(4, 6), 16),
  ]
}

function relativeLuminance([red, green, blue]: Rgb) {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
  })

  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

export function contrastRatio(foreground: string, background: string) {
  const foregroundRgb = parseHexColor(foreground)
  const backgroundRgb = parseHexColor(background)
  if (!foregroundRgb || !backgroundRgb) return null

  const foregroundLuminance = relativeLuminance(foregroundRgb)
  const backgroundLuminance = relativeLuminance(backgroundRgb)
  const lighter = Math.max(foregroundLuminance, backgroundLuminance)
  const darker = Math.min(foregroundLuminance, backgroundLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

export function readableTextColor(background: string) {
  const whiteContrast = contrastRatio('#ffffff', background)
  const blackContrast = contrastRatio('#000000', background)

  if (whiteContrast === null || blackContrast === null) return '#000000'
  return whiteContrast >= blackContrast ? '#ffffff' : '#000000'
}
