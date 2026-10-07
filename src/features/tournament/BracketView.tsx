import type { TournamentMatch } from './types'

/**
 * Navnet på runden ud fra, hvor mange kampe den har -- ikke hvor langt der
 * er til finalen. Med et deltagerantal, der ikke er en potens af to, har en
 * runde sjældent 2, 4 eller 8 kampe: 5 deltagere giver 3 kampe i runde 1, og
 * dem ville "tæl baglæns fra finalen" kalde en kvartfinale.
 */
function roundLabel(round: number, matchCount: number) {
  if (matchCount === 1) return 'Finale'
  if (matchCount === 2) return 'Semifinale'
  if (matchCount === 4) return 'Kvartfinale'
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

  // `next_match_id`/`next_match_slot` peger fremad. Vendt om kan en tom
  // plads vise, hvilken kamp den venter på, i stedet for bare "Venter…".
  const feederBySlot = new Map<string, TournamentMatch>()
  for (const match of matches) {
    if (match.next_match_id && match.next_match_slot) {
      feederBySlot.set(`${match.next_match_id}:${match.next_match_slot}`, match)
    }
  }

  function emptySlotLabel(match: TournamentMatch, slot: 1 | 2) {
    const feeder = feederBySlot.get(`${match.id}:${slot}`)
    // Ingen kamp fylder nogensinde denne plads: her sidder nogen over.
    if (!feeder) return match.bye ? 'Oversidder' : 'Venter…'
    if (feeder.participant1_id && feeder.participant2_id) {
      return `Vinder af ${nameFor(feeder.participant1_id)}/${nameFor(feeder.participant2_id)}`
    }
    return 'Venter…'
  }

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
                {roundLabel(round, roundMatches.length)}
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
                      emptyLabel={emptySlotLabel(match, 1)}
                      nameFor={nameFor}
                    />
                    <div className="my-1 border-t border-line-soft" />
                    <ParticipantRow
                      participantId={match.participant2_id}
                      isWinner={
                        match.winner_id !== null &&
                        match.winner_id === match.participant2_id
                      }
                      emptyLabel={emptySlotLabel(match, 2)}
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
  emptyLabel,
  nameFor,
}: {
  participantId: string | null
  isWinner: boolean
  /** Hvad pladsen siger, så længe den er tom. */
  emptyLabel: string
  nameFor: (participantId: string) => string
}) {
  return (
    <p
      className={`truncate px-1 py-0.5 ${isWinner ? 'font-semibold text-ink' : 'text-ink-subtle'}`}
    >
      {participantId ? (
        nameFor(participantId)
      ) : (
        <span className="italic">{emptyLabel}</span>
      )}
    </p>
  )
}
