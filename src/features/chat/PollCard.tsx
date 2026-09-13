import type { PollSummary } from './polls'

/**
 * Selve afstemningskortet i en besked-boble: spørgsmålet står i selve
 * beskeden (content), her er kun svarene med stemmetal og procentbjælke.
 * Egen stemme markeres med en tykkere kant, akkurat som en egen reaktion i
 * MessageReactions.tsx.
 */
export function PollCard({
  poll,
  canClose,
  isVoting = false,
  isClosing = false,
  onVote,
  onClose,
}: {
  poll: PollSummary
  /** Opretteren eller en admin -- samme regel som at slette beskeden. */
  canClose: boolean
  isVoting?: boolean
  isClosing?: boolean
  onVote: (optionId: string) => void
  onClose: () => void
}) {
  return (
    <div className="mt-1 flex flex-col gap-2">
      <ul className="flex flex-col gap-1.5">
        {poll.options.map((option) => (
          <li key={option.id}>
            <button
              type="button"
              onClick={() => onVote(option.id)}
              disabled={poll.closed || isVoting}
              aria-pressed={option.votedByMe}
              aria-label={`${option.votedByMe ? 'Fjern din stemme på' : 'Stem på'} ${option.label}: ${option.count} ${option.count === 1 ? 'stemme' : 'stemmer'}, ${option.percentage} procent`}
              className={`relative flex min-h-11 w-full items-center overflow-hidden rounded-lg border bg-surface/60 px-3 py-2 text-left disabled:opacity-75 ${
                option.votedByMe
                  ? 'border-2 border-accent font-semibold'
                  : 'border-line-strong'
              }`}
            >
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 bg-accent/20"
                style={{ width: `${option.percentage}%` }}
              />
              <span className="relative flex w-full items-center justify-between gap-2">
                <span className="min-w-0 break-words">{option.label}</span>
                <span className="shrink-0 text-xs opacity-75">
                  {option.count} · {option.percentage}%
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="flex flex-wrap items-center gap-x-2 text-xs opacity-75">
        <span>
          {poll.totalVotes === 1 ? '1 stemme' : `${poll.totalVotes} stemmer`}
        </span>
        {poll.closed && <span>Afstemningen er lukket.</span>}
        {canClose && !poll.closed && (
          <button
            type="button"
            onClick={onClose}
            disabled={isClosing}
            className="min-h-11 rounded px-1 font-medium underline-offset-2 hover:underline disabled:opacity-50"
          >
            {isClosing ? 'Lukker…' : 'Luk afstemningen'}
          </button>
        )}
      </p>
    </div>
  )
}
