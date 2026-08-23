/**
 * Reaktioner på chatbeskeder (#105).
 *
 * Ren logik uden Supabase-afhængighed, så aggregeringen kan enhedstestes
 * direkte -- samme opdeling som optimizationStatus.ts i galleriet.
 */

/**
 * Fast sæt, som databasens check-constraint spejler (se migrationen
 * 20260823190000_message_reactions.sql). Rækkefølgen her er også den, chippene
 * vises i, så de ikke hopper rundt, når antallene ændrer sig.
 */
export const REACTION_EMOJI = ['👍', '❤️', '😂', '😮', '🙏'] as const

export type ReactionEmoji = (typeof REACTION_EMOJI)[number]

export interface Reaction {
  message_id: string
  user_id: string
  emoji: string
}

export interface ReactionSummary {
  emoji: string
  count: number
  /** Reagerede den aktuelle bruger selv med denne emoji? */
  reactedByMe: boolean
  /** Navne på dem, der har reageret -- i visningsrækkefølge. */
  names: string[]
}

function isSameReaction(a: Reaction, b: Reaction) {
  return (
    a.message_id === b.message_id &&
    a.user_id === b.user_id &&
    a.emoji === b.emoji
  )
}

/**
 * Tilføjer en reaktion uden at kunne skabe dubletter. Idempotensen er ikke
 * pyntelig: klienten opdaterer optimistisk med det samme, og bagefter kommer
 * den *samme* reaktion retur gennem Realtime. Uden dedup ville ens egen
 * reaktion blive talt to gange, indtil listen blev hentet forfra.
 */
export function addReaction(
  current: Reaction[] | undefined,
  reaction: Reaction,
): Reaction[] {
  if (!current) return [reaction]
  if (current.some((existing) => isSameReaction(existing, reaction))) {
    return current
  }
  return [...current, reaction]
}

export function removeReaction(
  current: Reaction[] | undefined,
  reaction: Reaction,
): Reaction[] {
  if (!current) return []
  return current.filter((existing) => !isSameReaction(existing, reaction))
}

/**
 * Grupperer hele vinduets reaktioner på besked-id én gang. Uden det ville
 * hver boble filtrere hele listen igennem for sig selv -- 100 gennemløb pr.
 * render i et rum med 100 indlæste beskeder.
 */
export function groupReactionsByMessage(
  reactions: Reaction[] | undefined,
): Map<string, Reaction[]> {
  const grouped = new Map<string, Reaction[]>()
  for (const reaction of reactions ?? []) {
    const existing = grouped.get(reaction.message_id)
    if (existing) existing.push(reaction)
    else grouped.set(reaction.message_id, [reaction])
  }
  return grouped
}

/**
 * Samler én beskeds reaktioner til det, boblen skal vise. Emoji uden
 * reaktioner udelades, så en besked kun bærer de chips, nogen faktisk har
 * trykket på.
 */
export function summarizeReactions(
  forMessage: Reaction[] | undefined,
  currentUserId: string,
  nameFor: (userId: string) => string,
): ReactionSummary[] {
  if (!forMessage || forMessage.length === 0) return []

  return REACTION_EMOJI.map((emoji) => {
    const matching = forMessage.filter((reaction) => reaction.emoji === emoji)
    return {
      emoji,
      count: matching.length,
      reactedByMe: matching.some(
        (reaction) => reaction.user_id === currentUserId,
      ),
      names: matching.map((reaction) =>
        reaction.user_id === currentUserId ? 'Dig' : nameFor(reaction.user_id),
      ),
    }
  }).filter((summary) => summary.count > 0)
}

/** Tilgængeligt navn til en chip: hvem reagerede, ikke bare hvor mange. */
export function reactionLabel(summary: ReactionSummary) {
  const who = summary.names.join(', ')
  return summary.reactedByMe
    ? `Fjern din ${summary.emoji}-reaktion. ${who}`
    : `Reagér med ${summary.emoji}. ${who}`
}
