import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMembers } from '../features/members/useMembers'
import { BracketView } from '../features/tournament/BracketView'
import { messageForMember } from '../features/tournament/errors'
import { MatchCard } from '../features/tournament/MatchCard'
import { PinkShorts } from '../features/tournament/PinkShorts'
import { rulesSummary } from '../features/tournament/rules'
import {
  computeStandings,
  rankStandings,
  sharedLeaders,
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

function joinNames(names: string[]) {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} og ${names.at(-1)}`
}

/**
 * Kan resultatet trygt fortrydes? En bye har intet resultat at fortryde, og
 * er vinderen allerede rykket videre til en kamp, der selv er afgjort med et
 * rigtigt resultat, ville en fortrydelse trække tæppet væk under det
 * resultat. Er den efterfølgende kamp derimod selv en bye, er den kun
 * afgjort som en automatisk konsekvens af netop dette resultat (se
 * record_tournament_match_result) -- den bliver fortrudt med det samme
 * baglæns, så kæden fortsætter til den kamp, der reelt skal beskyttes.
 */
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
  const { tournamentQuery, recordMatchResult, undoMatchResult } =
    useTournament(tournamentId)
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
  const matchesById = new Map(matches.map((match) => [match.id, match]))
  const nameFor = (participantId: string) =>
    participants.find((p) => p.id === participantId)?.display_name ??
    'Ukendt deltager'

  function handleRecordResult(matchId: string, gameWinnerIds: string[]) {
    setResultError(null)
    recordMatchResult.mutate(
      { matchId, gameWinnerIds },
      {
        onError: (error) =>
          setResultError(
            messageForMember(error, 'Resultatet kunne ikke gemmes. Prøv igen.'),
          ),
      },
    )
  }

  function handleUndo(matchId: string) {
    setResultError(null)
    undoMatchResult.mutate(matchId, {
      onError: (error) =>
        setResultError(
          messageForMember(
            error,
            'Resultatet kunne ikke fortrydes. Prøv igen.',
          ),
        ),
    })
  }

  function isRecording(matchId: string) {
    return (
      recordMatchResult.isPending &&
      recordMatchResult.variables?.matchId === matchId
    )
  }

  function isUndoing(matchId: string) {
    return undoMatchResult.isPending && undoMatchResult.variables === matchId
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
  const leaders = sharedLeaders(rankedStandings, standingsMatches)
  const leaderIds = new Set(leaders.map((leader) => leader.participantId))
  const roundRobinWinnerNames = leaders.map((leader) =>
    nameFor(leader.participantId),
  )

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

      <div className="rounded-xl border border-line-soft bg-surface-sunken p-4">
        <h2 className="text-sm font-medium text-ink-body">Regler</h2>
        <p className="mt-1 text-sm text-ink-subtle">
          {rulesSummary(tournament.format)}
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
          leaderIds={isComplete ? leaderIds : new Set()}
          matches={matches}
          matchesById={matchesById}
          nameFor={nameFor}
          onRecordResult={handleRecordResult}
          isRecording={isRecording}
          onUndo={handleUndo}
          isUndoing={isUndoing}
        />
      ) : (
        <SingleEliminationDetail
          matches={matches}
          matchesById={matchesById}
          nameFor={nameFor}
          isComplete={isComplete}
          onRecordResult={handleRecordResult}
          isRecording={isRecording}
          onUndo={handleUndo}
          isUndoing={isUndoing}
        />
      )}

      {isComplete &&
        tournament.format === 'round_robin' &&
        roundRobinWinnerNames.length > 0 && (
          <WinnerBanner names={roundRobinWinnerNames} />
        )}
      {isComplete && tournament.format === 'single_elimination' && (
        <FinalWinnerBanner matches={matches} nameFor={nameFor} />
      )}
    </div>
  )
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
  return <WinnerBanner names={[nameFor(final.winner_id)]} />
}

function RoundRobinDetail({
  standings,
  leaderIds,
  matches,
  matchesById,
  nameFor,
  onRecordResult,
  isRecording,
  onUndo,
  isUndoing,
}: {
  standings: Standing[]
  leaderIds: ReadonlySet<string>
  matches: TournamentMatch[]
  matchesById: Map<string, TournamentMatch>
  nameFor: (participantId: string) => string
  onRecordResult: (matchId: string, gameWinnerIds: string[]) => void
  isRecording: (matchId: string) => boolean
  onUndo: (matchId: string) => void
  isUndoing: (matchId: string) => boolean
}) {
  return (
    <>
      <StandingsTable
        standings={standings}
        nameFor={nameFor}
        leaderIds={leaderIds}
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
            submitting={isRecording(match.id)}
            canUndo={canUndoMatch(match, matchesById)}
            onUndo={() => onUndo(match.id)}
            undoing={isUndoing(match.id)}
          />
        ))}
      </div>
    </>
  )
}

function SingleEliminationDetail({
  matches,
  matchesById,
  nameFor,
  isComplete,
  onRecordResult,
  isRecording,
  onUndo,
  isUndoing,
}: {
  matches: TournamentMatch[]
  matchesById: Map<string, TournamentMatch>
  nameFor: (participantId: string) => string
  isComplete: boolean
  onRecordResult: (matchId: string, gameWinnerIds: string[]) => void
  isRecording: (matchId: string) => boolean
  onUndo: (matchId: string) => void
  isUndoing: (matchId: string) => boolean
}) {
  const playableMatches = matches.filter(
    (match) =>
      match.status === 'pending' &&
      match.participant1_id !== null &&
      match.participant2_id !== null,
  )
  const undoableMatches = matches.filter((match) =>
    canUndoMatch(match, matchesById),
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
              submitting={isRecording(match.id)}
              canUndo={false}
              onUndo={() => onUndo(match.id)}
              undoing={isUndoing(match.id)}
            />
          ))}
        </div>
      )}

      {undoableMatches.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-medium text-ink-body">
            Seneste resultater
          </h2>
          {undoableMatches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              nameFor={nameFor}
              onRecordResult={(gameWinnerIds) =>
                onRecordResult(match.id, gameWinnerIds)
              }
              submitting={isRecording(match.id)}
              canUndo
              onUndo={() => onUndo(match.id)}
              undoing={isUndoing(match.id)}
            />
          ))}
        </div>
      )}
    </>
  )
}

function TournamentPage() {
  const membersQuery = useMembers()
  const { tournamentsQuery, createTournament, deleteTournament } =
    useTournaments()
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
                  <PinkShorts className="h-6 w-auto shrink-0" />
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
