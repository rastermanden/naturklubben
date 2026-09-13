import type { Standing } from './roundRobin'

interface StandingsTableProps {
  standings: Standing[]
  nameFor: (participantId: string) => string
  showLeader: boolean
}

export function StandingsTable({
  standings,
  nameFor,
  showLeader,
}: StandingsTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line-soft bg-surface">
      <table className="w-full min-w-[26rem] text-left text-sm">
        <thead className="bg-surface-sunken text-ink-subtle">
          <tr>
            <th className="px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">Deltager</th>
            <th className="px-3 py-2 text-center font-medium">Spillet</th>
            <th className="px-3 py-2 text-center font-medium">Vundet</th>
            <th className="px-3 py-2 text-center font-medium">Tabt</th>
            <th className="px-3 py-2 text-center font-medium">Enkeltspil</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((standing, index) => {
            const isLeader = showLeader && index === 0
            return (
              <tr
                key={standing.participantId}
                className={
                  isLeader ? 'bg-surface-raised font-medium' : undefined
                }
              >
                <td className="px-3 py-2 text-ink-subtle">{index + 1}</td>
                <td className="px-3 py-2 text-ink">
                  {nameFor(standing.participantId)}
                  {isLeader && (
                    <span aria-hidden="true" className="ml-2">
                      🏆
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-center">{standing.played}</td>
                <td className="px-3 py-2 text-center">{standing.won}</td>
                <td className="px-3 py-2 text-center">{standing.lost}</td>
                <td className="px-3 py-2 text-center">
                  {standing.gamesWon}–{standing.gamesLost}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
