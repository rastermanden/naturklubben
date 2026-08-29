import type { ProfileSummary } from './useProfilesMap'

/**
 * Mentions i chatten (#179).
 *
 * Databasen gemmer bruger-id'er, ikke tekst -- danske navne har mellemrum
 * ("Martin Jensen"), så ren `@ord`-parsing knækker, og et navneskift ville
 * efterlade en død mention. Derfor slår både picker, afsendelse og visning
 * navnet op i profil-kortet: teksten er kun det, afsenderen skrev, mens id'et
 * er det, der bærer betydningen videre til notifikationerne.
 *
 * Prisen ved den model: skifter et medlem navn, står den gamle stavemåde
 * stadig i den gamle beskeds tekst og bliver derfor ikke fremhævet mere. Selve
 * mention'en overlever -- beskeden er stadig markeret for den nævnte, og
 * notifikationen blev sendt til id'et.
 */

/** Samme grænse som check-constraint'en på messages.mentions. */
export const MENTION_LIMIT = 20

const MENTION_SUGGESTION_LIMIT = 8

// Et navn må gerne bestå af flere ord, men på et tidspunkt skriver man bare en
// sætning efter et @ -- så er det ikke længere en søgning efter et medlem.
const MAX_QUERY_WORDS = 3

export interface MentionMember {
  id: string
  name: string
}

export interface MentionQuery {
  /** Indeks for @-tegnet i teksten. */
  start: number
  /** Indeks lige efter det sidst skrevne tegn (markørens position). */
  end: number
  query: string
}

export interface MentionMatch {
  start: number
  end: number
  id: string
}

export interface MentionSegment {
  text: string
  /** Id'et på den nævnte, når stykket er en mention -- ellers null. */
  mentionedId: string | null
}

function fold(value: string) {
  return value.toLocaleLowerCase('da-DK')
}

// Et @ tæller kun som optakt til en mention i starten af teksten eller efter
// mellemrum/parentes -- ellers ville e-mailadresser blive til mentions.
function startsMention(text: string, index: number) {
  if (index === 0) return true
  return /[\s(]/.test(text[index - 1])
}

function endsMention(text: string, index: number) {
  const next = text[index]
  return next === undefined || !/[\p{L}\p{N}]/u.test(next)
}

/**
 * Medlemslisten, pickeren viser: alle med et navn, sorteret som mennesker
 * læser dem. Man selv er ikke med -- en mention af sig selv gør ingenting.
 */
export function mentionMembers(
  profiles: Record<string, ProfileSummary> | undefined,
  excludeId?: string,
): MentionMember[] {
  if (!profiles) return []
  return Object.entries(profiles)
    .filter(([id, profile]) => id !== excludeId && profile.full_name?.trim())
    .map(([id, profile]) => ({ id, name: profile.full_name!.trim() }))
    .sort((left, right) => left.name.localeCompare(right.name, 'da-DK'))
}

/** Er der en mention under skrivning ved markøren? */
export function matchMentionQuery(
  text: string,
  caret: number,
): MentionQuery | null {
  const before = text.slice(0, Math.max(0, Math.min(caret, text.length)))
  const start = before.lastIndexOf('@')
  if (start === -1 || !startsMention(text, start)) return null

  const query = before.slice(start + 1)
  if (/[\n@]/.test(query)) return null
  if (query.split(/[ \t]/).length > MAX_QUERY_WORDS) return null

  return { start, end: before.length, query }
}

/** Medlemmer, hvis navn passer på det, der er skrevet efter @'et. */
export function matchMentionCandidates(
  members: readonly MentionMember[],
  query: string,
  limit = MENTION_SUGGESTION_LIMIT,
): MentionMember[] {
  const needle = fold(query.trim())
  if (!needle) return members.slice(0, limit)
  return members
    .filter((member) => {
      const name = fold(member.name)
      return (
        name.startsWith(needle) ||
        name.split(/\s+/).some((word) => word.startsWith(needle))
      )
    })
    .slice(0, limit)
}

/** Indsætter det valgte navn i stedet for det, der var skrevet efter @'et. */
export function applyMention(
  text: string,
  query: MentionQuery,
  member: MentionMember,
): { text: string; caret: number } {
  const insertion = `@${member.name} `
  return {
    text: text.slice(0, query.start) + insertion + text.slice(query.end),
    caret: query.start + insertion.length,
  }
}

/**
 * Finder de steder i teksten, hvor et medlemsnavn står efter et @. De længste
 * navne prøves først, så "@Anne Marie" ikke bliver til "@Anne" plus løs tekst.
 */
export function findMentionMatches(
  text: string,
  members: readonly MentionMember[],
  preferredIds: readonly string[] = [],
): MentionMatch[] {
  const byName = new Map<string, MentionMember[]>()
  for (const member of members) {
    const key = fold(member.name.trim())
    if (!key) continue
    const existing = byName.get(key)
    if (existing) existing.push(member)
    else byName.set(key, [member])
  }
  const names = [...byName.keys()].sort(
    (left, right) => right.length - left.length,
  )
  const folded = fold(text)

  const matches: MentionMatch[] = []
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '@' || !startsMention(text, index)) continue
    const name = names.find(
      (candidate) =>
        folded.startsWith(candidate, index + 1) &&
        endsMention(text, index + 1 + candidate.length),
    )
    if (!name) continue
    const candidates = byName.get(name)!
    // To medlemmer kan hedde det samme. Har afsenderen valgt en fra listen,
    // vinder det valg -- ellers er den første i listen svaret.
    const member =
      candidates.find((candidate) => preferredIds.includes(candidate.id)) ??
      candidates[0]
    matches.push({ start: index, end: index + 1 + name.length, id: member.id })
    index += name.length
  }
  return matches
}

/**
 * Id'erne, der skal gemmes med beskeden. Både de navne, der er valgt fra
 * listen, og dem der er skrevet i hånden, tælles med -- teksten er facit, så
 * et navn, der bliver rettet væk igen, ikke efterlader en usynlig mention.
 */
export function resolveMentions(
  text: string,
  members: readonly MentionMember[],
  preferredIds: readonly string[] = [],
): string[] {
  const ids: string[] = []
  for (const match of findMentionMatches(text, members, preferredIds)) {
    if (!ids.includes(match.id)) ids.push(match.id)
  }
  return ids.slice(0, MENTION_LIMIT)
}

/**
 * Deler beskedteksten op i almindelige stykker og mentions, så visningen kan
 * fremhæve de sidste. Kun de id'er, beskeden faktisk blev sendt med, tæller --
 * ellers ville et navn skrevet i en gammel besked blive fremhævet med
 * tilbagevirkende kraft.
 */
export function splitMentions(
  content: string,
  mentionedIds: readonly string[],
  members: readonly MentionMember[],
): MentionSegment[] {
  if (mentionedIds.length === 0 || !content) {
    return [{ text: content, mentionedId: null }]
  }
  const mentioned = members.filter((member) => mentionedIds.includes(member.id))
  const matches = findMentionMatches(content, mentioned, mentionedIds).filter(
    (match) => mentionedIds.includes(match.id),
  )
  if (matches.length === 0) return [{ text: content, mentionedId: null }]

  const segments: MentionSegment[] = []
  let cursor = 0
  for (const match of matches) {
    if (match.start > cursor) {
      segments.push({
        text: content.slice(cursor, match.start),
        mentionedId: null,
      })
    }
    segments.push({
      text: content.slice(match.start, match.end),
      mentionedId: match.id,
    })
    cursor = match.end
  }
  if (cursor < content.length) {
    segments.push({ text: content.slice(cursor), mentionedId: null })
  }
  return segments
}
