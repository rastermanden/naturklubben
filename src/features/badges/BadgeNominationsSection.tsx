import { useState } from 'react'
import { useMembers } from '../members/useMembers'
import { BadgeMedal } from './BadgeMedal'
import { toFriendlyBadgeError } from './badgeErrors'
import {
  approvalCount,
  hasVoted,
  useBadgeNominations,
  useVoteOnNomination,
} from './useBadgeNominations'
import type { BadgeNomination, NominationVote } from './types'

const dateFormatter = new Intl.DateTimeFormat('da-DK', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

export function BadgeNominationsSection({ adminId }: { adminId: string }) {
  const nominationsQuery = useBadgeNominations()
  const membersQuery = useMembers()
  const vote = useVoteOnNomination()

  const [comments, setComments] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const nominations = nominationsQuery.data ?? []
  const nameById = new Map(
    (membersQuery.data ?? []).map((member) => [
      member.id,
      member.full_name?.trim() || 'Unavngivet medlem',
    ]),
  )

  async function handleVote(
    nomination: BadgeNomination,
    chosen: NominationVote,
  ) {
    setStatus(null)
    setError(null)
    const nomineeName = nameById.get(nomination.nominee_id) ?? 'medlemmet'

    try {
      const result = await vote.mutateAsync({
        nominationId: nomination.id,
        vote: chosen,
        comment: comments[nomination.id],
      })
      setComments((current) => ({ ...current, [nomination.id]: '' }))

      if (result.nomination_status === 'approved') {
        setStatus(
          `${nomination.badges.name} er tildelt ${nomineeName}. Det fysiske badge skal være klar inden 24 timer.`,
        )
      } else if (result.nomination_status === 'rejected') {
        setStatus(`Indstillingen af ${nomineeName} er afvist.`)
      } else {
        setStatus(
          `Din godkendelse er registreret (${result.approvals}/2). Der mangler én administrator mere.`,
        )
      }
    } catch (mutationError) {
      setError(toFriendlyBadgeError(mutationError))
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium text-green-900">
        Åbne indstillinger
        {nominations.length > 0 && ` (${nominations.length})`}
      </h2>

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

      {nominationsQuery.isPending && (
        <p className="text-sm text-green-700">Henter indstillinger…</p>
      )}

      {nominationsQuery.isError && (
        <p role="alert" className="text-sm text-red-700">
          Indstillingerne kunne ikke hentes:{' '}
          {toFriendlyBadgeError(nominationsQuery.error)}
        </p>
      )}

      {nominationsQuery.isSuccess && nominations.length === 0 && (
        <p className="text-sm text-green-700">
          Der ligger ingen åbne indstillinger lige nu.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {nominations.map((nomination) => {
          const approvals = approvalCount(nomination)
          const alreadyVoted = hasVoted(nomination, adminId)
          const isNominator = nomination.nominated_by === adminId

          return (
            <li
              key={nomination.id}
              className="flex flex-col gap-3 rounded-lg border border-green-200 px-4 py-3"
            >
              <div className="flex items-start gap-3">
                <BadgeMedal badge={nomination.badges} size="md" decorative />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-green-950">
                    {nameById.get(nomination.nominee_id) ?? 'Ukendt medlem'} ·{' '}
                    {nomination.badges.name}
                  </p>
                  <p className="text-sm text-green-700">
                    Indstillet af{' '}
                    {nameById.get(nomination.nominated_by) ?? 'et medlem'}{' '}
                    {dateFormatter.format(new Date(nomination.created_at))}
                  </p>
                  <p className="text-sm font-medium text-green-800">
                    Godkendelser: {approvals}/2
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-green-900">
                    {nomination.reason}
                  </p>
                </div>
              </div>

              {isNominator ? (
                <p className="text-sm text-amber-800">
                  Du har selv lavet indstillingen og tæller derfor ikke som en
                  af de to godkendere.
                </p>
              ) : alreadyVoted ? (
                <p className="text-sm text-green-700">
                  Du har allerede stemt. Der mangler en anden administrator.
                </p>
              ) : (
                <>
                  <label className="flex flex-col gap-1 text-sm text-green-900">
                    Kommentar (valgfri)
                    <input
                      type="text"
                      maxLength={2000}
                      value={comments[nomination.id] ?? ''}
                      onChange={(event) =>
                        setComments((current) => ({
                          ...current,
                          [nomination.id]: event.target.value,
                        }))
                      }
                      className="rounded border border-green-300 px-3 py-2 text-base text-green-950"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleVote(nomination, 'approve')}
                      disabled={vote.isPending}
                      className="min-h-11 rounded-lg bg-green-800 px-4 py-2 text-white disabled:opacity-50"
                    >
                      Godkend
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleVote(nomination, 'reject')}
                      disabled={vote.isPending}
                      className="min-h-11 rounded-lg border border-red-300 px-4 py-2 text-red-700 disabled:opacity-50"
                    >
                      Afvis
                    </button>
                  </div>
                </>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
