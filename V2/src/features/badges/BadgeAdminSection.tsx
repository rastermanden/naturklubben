import { useState } from 'react'
import {
  badgeErrorMessage,
  useBadgeActions,
  useMyNominations,
  useOpenProductions,
  usePendingNominations,
} from './useBadges'

const dateFormatter = new Intl.DateTimeFormat('da-DK', {
  day: 'numeric',
  month: 'short',
})

function statusText(nomination: { status: string }): string {
  if (nomination.status === 'approved') return 'Tildelt'
  if (nomination.status === 'rejected') return 'Afvist'
  return 'Venter på stemmer'
}

/**
 * Admin-panelets badge-værktøj: køen af indstillinger, der mangler stemmer, og
 * de produktionsopgaver, der ikke er færdige.
 *
 * Der er ingen rute for badges i V2 endnu -- værktøjet er en sektion, som
 * admin-siden kan montere, og det kan stå samme sted som i den gamle app.
 */
export function BadgeAdminSection() {
  const nominations = usePendingNominations()
  const productions = useOpenProductions()
  const { vote, claimProduction, completeProduction } = useBadgeActions()
  const [error, setError] = useState<string | null>(null)

  async function castVote(
    nominationId: Parameters<typeof vote>[0]['nominationId'],
    choice: 'approve' | 'reject',
  ) {
    setError(null)
    try {
      await vote({ nominationId, vote: choice })
    } catch (cause) {
      setError(badgeErrorMessage(cause))
    }
  }

  async function handleProduction(
    productionId: Parameters<typeof claimProduction>[0]['productionId'],
    action: 'claim' | 'complete',
  ) {
    setError(null)
    try {
      if (action === 'claim') {
        await claimProduction({ productionId })
      } else {
        await completeProduction({ productionId })
      }
    } catch (cause) {
      setError(badgeErrorMessage(cause))
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-ink-body">Badges</h2>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold text-ink-body">
          Indstillinger der venter
        </h3>
        {nominations !== undefined && nominations.length === 0 && (
          <p className="text-sm text-ink-subtle">Ingen venter lige nu.</p>
        )}
        <ul className="flex flex-col gap-2">
          {(nominations ?? []).map((nomination) => (
            <li
              key={nomination._id}
              className="flex flex-col gap-2 rounded-xl border border-line-soft bg-surface p-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-ink-body">
                  {nomination.nomineeName} → {nomination.badgeName}
                </span>
                <span className="text-xs text-ink-subtle">
                  {nomination.approveCount}/2 godkendelser
                </span>
              </div>
              <p className="text-sm text-ink-muted">{nomination.reason}</p>
              <p className="text-xs text-ink-subtle">
                Indstillet af {nomination.nominatedByName} ·{' '}
                {dateFormatter.format(new Date(nomination.createdAt))}
              </p>
              {nomination.isOwnNomination && (
                <p className="text-sm text-ink-subtle">
                  Du har selv indstillet — din stemme tæller ikke.
                </p>
              )}
              {!nomination.isOwnNomination && nomination.myVote === null && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void castVote(nomination._id, 'approve')}
                    className="min-h-11 rounded-lg border border-line px-3 py-2 text-sm text-ink-body"
                  >
                    Godkend
                  </button>
                  <button
                    type="button"
                    onClick={() => void castVote(nomination._id, 'reject')}
                    className="min-h-11 rounded-lg border border-danger-line px-3 py-2 text-sm text-danger"
                  >
                    Afvis
                  </button>
                </div>
              )}
              {nomination.myVote !== null && (
                <p className="text-sm text-ink-subtle">Du har stemt.</p>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold text-ink-body">
          Badges der skal laves
        </h3>
        {productions !== undefined && productions.length === 0 && (
          <p className="text-sm text-ink-subtle">Ingen åbne opgaver.</p>
        )}
        <ul className="flex flex-col gap-2">
          {(productions ?? []).map((production) => (
            <li
              key={production._id}
              className="flex flex-col gap-2 rounded-xl border border-line-soft bg-surface p-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-ink-body">
                  {production.badgeName} til {production.profileName}
                </span>
                <span className="text-xs text-ink-subtle">
                  Færdig inden{' '}
                  {dateFormatter.format(new Date(production.dueAt))}
                </span>
              </div>
              {production.claimedByName && (
                <p className="text-xs text-ink-subtle">
                  Taget af {production.claimedByName}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleProduction(production._id, 'claim')}
                  className="min-h-11 rounded-lg border border-line px-3 py-2 text-sm text-ink-body"
                >
                  Tag opgaven
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void handleProduction(production._id, 'complete')
                  }
                  className="min-h-11 rounded-lg border border-line px-3 py-2 text-sm text-ink-body"
                >
                  Marker færdig
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <MyNominationList />
    </section>
  )
}

/** Ens egne indstillinger -- også dem, der blev afvist. */
function MyNominationList() {
  const nominations = useMyNominations()

  if (nominations === undefined || nominations.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-lg font-semibold text-ink-body">Mine indstillinger</h3>
      <ul className="flex flex-col gap-1 text-sm">
        {nominations.map((nomination) => (
          <li
            key={nomination._id}
            className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line-soft py-2 last:border-b-0"
          >
            <span className="text-ink-body">
              {nomination.nomineeName} → {nomination.badgeName}
            </span>
            <span className="text-ink-subtle">{statusText(nomination)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
