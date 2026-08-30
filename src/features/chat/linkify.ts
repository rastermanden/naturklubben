/**
 * Klikbare links i chatten (#189).
 *
 * Rent visningslag, ligesom mentions: teksten i databasen ændres ikke, kun
 * det, browseren viser den som. Et link uden skema ("www.dr.dk") får
 * `https://` foran i href'en, men står som skrevet i selve teksten.
 */

const URL_PATTERN = /(https?:\/\/[^\s<>"]+|www\.[^\s<>"]+\.[^\s<>"]+)/gi

// Tegn, en URL sjældent slutter med, når den bare står i en sætning
// ("besøg https://dr.dk." eller "(https://dr.dk)") -- de hører til sætningen,
// ikke til linket.
const TRAILING_PUNCTUATION = /[.,!?:;'"]+$/

export interface LinkMatch {
  start: number
  end: number
  href: string
}

/** Finder links i teksten og hvor meget af den afsluttende tegnsætning der ikke er en del af dem. */
export function findLinkMatches(text: string): LinkMatch[] {
  const matches: LinkMatch[] = []
  for (const match of text.matchAll(URL_PATTERN)) {
    if (match.index === undefined) continue
    let raw = match[0]
    const punctuation = raw.match(TRAILING_PUNCTUATION)?.[0]
    if (punctuation) raw = raw.slice(0, raw.length - punctuation.length)

    // En lukkeparentes/klamme hører kun til sætningen, hvis den ikke matcher
    // en åbning inde i linket selv -- ellers ville f.eks. Wikipedia-links med
    // parentes i blive klippet i stykker.
    const closers: Record<string, string> = { ')': '(', ']': '[', '}': '{' }
    while (raw.length > 0 && raw[raw.length - 1] in closers) {
      const closer = raw[raw.length - 1]
      const opens = raw.split(closers[closer]).length - 1
      const closes = raw.split(closer).length - 1
      if (closes <= opens) break
      raw = raw.slice(0, -1)
    }

    if (!raw) continue
    const href = raw.startsWith('www.') ? `https://${raw}` : raw
    matches.push({ start: match.index, end: match.index + raw.length, href })
  }
  return matches
}

export interface LinkSegment {
  text: string
  href: string | null
}

/** Deler et stykke tekst op i almindelig tekst og links, til visning. */
export function splitLinks(text: string): LinkSegment[] {
  if (!text) return [{ text, href: null }]
  const matches = findLinkMatches(text)
  if (matches.length === 0) return [{ text, href: null }]

  const segments: LinkSegment[] = []
  let cursor = 0
  for (const match of matches) {
    if (match.start > cursor) {
      segments.push({ text: text.slice(cursor, match.start), href: null })
    }
    segments.push({
      text: text.slice(match.start, match.end),
      href: match.href,
    })
    cursor = match.end
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), href: null })
  }
  return segments
}
