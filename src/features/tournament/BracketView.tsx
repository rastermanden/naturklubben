import type { TournamentMatch } from './types'

function roundLabel(round: number, totalRounds: number) {
  const roundsFromFinal = totalRounds - round
  if (roundsFromFinal === 0) return 'Finale'
  if (roundsFromFinal === 1) return 'Semifinale'
  if (roundsFromFinal === 2) return 'Kvartfinale'
  return `Runde ${round}`
}

interface BracketViewProps {
  matches: TournamentMatch[]
  nameFor: (participantId: string) => string
}

/** Rent visuelt overblik over bracketten -- selve resultatindtastningen sker
 * i match-kortene under, hvor knapperne er store nok til en telefon. */
export function BracketView({ matches, nameFor }: BracketViewProps) {
  const rounds = [...new Set(matches.map((match) => match.round))].sort(
    (a, b) => a - b,
  )
  const totalRounds = rounds.length

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max items-stretch gap-6 p-1">
        {rounds.map((round) => {
          const roundMatches = matches
            .filter((match) => match.round === round)
            .sort((a, b) => a.match_index - b.match_index)

          return (
            <div key={round} className="flex w-52 shrink-0 flex-col">
              <h3 className="mb-2 text-center text-sm font-medium text-ink-subtle">
                {roundLabel(round, totalRounds)}
              </h3>
              <div className="flex flex-1 flex-col justify-around gap-4">
                {roundMatches.map((match) => (
                  <div
                    key={match.id}
                    className="rounded-lg border border-line-soft bg-surface p-2 text-sm"
                  >
                    <ParticipantRow
                      participantId={match.participant1_id}
                      isWinner={
                        match.winner_id !== null &&
                        match.winner_id === match.participant1_id
                      }
                      nameFor={nameFor}
                    />
                    <div className="my-1 border-t border-line-soft" />
                    <ParticipantRow
                      participantId={match.participant2_id}
                      isWinner={
                        match.winner_id !== null &&
                        match.winner_id === match.participant2_id
                      }
                      nameFor={nameFor}
                    />
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ParticipantRow({
  participantId,
  isWinner,
  nameFor,
}: {
  participantId: string | null
  isWinner: boolean
  nameFor: (participantId: string) => string
}) {
  return (
    <p
      className={`truncate px-1 py-0.5 ${isWinner ? 'font-semibold text-ink' : 'text-ink-subtle'}`}
    >
      {participantId ? (
        nameFor(participantId)
      ) : (
        <span className="italic">Venter…</span>
      )}
    </p>
  )
}
