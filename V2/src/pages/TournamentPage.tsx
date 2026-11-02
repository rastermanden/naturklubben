import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { rulesSummary } from '../../convex/rules'
import { BracketView } from '../features/tournament/BracketView'
import { MatchCard } from '../features/tournament/MatchCard'
import { PinkShorts } from '../features/tournament/PinkShorts'
import { StandingsTable } from '../features/tournament/StandingsTable'
import { TournamentSetupForm } from '../features/tournament/TournamentSetupForm'
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
  month: 'long',
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

function CreateTournamentForm({
  onCreated,
}: {
  onCreated: (tournamentId: Id<'tournaments'>) => void
}) {
  const candidates = useParticipantCandidates()
  const { create } = useTournamentActions()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <TournamentSetupForm
      members={(candidates ?? []).map((candidate) => ({
        id: candidate.profileId,
        fullName: candidate.displayName,
        avatarUrl: candidate.avatarUrl,
        chatColor: candidate.chatColor,
      }))}
      submitting={busy}
      error={error}
      onSubmit={(input) => {
        setBusy(true)
        setError(null)
        void create(input)
          .then(onCreated)
          .catch((cause: unknown) => setError(tournamentErrorMessage(cause)))
          .finally(() => setBusy(false))
      }}
    />
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
  const [viewingId, setViewingId] = useState<Id<'tournaments'> | undefined>()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const { record, undo, removeTournament } = useTournamentActions()

  const detail = useTournament(viewingId)

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
    if (!window.confirm('Vil du slette turneringen og alle dens resultater?')) {
      return
    }
    setError(null)
    setRemoving(true)
    try {
      await removeTournament({ tournamentId })
      setViewingId(undefined)
    } catch (cause) {
      setError(tournamentErrorMessage(cause))
    } finally {
      setRemoving(false)
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

  if (viewingId) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setViewingId(undefined)}
            className="text-sm text-accent-soft underline"
          >
            ← Alle turneringer
          </button>
          {detail !== undefined && (
            <button
              type="button"
              onClick={() => void handleRemove(detail.tournament._id)}
              disabled={removing}
              className="min-h-11 rounded-lg border border-danger-line-strong px-4 py-2 text-sm text-danger disabled:opacity-60"
            >
              {removing ? 'Sletter…' : 'Nulstil turnering'}
            </button>
          )}
        </div>
        {detail === undefined && (
          <p className="text-ink-subtle">Henter turnering…</p>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {detail !== undefined && (
          <section className="flex flex-col gap-6">
            <div>
              <h1 className="text-2xl font-semibold text-ink-body">
                {formatLabel(detail.tournament.format)}
              </h1>
              <p className="text-ink-subtle">
                {statusLabel(detail.tournament.status)} ·{' '}
                {detail.participants.length} deltagere
              </p>
            </div>
            <div className="rounded-xl border border-line-soft bg-surface-sunken p-4">
              <h2 className="text-sm font-medium text-ink-body">Regler</h2>
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
                  <h2 className="text-lg font-medium text-ink-body">Kampe</h2>
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
                  leaderNames.length > 0 && (
                    <WinnerBanner names={leaderNames} />
                  )}
              </>
            ) : (
              <>
                <BracketView matches={viewMatches} nameFor={nameFor} />
                {playable.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <h2 className="text-lg font-medium text-ink-body">
                      Kampe klar til at spille
                    </h2>
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
                    <h2 className="text-lg font-medium text-ink-body">
                      Seneste resultater
                    </h2>
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

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <Link to="/aktiviteter" className="text-sm text-accent-soft underline">
        ← Aktiviteter
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink-body">
            BTG turnering
          </h1>
          <p className="text-ink-subtle">
            Hold styr på kampe, resultater og stilling til klubbens turneringer.
          </p>
        </div>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="min-h-11 rounded-lg bg-accent px-5 py-2 font-medium text-on-accent"
          >
            Ny turnering
          </button>
        )}
      </div>

      {creating && (
        <CreateTournamentForm
          onCreated={(tournamentId) => {
            setViewingId(tournamentId)
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
        <ul className="flex flex-col gap-3">
          {tournaments.map((tournament) => (
            <li key={tournament._id}>
              <button
                type="button"
                onClick={() => setViewingId(tournament._id)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-line-soft bg-surface p-4 text-left hover:bg-surface-sunken"
              >
                <span>
                  <span className="block font-medium text-ink-body">
                    {formatLabel(tournament.format)}
                  </span>
                  <span className="text-sm text-ink-subtle">
                    {dateFormatter.format(new Date(tournament.createdAt))} ·{' '}
                    {statusLabel(tournament.status)}
                  </span>
                </span>
                {tournament.status === 'completed' && (
                  <PinkShorts className="h-6 w-auto shrink-0" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {tournaments !== undefined && tournaments.length === 0 && !creating && (
        <p className="rounded-xl border border-line-soft bg-surface p-6 text-center text-ink-subtle">
          Der er ingen turneringer endnu. Tryk &quot;Ny turnering&quot; for at
          komme i gang.
        </p>
      )}

      {tournaments === undefined && (
        <p className="text-ink-subtle">Henter turneringer…</p>
      )}
    </main>
  )
}
