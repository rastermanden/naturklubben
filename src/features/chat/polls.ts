/**
 * Afstemninger i chatten (#217).
 *
 * Ren logik uden Supabase-afhængighed, så optællingen kan enhedstestes
 * direkte -- samme opdeling som reactions.ts.
 */

export interface PollOption {
  id: string
  poll_id: string
  position: number
  label: string
}

export interface PollVote {
  poll_id: string
  user_id: string
  option_id: string
}

export interface Poll {
  id: string
  message_id: string
  question: string
  created_by: string | null
  closed_at: string | null
  closed_by: string | null
  options: PollOption[]
  votes: PollVote[]
}

export interface PollOptionSummary {
  id: string
  label: string
  count: number
  /** Rundet til nærmeste hele procent; 0, når ingen har stemt endnu. */
  percentage: number
  votedByMe: boolean
}

export interface PollSummary {
  id: string
  question: string
  closed: boolean
  createdBy: string | null
  totalVotes: number
  options: PollOptionSummary[]
  /** Den mulighed, den aktuelle bruger selv har stemt på -- eller ingen. */
  ownVoteOptionId: string | null
}

/**
 * Grupperer afstemninger på deres besked-id. Der er højst én afstemning pr.
 * besked (unikt indeks i databasen), så et map er nok -- ingen liste pr.
 * nøgle, som groupReactionsByMessage har brug for.
 */
export function groupPollsByMessage(
  polls: Poll[] | undefined,
): Map<string, Poll> {
  const grouped = new Map<string, Poll>()
  for (const poll of polls ?? []) {
    grouped.set(poll.message_id, poll)
  }
  return grouped
}

/**
 * Samler én afstemnings svar, stemmetal og procenter til det, boblen skal
 * vise. Svarene står i den rækkefølge, de blev skrevet i kommandoen
 * (`position`), ikke i stemmetalsrækkefølge -- ellers ville rækkefølgen
 * hoppe rundt, mens folk stemmer.
 */
export function summarizePoll(poll: Poll, currentUserId: string): PollSummary {
  const totalVotes = poll.votes.length
  const ownVote = poll.votes.find((vote) => vote.user_id === currentUserId)

  const options = [...poll.options]
    .sort((a, b) => a.position - b.position)
    .map((option) => {
      const count = poll.votes.filter(
        (vote) => vote.option_id === option.id,
      ).length
      return {
        id: option.id,
        label: option.label,
        count,
        percentage:
          totalVotes === 0 ? 0 : Math.round((count / totalVotes) * 100),
        votedByMe: ownVote?.option_id === option.id,
      }
    })

  return {
    id: poll.id,
    question: poll.question,
    closed: poll.closed_at !== null,
    createdBy: poll.created_by,
    totalVotes,
    options,
    ownVoteOptionId: ownVote?.option_id ?? null,
  }
}

/** Tilføjer eller erstatter en afstemning (samme id) -- til create_poll's svar. */
export function upsertPoll(current: Poll[] | undefined, poll: Poll): Poll[] {
  if (!current) return [poll]
  const index = current.findIndex((existing) => existing.id === poll.id)
  if (index === -1) return [...current, poll]
  const updated = [...current]
  updated[index] = poll
  return updated
}

/**
 * Sætter en stemme lokalt -- bruges både optimistisk, når man selv stemmer,
 * og når Realtime-ekkoet af den samme stemme kommer retur. (poll_id, user_id)
 * er unikt, så en ny stemme erstatter den gamle i stedet for at lægge sig ved
 * siden af den, akkurat som databasens primærnøgle gør det.
 */
export function setPollVote(
  current: Poll[] | undefined,
  vote: PollVote,
): Poll[] {
  if (!current) return []
  return current.map((poll) => {
    if (poll.id !== vote.poll_id) return poll
    const votes = poll.votes.filter(
      (existing) => existing.user_id !== vote.user_id,
    )
    return { ...poll, votes: [...votes, vote] }
  })
}

/** Markerer en afstemning som lukket -- til close_poll's optimistiske opdatering. */
export function closePollLocally(
  current: Poll[] | undefined,
  pollId: string,
  closedBy: string,
  closedAt: string,
): Poll[] {
  if (!current) return []
  return current.map((poll) =>
    poll.id === pollId
      ? { ...poll, closed_at: closedAt, closed_by: closedBy }
      : poll,
  )
}
