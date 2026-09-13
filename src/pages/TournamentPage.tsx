import { useState } from 'react'
import { useAuth } from '../features/auth/useAuth'
import { useMembers } from '../features/members/useMembers'
import { BracketView } from '../features/tournament/BracketView'
import { MatchCard } from '../features/tournament/MatchCard'
import {
  computeStandings,
  rankStandings,
  type Standing,
  type StandingsMatch,
} from '../features/tournament/roundRobin'
import { StandingsTable } from '../features/tournament/StandingsTable'
import { TournamentSetupForm } from '../features/tournament/TournamentSetupForm'
import type { Tournament, TournamentMatch } from '../features/tournament/types'
import { useTournament } from '../features/tournament/useTournament'
import { useTournaments } from '../features/tournament/useTournaments'

const formatLabels: Record<Tournament['format'], string> = {
  round_robin: 'Alle-mod-alle',
  single_elimination: 'Udslagsrunder',
}

const statusLabels: Record<Tournament['status'], string> = {
  setup: 'Under opsætning',
  in_progress: 'I gang',
  completed: 'Afsluttet',
}

const dateFormatter = new Intl.DateTimeFormat('da-DK', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

function TournamentDetail({
  tournamentId,
  onBack,
  onDeleted,
  deleteTournament,
}: {
  tournamentId: string
  onBack: () => void
  onDeleted: () => void
  deleteTournament: ReturnType<typeof useTournaments>['deleteTournament']
}) {
  const { tournamentQuery, recordMatchResult } = useTournament(tournamentId)
  const [resultError, setResultError] = useState<string | null>(null)

  if (tournamentQuery.isLoading) {
    return <p className="text-ink-subtle">Henter turnering…</p>
  }

  if (tournamentQuery.isError || !tournamentQuery.data) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-danger-line bg-danger-surface p-4 text-danger-strong"
      >
        Turneringen kunne ikke hentes.
        <button
          type="button"
          onClick={() => tournamentQuery.refetch()}
          className="ml-2 underline"
        >
          Prøv igen
        </button>
      </div>
    )
  }

  const { tournament, participants, matches, games } = tournamentQuery.data
  const nameFor = (participantId: string) =>
    participants.find((p) => p.id === participantId)?.display_name ??
    'Ukendt deltager'

  function handleRecordResult(matchId: string, gameWinnerIds: string[]) {
    setResultError(null)
    recordMatchResult.mutate(
      { matchId, gameWinnerIds },
      {
        onError: () =>
          setResultError('Resultatet kunne ikke gemmes. Prøv igen.'),
      },
    )
  }

  function handleReset() {
    if (!window.confirm(`Vil du slette turneringen og alle dens resultater?`)) {
      return
    }
    deleteTournament.mutate(tournamentId, { onSuccess: onDeleted })
  }

  const isComplete = tournament.status === 'completed'

  const standingsMatches: StandingsMatch[] = matches
    .filter(
      (
        match,
      ): match is TournamentMatch & {
        participant1_id: string
        participant2_id: string
      } => match.participant1_id !== null && match.participant2_id !== null,
    )
    .map((match) => ({
      participant1Id: match.participant1_id,
      participant2Id: match.participant2_id,
      winnerId: match.winner_id,
      games: games
        .filter((game) => game.match_id === match.id)
        .sort((a, b) => a.game_number - b.game_number)
        .map((game) => ({ winnerId: game.winner_id })),
    }))
  const rankedStandings = rankStandings(
    computeStandings(
      participants.map((participant) => participant.id),
      standingsMatches,
    ),
    standingsMatches,
  )
  const roundRobinWinnerName = rankedStandings[0]
    ? nameFor(rankedStandings[0].participantId)
    : null

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-accent-soft underline"
        >
          ← Alle turneringer
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={deleteTournament.isPending}
          className="min-h-11 rounded-lg border border-danger-line-strong px-4 py-2 text-sm text-danger disabled:opacity-60"
        >
          {deleteTournament.isPending ? 'Sletter…' : 'Nulstil turnering'}
        </button>
      </div>

      <div>
        <h1 className="text-2xl font-semibold text-ink-body">
          {formatLabels[tournament.format]}
        </h1>
        <p className="text-ink-subtle">
          {statusLabels[tournament.status]} · {participants.length} deltagere
        </p>
      </div>

      {resultError && (
        <p role="alert" className="text-sm text-danger">
          {resultError}
        </p>
      )}

      {tournament.format === 'round_robin' ? (
        <RoundRobinDetail
          standings={rankedStandings}
          matches={matches}
          nameFor={nameFor}
          isComplete={isComplete}
          onRecordResult={handleRecordResult}
          submitting={recordMatchResult.isPending}
        />
      ) : (
        <SingleEliminationDetail
          matches={matches}
          nameFor={nameFor}
          isComplete={isComplete}
          onRecordResult={handleRecordResult}
          submitting={recordMatchResult.isPending}
        />
      )}

      {isComplete &&
        tournament.format === 'round_robin' &&
        roundRobinWinnerName && <WinnerBanner name={roundRobinWinnerName} />}
      {isComplete && tournament.format === 'single_elimination' && (
        <FinalWinnerBanner matches={matches} nameFor={nameFor} />
      )}
    </div>
  )
}

