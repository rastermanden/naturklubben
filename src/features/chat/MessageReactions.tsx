import {
  REACTION_EMOJI,
  reactionLabel,
  type ReactionSummary,
} from './reactions'

/**
 * Chips under en besked. Kun emoji, nogen faktisk har trykket på, får en chip
 * -- ellers ville hver eneste boble bære fem tomme knapper. Vælgeren nås i
 * stedet fra handlingsrækken ved siden af "Svar".
 */
export function MessageReactions({
  summaries,
  onToggle,
  isOwn,
}: {
  summaries: ReactionSummary[]
  onToggle: (emoji: string) => void
  isOwn: boolean
}) {
  if (summaries.length === 0) return null

  return (
    <ul className={`mt-1 flex flex-wrap gap-1 ${isOwn ? 'justify-end' : ''}`}>
      {summaries.map((summary) => (
        <li key={summary.emoji}>
          <button
            type="button"
            onClick={() => onToggle(summary.emoji)}
            aria-pressed={summary.reactedByMe}
            aria-label={reactionLabel(summary)}
            title={summary.names.join(', ')}
            // Egen reaktion markeres med en tykkere kant og fed tekst, ikke
            // kun med farve.
            className={`flex min-h-11 items-center gap-1 rounded-full bg-surface/80 px-2.5 text-sm text-ink ${
              summary.reactedByMe
                ? 'border-2 border-accent font-semibold'
                : 'border border-line-strong'
            }`}
          >
            <span aria-hidden="true">{summary.emoji}</span>
            <span>{summary.count}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/**
 * Selve vælgeren. Vises kun, når medlemmet har åbnet den, så handlingsrækken
 * under beskeden ikke fyldes med fem knapper på en telefon.
 */
export function ReactionPicker({
  summaries,
  onToggle,
}: {
  summaries: ReactionSummary[]
  onToggle: (emoji: string) => void
}) {
  return (
    <ul className="mt-1 flex flex-wrap gap-1">
      {REACTION_EMOJI.map((emoji) => {
        const reactedByMe = summaries.some(
          (summary) => summary.emoji === emoji && summary.reactedByMe,
        )
        return (
          <li key={emoji}>
            <button
              type="button"
              onClick={() => onToggle(emoji)}
              aria-pressed={reactedByMe}
              aria-label={
                reactedByMe
                  ? `Fjern din ${emoji}-reaktion`
                  : `Reagér med ${emoji}`
              }
              className={`flex h-11 w-11 items-center justify-center rounded-full bg-surface/80 ${
                reactedByMe
                  ? 'border-2 border-accent'
                  : 'border border-line-strong'
              }`}
            >
              <span aria-hidden="true">{emoji}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
