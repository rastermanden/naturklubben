import { useState } from 'react'
import { useMembers } from '../members/useMembers'
import { BadgeMedal } from './BadgeMedal'
import { toFriendlyBadgeError } from './badgeErrors'
import { productionDeadline } from './productionCountdown'
import { badgeImageUrl } from './useBadges'
import {
  useBadgeProductions,
  useClaimProduction,
  useCompleteProduction,
} from './useBadgeProductions'
import type { BadgeProduction } from './types'

const dateFormatter = new Intl.DateTimeFormat('da-DK', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

export function BadgeProductionsSection({ adminId }: { adminId: string }) {
  const productionsQuery = useBadgeProductions()
  const membersQuery = useMembers()
  const claim = useClaimProduction()
  const complete = useCompleteProduction()

  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const productions = productionsQuery.data ?? []
  const open = productions.filter((entry) => entry.status !== 'done')
  const nameById = new Map(
    (membersQuery.data ?? []).map((member) => [
      member.id,
      member.full_name?.trim() || 'Unavngivet medlem',
    ]),
  )

  async function run(
    action: 'claim' | 'complete',
    production: BadgeProduction,
  ) {
    setStatus(null)
    setError(null)
    try {
      if (action === 'claim') {
        await claim.mutateAsync(production.id)
        setStatus(`Du står nu for ${production.member_badges.badges.name}.`)
      } else {
        await complete.mutateAsync(production.id)
        setStatus(
          `${production.member_badges.badges.name} er markeret som produceret.`,
        )
      }
    } catch (mutationError) {
      setError(toFriendlyBadgeError(mutationError))
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-medium text-green-900">
          Produktion af fysiske badges{open.length > 0 && ` (${open.length})`}
        </h2>
        <p className="text-sm text-green-700">
          Et tildelt badge skal være produceret inden 24 timer. Hent trykfilen,
          tag opgaven, og markér den som færdig, når badget er udleveret.
        </p>
      </div>

      {status && (
        <p role="status" className="text-sm text-green-700">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      {productionsQuery.isPending && (
        <p className="text-sm text-green-700">Henter produktionslisten…</p>
      )}

      {productionsQuery.isError && (
        <p role="alert" className="text-sm text-red-700">
          Produktionslisten kunne ikke hentes:{' '}
          {toFriendlyBadgeError(productionsQuery.error)}
        </p>
      )}

      {productionsQuery.isSuccess && productions.length === 0 && (
        <p className="text-sm text-green-700">
          Der er ingen badges at producere lige nu.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {productions.map((production) => {
          const deadline = productionDeadline(production)
          const badge = production.member_badges.badges
          const memberName =
            nameById.get(production.member_badges.profile_id) ?? 'et medlem'

          return (
            <li
              key={production.id}
              className={`flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 ${
                deadline.overdue
                  ? 'border-red-300 bg-red-50'
                  : 'border-green-200'
              }`}
            >
              <BadgeMedal badge={badge} size="md" decorative />
              <div className="min-w-0 flex-1">
                <p className="text-green-950">
                  {badge.name} til {memberName}
                </p>
                <p className="text-sm text-green-700">
                  Frist {dateFormatter.format(new Date(production.due_at))} ·{' '}
                  <span
                    className={
                      deadline.overdue ? 'font-medium text-red-700' : ''
                    }
                  >
                    {deadline.label}
                  </span>
                </p>
                {production.claimed_by && production.status !== 'done' && (
                  <p className="text-sm text-green-700">
                    Taget af{' '}
                    {production.claimed_by === adminId
                      ? 'dig'
                      : (nameById.get(production.claimed_by) ??
                        'en administrator')}
                  </p>
                )}
                {production.status === 'done' && production.completed_at && (
                  <p className="text-sm text-green-700">
                    Produceret{' '}
                    {dateFormatter.format(new Date(production.completed_at))}
                  </p>
                )}
                {badge.print_status !== 'ready' && (
                  <p className="text-sm text-amber-800">
                    Trykfilen er ikke klar endnu -- lav den i badge-kataloget.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {badge.print_path && (
                  <a
                    href={badgeImageUrl(badge.print_path)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-11 rounded-lg border border-green-300 px-3 py-2 text-sm text-green-800"
                  >
                    Hent trykfil
                  </a>
                )}
                {production.status === 'pending' && (
                  <button
                    type="button"
                    onClick={() => void run('claim', production)}
                    disabled={claim.isPending}
                    className="min-h-11 rounded-lg border border-green-300 px-3 py-2 text-sm text-green-800 disabled:opacity-50"
                  >
                    Tag opgaven
                  </button>
                )}
                {production.status !== 'done' && (
                  <button
                    type="button"
                    onClick={() => void run('complete', production)}
                    disabled={complete.isPending}
                    className="min-h-11 rounded-lg bg-green-800 px-4 py-2 text-sm text-white disabled:opacity-50"
                  >
                    Markér som produceret
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
