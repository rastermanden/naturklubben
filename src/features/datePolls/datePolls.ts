/**
 * Datoafstemninger for admins (#288): typer og de rene beregninger --
 * optælling pr. dato, hvilke datoer der passer flest, hvem der mangler at
 * svare, og validering af en ny afstemning. Ingen React og ingen Supabase her,
 * så logikken kan testes for sig.
 */

export type DatePollAnswer = 'yes' | 'maybe' | 'no'

export interface DatePollVote {
  user_id: string
  answer: DatePollAnswer
}

export interface DatePollOption {
  id: string
  position: number
  starts_at: string
  ends_at: string | null
  votes: DatePollVote[]
}

export interface DatePoll {
  id: string
  title: string
  description: string | null
  created_by: string | null
  created_at: string
  closed_at: string | null
  chosen_option_id: string | null
  event_id: string | null
  options: DatePollOption[]
}

/** Grænserne håndhæves også af databasen (create_date_poll). */
export const MIN_DATE_OPTIONS = 2
export const MAX_DATE_OPTIONS = 10
export const MAX_TITLE_LENGTH = 120

export const answerLabels: Record<DatePollAnswer, string> = {
  yes: 'Kan',
  maybe: 'Kan måske',
  no: 'Kan ikke',
}

export interface AnswerCounts {
  yes: number
  maybe: number
  no: number
}

export function countAnswers(option: DatePollOption): AnswerCounts {
  const counts: AnswerCounts = { yes: 0, maybe: 0, no: 0 }
  for (const vote of option.votes) counts[vote.answer] += 1
  return counts
}

export function answerFor(
  option: DatePollOption,
  userId: string,
): DatePollAnswer | null {
  return option.votes.find((vote) => vote.user_id === userId)?.answer ?? null
}

/** Datoerne i den rækkefølge, de blev givet. */
export function sortedOptions(poll: DatePoll): DatePollOption[] {
  return [...poll.options].sort((a, b) => a.position - b.position)
}

/**
 * De datoer, der passer flest: flest "kan", og ved lighed flest "kan måske".
 * Står flere lige, er de alle bedst. Har ingen svaret "kan" eller "kan måske"
 * endnu, er der ingen bedste dato.
 */
export function bestOptionIds(poll: DatePoll): string[] {
  let best: string[] = []
  let bestYes = 0
  let bestMaybe = 0

  for (const option of poll.options) {
    const { yes, maybe } = countAnswers(option)
    if (yes === 0 && maybe === 0) continue
    if (yes > bestYes || (yes === bestYes && maybe > bestMaybe)) {
      best = [option.id]
      bestYes = yes
      bestMaybe = maybe
    } else if (yes === bestYes && maybe === bestMaybe) {
      best.push(option.id)
    }
  }

  return best
}

/** De admins, der ikke har svaret på nogen af datoerne endnu. */
export function missingResponders(
  poll: DatePoll,
  adminIds: readonly string[],
): string[] {
  const answered = new Set(
    poll.options.flatMap((option) => option.votes.map((vote) => vote.user_id)),
  )
  return adminIds.filter((id) => !answered.has(id))
}

/** Åbne afstemninger først, nyeste øverst; derefter de afsluttede. */
export function sortPolls(polls: readonly DatePoll[]): DatePoll[] {
  return [...polls].sort((a, b) => {
    const aClosed = a.closed_at !== null
    const bClosed = b.closed_at !== null
    if (aClosed !== bClosed) return aClosed ? 1 : -1
    return b.created_at.localeCompare(a.created_at)
  })
}

export interface DraftOption {
  /** `datetime-local`-værdi, fx "2026-12-05T10:00". */
  start: string
  end: string
}

export interface DatePollDraft {
  title: string
  description: string
  options: DraftOption[]
}

/**
 * Tjekker en ny afstemning, før den sendes. Tomme datorækker tæller ikke med.
 * Giver en fejlbesked til medlemmet eller null.
 */
export function validateDraft(draft: DatePollDraft): string | null {
  const title = draft.title.trim()
  if (!title) return 'Giv afstemningen et navn.'
  if (title.length > MAX_TITLE_LENGTH) {
    return `Navnet må højst være ${MAX_TITLE_LENGTH} tegn.`
  }

  const filled = draft.options.filter((option) => option.start)
  if (filled.length < MIN_DATE_OPTIONS) {
    return `Angiv mindst ${MIN_DATE_OPTIONS} mulige datoer.`
  }
  if (filled.length > MAX_DATE_OPTIONS) {
    return `Der kan højst være ${MAX_DATE_OPTIONS} datoer.`
  }

  const starts = new Set<number>()
  for (const option of filled) {
    const start = new Date(option.start).getTime()
    if (Number.isNaN(start)) return 'En af datoerne er ugyldig.'
    if (starts.has(start)) return 'Den samme dato står der to gange.'
    starts.add(start)
    if (option.end && new Date(option.end).getTime() < start) {
      return 'En dato slutter, før den starter.'
    }
  }

  return null
}

/** Datoerne, som `create_date_poll` skal have dem. */
export function draftOptionsPayload(
  options: readonly DraftOption[],
): { starts_at: string; ends_at: string | null }[] {
  return options
    .filter((option) => option.start)
    .map((option) => ({
      starts_at: new Date(option.start).toISOString(),
      ends_at: option.end ? new Date(option.end).toISOString() : null,
    }))
}

const dateFormatter = new Intl.DateTimeFormat('da-DK', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})
const timeFormatter = new Intl.DateTimeFormat('da-DK', {
  hour: '2-digit',
  minute: '2-digit',
})

/** "lør. 5. dec. kl. 10.00–14.00" -- slutdatoen skrives ud, hvis den er en anden dag. */
export function formatOptionDate(option: {
  starts_at: string
  ends_at: string | null
}): string {
  const start = new Date(option.starts_at)
  const text = `${dateFormatter.format(start)} kl. ${timeFormatter.format(start)}`
  if (!option.ends_at) return text
  const end = new Date(option.ends_at)
  const sameDay = start.toDateString() === end.toDateString()
  return sameDay
    ? `${text}–${timeFormatter.format(end)}`
    : `${text} – ${dateFormatter.format(end)} kl. ${timeFormatter.format(end)}`
}
