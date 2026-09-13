import { useState } from 'react'
import type { TournamentMatch } from './types'

interface MatchCardProps {
  match: TournamentMatch
  nameFor: (participantId: string) => string
  onRecordResult: (gameWinnerIds: string[]) => void
  submitting: boolean
  /** Kan resultatet trygt fortrydes? (Ikke en bye, og den kamp, vinderen
   * eventuelt er rykket videre til, er ikke selv afgjort endnu.) */
  canUndo: boolean
  onUndo: () => void
  undoing: boolean
}

/** Best of three: brugeren vælger vinderen af hvert enkeltspil, appen
 * udregner selv kampvinderen (først til 2 spil vundet). Kaldes kun med
 * kampe, der har begge deltagere sat -- en kamp, der stadig venter på en
 * modstander, vises i stedet i BracketView. */
export function MatchCard({
  match,
  nameFor,
  onRecordResult,
  submitting,
  canUndo,
  onUndo,
  undoing,
}: MatchCardProps) {
  const [gameWinnerIds, setGameWinnerIds] = useState<string[]>([])

  if (match.status === 'completed') {
    return (
      <div className="rounded-xl border border-line-soft bg-surface-sunken p-4">
        <p className="text-sm text-ink-subtle">
          {match.winner_id && nameFor(match.winner_id)} vandt
        </p>
        <p className="text-ink">
          {nameFor(match.participant1_id!)} – {nameFor(match.participant2_id!)}
        </p>
        {canUndo && (
          <button
            type="button"
            onClick={onUndo}
            disabled={undoing}
            className="mt-2 text-sm text-accent-soft underline disabled:opacity-60"
          >
            {undoing ? 'Fortryder…' : 'Fortryd resultat'}
          </button>
        )}
      </div>
    )
  }

  const participant1Id = match.participant1_id!
  const participant2Id = match.participant2_id!
  const wins1 = gameWinnerIds.filter((id) => id === participant1Id).length
  const wins2 = gameWinnerIds.filter((id) => id === participant2Id).length
  const decidedWinnerId =
    wins1 >= 2 ? participant1Id : wins2 >= 2 ? participant2Id : null
  const gameNumber = gameWinnerIds.length + 1

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line-soft bg-surface p-4">
      <div className="flex items-center justify-between text-sm text-ink-subtle">
        <span>
          {nameFor(participant1Id)} – {nameFor(participant2Id)}
        </span>
        <span className="font-medium text-ink">
          {wins1}–{wins2}
        </span>
      </div>

      {!decidedWinnerId && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink-subtle">
            Spil {gameNumber}: hvem vandt?
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() =>
                setGameWinnerIds((prev) => [...prev, participant1Id])
              }
              className="min-h-11 truncate rounded-lg border border-line-strong px-3 py-2 font-medium text-ink hover:bg-surface-sunken"
            >
              {nameFor(participant1Id)}
            </button>
            <button
              type="button"
              onClick={() =>
                setGameWinnerIds((prev) => [...prev, participant2Id])
              }
              className="min-h-11 truncate rounded-lg border border-line-strong px-3 py-2 font-medium text-ink hover:bg-surface-sunken"
            >
              {nameFor(participant2Id)}
            </button>
          </div>
        </div>
      )}

      {gameWinnerIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-subtle">
          <span>Spil: {gameWinnerIds.map((id) => nameFor(id)).join(', ')}</span>
          <button
            type="button"
            onClick={() => setGameWinnerIds((prev) => prev.slice(0, -1))}
            className="text-accent-soft underline"
          >
            Fortryd sidste spil
          </button>
        </div>
      )}

      {decidedWinnerId && (
        <button
          type="button"
          onClick={() => onRecordResult(gameWinnerIds)}
          disabled={submitting}
          className="min-h-11 rounded-lg bg-accent px-4 py-2 font-medium text-on-accent disabled:opacity-60"
        >
          {submitting
            ? 'Gemmer…'
            : `Gem resultat -- ${nameFor(decidedWinnerId)} vinder`}
        </button>
      )}
    </div>
  )
}