function WinnerBanner({ name }: { name: string }) {
  return (
    <div
      role="status"
      className="rounded-xl border border-accent-soft bg-surface-raised p-6 text-center"
    >
      <p aria-hidden="true" className="text-3xl">
        🏆
      </p>
      <p className="mt-2 text-lg font-semibold text-ink-body">
        {name} vandt turneringen!
      </p>
    </div>
  )
}

function FinalWinnerBanner({
  matches,
  nameFor,
}: {
  matches: TournamentMatch[]
  nameFor: (participantId: string) => string
}) {
  const maxRound = Math.max(...matches.map((match) => match.round))
  const final = matches.find(
    (match) => match.round === maxRound && match.status === 'completed',
  )
  if (!final?.winner_id) return null
  return <WinnerBanner name={nameFor(final.winner_id)} />
}

function RoundRobinDetail({
  standings,
  matches,
  nameFor,
  isComplete,
  onRecordResult,
  submitting,
}: {
  standings: Standing[]
  matches: TournamentMatch[]
  nameFor: (participantId: string) => string
  isComplete: boolean
  onRecordResult: (matchId: string, gameWinnerIds: string[]) => void
  submitting: boolean
}) {
  return (
    <>
      <StandingsTable
        standings={standings}
        nameFor={nameFor}
        showLeader={isComplete}
      />

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium text-ink-body">Kampe</h2>
        {matches.map((match) => (
          <MatchCard
            key={match.id}
            match={match}
            nameFor={nameFor}
            onRecordResult={(gameWinnerIds) =>
              onRecordResult(match.id, gameWinnerIds)
            }
            submitting={submitting}
          />
        ))}
      </div>
    </>
  )
}

function SingleEliminationDetail({
  matches,
  nameFor,
  isComplete,
  onRecordResult,
  submitting,
}: {
  matches: TournamentMatch[]
  nameFor: (participantId: string) => string
  isComplete: boolean
  onRecordResult: (matchId: string, gameWinnerIds: string[]) => void
  submitting: boolean
}) {
  const playableMatches = matches.filter(
    (match) =>
      match.status === 'pending' &&
      match.participant1_id !== null &&
      match.participant2_id !== null,
  )

  return (
    <>
      <BracketView matches={matches} nameFor={nameFor} />

      {!isComplete && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-medium text-ink-body">
            {playableMatches.length > 0
              ? 'Kampe klar til at spille'
              : 'Venter på resultater'}
          </h2>
          {playableMatches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              nameFor={nameFor}
              onRecordResult={(gameWinnerIds) =>
                onRecordResult(match.id, gameWinnerIds)
              }
              submitting={submitting}
            />
          ))}
        </div>
      )}
    </>
  )
}

function TournamentPage() {
  const { session } = useAuth()
  const userId = session!.user.id
  const membersQuery = useMembers()
  const { tournamentsQuery, createTournament, deleteTournament } =
    useTournaments(userId)
  const [selectedTournamentId, setSelectedTournamentId] = useState<
    string | null
  >(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  if (selectedTournamentId) {
    return (
      <main className="mx-auto w-full max-w-3xl p-4 sm:p-6">
        <TournamentDetail
          tournamentId={selectedTournamentId}
          onBack={() => setSelectedTournamentId(null)}
          onDeleted={() => setSelectedTournamentId(null)}
          deleteTournament={deleteTournament}
        />
      </main>
    )
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink-body">Turnering</h1>
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
        <TournamentSetupForm
          members={membersQuery.data ?? []}
          submitting={createTournament.isPending}
          error={createError}
          onSubmit={(input) => {
            setCreateError(null)
            createTournament.mutate(input, {
              onSuccess: (tournamentId) => {
                setCreating(false)
                setSelectedTournamentId(tournamentId)
              },
              onError: () =>
                setCreateError('Turneringen kunne ikke oprettes. Prøv igen.'),
            })
          }}
        />
      )}

      {tournamentsQuery.isLoading && (
        <p className="text-ink-subtle">Henter turneringer…</p>
      )}

      {tournamentsQuery.isError && (
        <div
          role="alert"
          className="rounded-xl border border-danger-line bg-danger-surface p-4 text-danger-strong"
        >
          Turneringerne kunne ikke hentes.
        </div>
      )}

      {tournamentsQuery.data &&
        tournamentsQuery.data.length === 0 &&
        !creating && (
          <p className="rounded-xl border border-line-soft bg-surface p-6 text-center text-ink-subtle">
            Der er ingen turneringer endnu. Tryk "Ny turnering" for at komme i
            gang.
          </p>
        )}

      {tournamentsQuery.data && tournamentsQuery.data.length > 0 && (
        <ul className="flex flex-col gap-3">
          {tournamentsQuery.data.map((tournament) => (
            <li key={tournament.id}>
              <button
                type="button"
                onClick={() => setSelectedTournamentId(tournament.id)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-line-soft bg-surface p-4 text-left hover:bg-surface-sunken"
              >
                <span>
                  <span className="block font-medium text-ink-body">
                    {formatLabels[tournament.format]}
                  </span>
                  <span className="text-sm text-ink-subtle">
                    {dateFormatter.format(new Date(tournament.created_at))} ·{' '}
                    {statusLabels[tournament.status]}
                  </span>
                </span>
                {tournament.status === 'completed' && (
                  <span aria-hidden="true" className="text-xl">
                    🏆
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

export default TournamentPage
