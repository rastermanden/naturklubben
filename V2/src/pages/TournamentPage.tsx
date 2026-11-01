import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { rulesSummary } from '../../convex/rules'
import { BracketView } from '../features/tournament/BracketView'
import { MatchCard } from '../features/tournament/MatchCard'
import { PinkShorts } from '../features/tournament/PinkShorts'
import { StandingsTable } from '../features/tournament/StandingsTable'
import type { TournamentMatch } from '../features/tournament/types'
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
  return format === 'round_robin' ? 'Alle-mod-alle' : 'Udslagsrunder'
}

function statusLabel(status: Doc<'tournaments'>['status']): string {
  if (status === 'completed') return 'Afsluttet'
  if (status === 'in_progress') return 'I gang'
  return 'Under opsætning'
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
          <option value="round_robin">Alle-mod-alle</option>
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
          <p className="text-sm text-ink-subtle">
            Der er ingen medlemmer endnu.
          </p>
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

function toViewMatch(match: Doc<'tournamentMatches'>): TournamentMatch {
  return {
    id: match._id,
    tournament_id: match.tournamentId,
    round: match.round,
    match_index: match.matchIndex,
    participant1_id: match.participant1Id ?? null,
    participant2_id: match.participant2Id ?? null,
    winner_id: match.winnerId ?? null,
    status: match.status,
    next_match_id: match.nextMatchId ?? null,
    next_match_slot:
      match.nextMatchSlot === 1 || match.nextMatchSlot === 2
        ? match.nextMatchSlot
        : null,
    bye: match.bye,
    best_of: match.bestOf,
  }
}

function canUndoMatch(
  match: TournamentMatch,
  matchesById: Map<string, TournamentMatch>,
): boolean {
  if (match.status !== 'completed' || match.participant2_id === null) {
    return false
  }
  let current = match
  while (current.next_match_id) {
    const nextMatch = matchesById.get(current.next_match_id)
    if (!nextMatch || nextMatch.status !== 'completed') return true
    if (!nextMatch.bye) return false
    current = nextMatch
  }
  return true
}

function joinNames(names: string[]) {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} og ${names.at(-1)}`
}

function WinnerBanner({ names }: { names: string[] }) {
  const text =
    names.length === 1
      ? `${names[0]} vandt turneringen!`
      : `Delt førsteplads: ${joinNames(names)}!`

  return (
    <div
      role="status"
      className="rounded-xl border border-accent-soft bg-surface-raised p-6 text-center"
    >
      <PinkShorts className="mx-auto h-12 w-auto" />
      <p className="mt-2 text-lg font-semibold text-ink-body">{text}</p>
    </div>
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

  const nameFor = (participantId: string) =>
    detail?.participants.find(
      (participant) => participant._id === participantId,
    )?.displayName ?? 'Ukendt deltager'

  const viewMatches = (detail?.matches ?? []).map(toViewMatch)
  const matchesById = new Map(viewMatches.map((match) => [match.id, match]))
  const [recordingId, setRecordingId] = useState<string | null>(null)
  const [undoingId, setUndoingId] = useState<string | null>(null)

  async function handleRecord(
    matchId: Id<'tournamentMatches'>,
    gameWinnerIds: Id<'tournamentParticipants'>[],
  ) {
    setError(null)
    setRecordingId(matchId)
    try {
      await record({ matchId, gameWinnerIds })
    } catch (cause) {
      setError(tournamentErrorMessage(cause))
    } finally {
      setRecordingId(null)
    }
  }

  async function handleUndo(matchId: Id<'tournamentMatches'>) {
    setError(null)
    setUndoingId(matchId)
    try {
      await undo({ matchId })
    } catch (cause) {
      setError(tournamentErrorMessage(cause))
    } finally {
      setUndoingId(null)
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

  const leaderNames = (detail?.standings ?? [])
    .filter((standing) => standing.isSharedLeader)
    .map((standing) => standing.displayName)
  const playable = viewMatches.filter(
    (match) =>
      match.status === 'pending' &&
      match.participant1_id !== null &&
      match.participant2_id !== null,
  )
  const undoable = viewMatches.filter((match) =>
    canUndoMatch(match, matchesById),
  )

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <Link to="/aktiviteter" className="text-sm text-accent-soft underline">
        ← Aktiviteter
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink-body">BTG turnering</h1>
        <p className="text-ink-subtle">
          Hold styr på kampe, resultater og stilling til klubbens turneringer.
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
                  <span className="flex shrink-0 items-center gap-2 text-xs text-ink-subtle">
                    {statusLabel(tournament.status)} ·{' '}
                    {dateFormatter.format(new Date(tournament.createdAt))}
                    {tournament.status === 'completed' && (
                      <PinkShorts className="h-6 w-auto" />
                    )}
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
        <section className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold text-ink-body">
                {formatLabel(detail.tournament.format)}
              </h2>
              <p className="text-ink-subtle">
                {statusLabel(detail.tournament.status)} ·{' '}
                {detail.participants.length} deltagere
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleRemove(detail.tournament._id)}
              className="min-h-11 rounded-lg border border-danger-line-strong px-4 py-2 text-sm text-danger"
            >
              Nulstil turnering
            </button>
          </div>

          <div className="rounded-xl border border-line-soft bg-surface-sunken p-4">
            <h3 className="text-sm font-medium text-ink-body">Regler</h3>
            <p className="mt-1 text-sm text-ink-subtle">
              {rulesSummary(detail.tournament.format)}
            </p>
          </div>

          {roundRobin ? (
            <>
              <StandingsTable
                standings={detail.standings}
                nameFor={nameFor}
                leaderIds={
                  detail.tournament.status === 'completed'
                    ? new Set(
                        detail.standings
                          .filter((standing) => standing.isSharedLeader)
                          .map((standing) => standing.participantId),
                      )
                    : new Set()
                }
              />
              <div className="flex flex-col gap-3">
                <h3 className="text-lg font-medium text-ink-body">Kampe</h3>
                {viewMatches.map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    nameFor={nameFor}
                    onRecordResult={(gameWinnerIds) =>
                      void handleRecord(
                        match.id as Id<'tournamentMatches'>,
                        gameWinnerIds as Id<'tournamentParticipants'>[],
                      )
                    }
                    submitting={recordingId === match.id}
                    canUndo={canUndoMatch(match, matchesById)}
                    onUndo={() =>
                      void handleUndo(match.id as Id<'tournamentMatches'>)
                    }
                    undoing={undoingId === match.id}
                  />
                ))}
              </div>
              {detail.tournament.status === 'completed' &&
                leaderNames.length > 0 && <WinnerBanner names={leaderNames} />}
            </>
          ) : (
            <>
              <BracketView matches={viewMatches} nameFor={nameFor} />
              {playable.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h3 className="text-lg font-medium text-ink-body">
                    Kampe klar til at spille
                  </h3>
                  {playable.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      nameFor={nameFor}
                      onRecordResult={(gameWinnerIds) =>
                        void handleRecord(
                          match.id as Id<'tournamentMatches'>,
                          gameWinnerIds as Id<'tournamentParticipants'>[],
                        )
                      }
                      submitting={recordingId === match.id}
                      canUndo={false}
                      onUndo={() => undefined}
                      undoing={false}
                    />
                  ))}
                </div>
              )}
              {undoable.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h3 className="text-lg font-medium text-ink-body">
                    Seneste resultater
                  </h3>
                  {undoable.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      nameFor={nameFor}
                      onRecordResult={() => undefined}
                      submitting={false}
                      canUndo
                      onUndo={() =>
                        void handleUndo(match.id as Id<'tournamentMatches'>)
                      }
                      undoing={undoingId === match.id}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      )}
    </main>
  )
}
