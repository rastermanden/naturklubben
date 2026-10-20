import { useState } from 'react'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { gamesToWin, rulesSummary } from '../../convex/rules'
import {
  tournamentErrorMessage,
  useParticipantCandidates,
  useTournament,
  useTournamentActions,
  useTournaments,
} from '../features/tournament/useTournaments'

/**
 * Turneringsstyring: opret en turnering med udvalgte medlemmer, se bracketten
 * eller stillingen, og tast resultater ind kamp for kamp.
 *
 * Siden er skrevet til V2 og ligner den gamle sides flow -- opret, spil, tast
 * ind -- men den er kortere, fordi kampene nu laves af mutationen
 * (`convex/tournaments.ts` bruger `bracket.ts`/`roundRobin.ts`) og stillingen
 * ligger som tal i dokumenterne frem for at blive regnet ud i klienten.
 *
 * Resultater tastes ved at trykke på vinderen af hvert enkeltspil; kampen
 * gemmes af sig selv, når én har vundet nok spil. Det er den samme "først til
 * to" som RPC'en krævede, bare uden en gem-knap at glemme.
 */

const dateFormatter = new Intl.DateTimeFormat('da-DK', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

function formatLabel(format: Doc<'tournaments'>['format']): string {
  return format === 'round_robin' ? 'Alle mod alle' : 'Udslagsrunder'
}

function statusLabel(status: Doc<'tournaments'>['status']): string {
  if (status === 'completed') return 'Færdig'
  if (status === 'in_progress') return 'I gang'
  return 'Klar til start'
}

interface CreateFormProps {
  onCreated: (tournamentId: Id<'tournaments'>) => void
}

function CreateTournamentForm({ onCreated }: CreateFormProps) {
  const candidates = useParticipantCandidates()
  const { create } = useTournamentActions()
  const [format, setFormat] =
    useState<Doc<'tournaments'>['format']>('round_robin')
  const [selected, setSelected] = useState<Id<'profiles'>[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function toggle(profileId: Id<'profiles'>) {
    setSelected((current) =>
      current.includes(profileId)
        ? current.filter((id) => id !== profileId)
        : [...current, profileId],
    )
  }

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      // Rækkefølgen er seed-rækkefølgen: den, der vælges først, er seed 1.
      const tournamentId = await create({
        format,
        participantProfileIds: selected,
      })
      onCreated(tournamentId)
    } catch (cause) {
      setError(tournamentErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line-soft bg-surface p-4">
      <h2 className="text-lg font-semibold text-ink-body">Ny turnering</h2>

      <label className="flex flex-col gap-1 text-sm text-ink-muted">
        Format
        <select
          value={format}
          onChange={(event) =>
            setFormat(event.target.value as Doc<'tournaments'>['format'])
          }
          className="min-h-11 rounded-lg border border-line px-3 py-2 text-ink"
        >
          <option value="round_robin">Alle mod alle</option>
          <option value="single_elimination">Udslagsrunder</option>
        </select>
      </label>

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm text-ink-muted">Deltagere</legend>
        {(candidates ?? []).map((candidate) => (
          <label
            key={candidate.profileId}
            className="flex items-center gap-2 text-ink-body"
          >
            <input
              type="checkbox"
              checked={selected.includes(candidate.profileId)}
              onChange={() => toggle(candidate.profileId)}
            />
            {candidate.displayName}
          </label>
        ))}
        {candidates !== undefined && candidates.length === 0 && (
          <p className="text-sm text-ink-subtle">Der er ingen medlemmer endnu.</p>
        )}
      </fieldset>

      <p className="text-sm text-ink-subtle">
        {selected.length} valgt. Rækkefølgen bliver seed-rækkefølgen.
      </p>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || selected.length < 2}
        className="min-h-11 self-start rounded-lg bg-accent px-4 py-2 font-medium text-on-accent disabled:opacity-60"
      >
        {busy ? 'Opretter…' : 'Opret turneringen'}
      </button>
    </section>
  )
}

interface StandingRow {
  participantId: string
  displayName: string
  seed: number
  played: number
  won: number
  lost: number
  gamesWon: number
  gamesLost: number
  isSharedLeader: boolean
}

function StandingsTable({ standings }: { standings: StandingRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-ink-muted">
            <th className="py-2 pr-3">#</th>
            <th className="py-2 pr-3">Deltager</th>
            <th className="py-2 pr-3 text-right">Kampe</th>
            <th className="py-2 pr-3 text-right">Vundet</th>
            <th className="py-2 pr-3 text-right">Tabt</th>
            <th className="py-2 text-right">Spil</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((standing, index) => (
            <tr
              key={standing.participantId}
              className="border-b border-line-soft last:border-b-0"
            >
              <td className="py-2 pr-3 tabular-nums text-ink-subtle">
                {standing.isSharedLeader ? '🏆' : index + 1}
              </td>
              <td className="py-2 pr-3 text-ink-body">
                {standing.displayName}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {standing.played}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {standing.won}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {standing.lost}
              </td>
              <td className="py-2 text-right tabular-nums">
                {standing.gamesWon}–{standing.gamesLost}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {standings.some((standing) => standing.isSharedLeader) && (
        <p className="pt-2 text-sm text-ink-subtle">
          Flere står lige — de deler førstepladsen, indtil nogen vinder.
        </p>
      )}
    </div>
  )
}

interface MatchCardProps {
  match: Doc<'tournamentMatches'>
  names: Map<string, string>
  onRecord: (
    matchId: Id<'tournamentMatches'>,
    gameWinnerIds: Id<'tournamentParticipants'>[],
  ) => Promise<void>
  onUndo: (matchId: Id<'tournamentMatches'>) => Promise<void>
}

function MatchCard({ match, names, onRecord, onUndo }: MatchCardProps) {
  const [tapped, setTapped] = useState<Id<'tournamentParticipants'>[]>([])
  const needed = gamesToWin(match.bestOf)

  function label(participantId: Id<'tournamentParticipants'> | undefined) {
    if (participantId === undefined) return 'Venter'
    return names.get(participantId) ?? 'Ukendt'
  }

  async function tap(participantId: Id<'tournamentParticipants'>) {
    const next = [...tapped, participantId]
    const wins = next.filter((id) => id === participantId).length
    if (wins >= needed) {
      setTapped([])
      await onRecord(match._id, next)
      return
    }
    if (next.length >= match.bestOf) {
      // Flere spil, end kampen går over, kan ikke afgøre den; start forfra.
      setTapped([])
      return
    }
    setTapped(next)
  }

  const waiting =
    match.status === 'pending' &&
    (match.participant1Id === undefined || match.participant2Id === undefined)

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-line-soft bg-surface p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium text-ink-body">
          {label(match.participant1Id)} — {label(match.participant2Id)}
        </span>
        <span className="shrink-0 text-xs text-ink-subtle">
          Bedst af {match.bestOf}
        </span>
      </div>

      {match.bye && (
        <p className="text-sm text-ink-subtle">Bye — går direkte videre</p>
      )}

      {!match.bye && match.status === 'completed' && (
        <p className="text-sm text-ink-body">
          Vinder: {label(match.winnerId)}
        </p>
      )}

      {!match.bye && waiting && (
        <p className="text-sm text-ink-subtle">Mangler en deltager.</p>
      )}

      {!match.bye &&
        match.status === 'pending' &&
        match.participant1Id !== undefined &&
        match.participant2Id !== undefined && (
          <>
            <p className="text-sm text-ink-subtle">
              Tryk på vinderen af hvert spil.
              {tapped.length > 0 &&
                ` Spil ${tapped.length + 1} af højst ${match.bestOf}:`}
            </p>
            <div className="flex flex-wrap gap-2">
              {[match.participant1Id, match.participant2Id].map(
                (participantId) => (
                  <button
                    key={participantId}
                    type="button"
                    onClick={() => void tap(participantId)}
                    className="min-h-11 rounded-lg border border-line px-3 py-2 text-ink-body"
                  >
                    {label(participantId)}
                  </button>
                ),
              )}
            </div>
          </>
        )}

      {!match.bye && match.status === 'completed' && (
        <button
          type="button"
          onClick={() => void onUndo(match._id)}
          className="self-start text-sm text-ink-subtle underline"
        >
          Fortryd resultatet
        </button>
      )}
    </li>
  )
}

export default function TournamentPage() {
  const tournaments = useTournaments()
  const [selectedId, setSelectedId] = useState<Id<'tournaments'> | undefined>()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { record, undo, removeTournament } = useTournamentActions()

  // Nyeste turnering er valgt, indtil nogen vælger en anden.
  const currentId = selectedId ?? tournaments?.[0]?._id
  const detail = useTournament(currentId)

  const names = new Map<string, string>()
  for (const participant of detail?.participants ?? []) {
    names.set(participant._id as string, participant.displayName)
  }

  const rounds = new Map<number, Doc<'tournamentMatches'>[]>()
  for (const match of detail?.matches ?? []) {
    const list = rounds.get(match.round) ?? []
    list.push(match)
    rounds.set(match.round, list)
  }
  const roundNumbers = [...rounds.keys()].sort((a, b) => a - b)

  async function handleRecord(
    matchId: Id<'tournamentMatches'>,
    gameWinnerIds: Id<'tournamentParticipants'>[],
  ) {
    setError(null)
    try {
      await record({ matchId, gameWinnerIds })
    } catch (cause) {
      setError(tournamentErrorMessage(cause))
    }
  }

  async function handleUndo(matchId: Id<'tournamentMatches'>) {
    setError(null)
    try {
      await undo({ matchId })
    } catch (cause) {
      setError(tournamentErrorMessage(cause))
    }
  }

  async function handleRemove(tournamentId: Id<'tournaments'>) {
    if (!window.confirm('Vil du slette turneringen med alle dens kampe?')) {
      return
    }
    setError(null)
    try {
      await removeTournament({ tournamentId })
      setSelectedId(undefined)
    } catch (cause) {
      setError(tournamentErrorMessage(cause))
    }
  }

  const roundRobin = detail?.tournament.format === 'round_robin'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink-body">Turnering</h1>
        <p className="text-ink-subtle">
          Bøssetennisgolf for hele klubben. Opret en turnering, vælg deltagerne,
          og tast resultater ind, mens I spiller.
        </p>
      </div>

      {!creating && (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="min-h-11 self-start rounded-lg bg-accent px-4 py-2 font-medium text-on-accent"
        >
          Ny turnering
        </button>
      )}

      {creating && (
        <CreateTournamentForm
          onCreated={(tournamentId) => {
            setSelectedId(tournamentId)
            setCreating(false)
          }}
        />
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {tournaments !== undefined && tournaments.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-ink-body">Turneringer</h2>
          <ul className="flex flex-col gap-2">
            {tournaments.map((tournament) => (
              <li key={tournament._id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(tournament._id)}
                  className={`flex w-full items-baseline justify-between gap-3 rounded-xl border p-3 text-left ${
                    tournament._id === currentId
                      ? 'border-line-strong bg-surface-sunken'
                      : 'border-line-soft bg-surface'
                  }`}
                >
                  <span className="text-ink-body">
                    {formatLabel(tournament.format)} ·{' '}
                    {tournament.participantCount} deltagere
                  </span>
                  <span className="shrink-0 text-xs text-ink-subtle">
                    {statusLabel(tournament.status)} ·{' '}
                    {dateFormatter.format(new Date(tournament.createdAt))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tournaments !== undefined && tournaments.length === 0 && !creating && (
        <p className="rounded-xl border border-line-soft bg-surface px-4 py-8 text-center text-ink-subtle">
          Der er ingen turneringer endnu.
        </p>
      )}

      {currentId === undefined && tournaments === undefined && (
        <p className="text-ink-subtle">Henter turneringer…</p>
      )}

      {detail !== undefined && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-semibold text-ink-body">
              {formatLabel(detail.tournament.format)}
            </h2>
            <span className="text-sm text-ink-subtle">
              {statusLabel(detail.tournament.status)}
            </span>
          </div>

          <p className="rounded-xl border border-line-soft bg-surface-sunken p-3 text-sm text-ink-muted">
            {rulesSummary(detail.tournament.format)}
          </p>

          {roundRobin && (
            <StandingsTable standings={detail.standings} />
          )}

          {roundNumbers.map((round) => (
            <div key={round} className="flex flex-col gap-2">
              <h3 className="text-lg font-semibold text-ink-body">
                {roundRobin ? 'Kampe' : `Runde ${round}`}
              </h3>
              <ul className="flex flex-col gap-2">
                {(rounds.get(round) ?? []).map((match) => (
                  <MatchCard
                    key={match._id}
                    match={match}
                    names={names}
                    onRecord={handleRecord}
                    onUndo={handleUndo}
                  />
                ))}
              </ul>
            </div>
          ))}

          <button
            type="button"
            onClick={() => void handleRemove(detail.tournament._id)}
            className="min-h-11 self-start rounded-lg border border-danger-line px-4 py-2 text-sm text-danger"
          >
            Slet turneringen
          </button>
        </section>
      )}
    </div>
  )
}
