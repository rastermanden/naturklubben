import { useState } from 'react'
import { Avatar } from '../components/Avatar'
import { useAuth } from '../features/auth/useAuth'
import { BadgeShowcase } from '../features/badges/BadgeShowcase'
import { NominateBadgeDialog } from '../features/badges/NominateBadgeDialog'
import { useBadges } from '../features/badges/useBadges'
import {
  groupBadgesByMember,
  useMemberBadges,
} from '../features/badges/useMemberBadges'
import { MemberAvatarLightbox } from '../features/members/MemberAvatarLightbox'
import { useMembers, type Member } from '../features/members/useMembers'

const memberSinceFormatter = new Intl.DateTimeFormat('da-DK', {
  year: 'numeric',
  month: 'long',
})

function MembersLoadingState() {
  return (
    <div
      role="status"
      aria-label="Henter medlemmer"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="flex items-center gap-4 rounded-xl border border-green-100 bg-white p-4"
        >
          <span className="h-16 w-16 shrink-0 rounded-full bg-green-100 motion-safe:animate-pulse" />
          <span className="flex flex-1 flex-col gap-2">
            <span className="h-5 w-3/4 rounded bg-green-100 motion-safe:animate-pulse" />
            <span className="h-4 w-full rounded bg-green-50 motion-safe:animate-pulse" />
          </span>
        </div>
      ))}
      <span className="sr-only">Henter medlemmer…</span>
    </div>
  )
}

function MembersPage() {
  const { session } = useAuth()
  const currentUserId = session?.user.id
  const membersQuery = useMembers()
  const memberBadgesQuery = useMemberBadges()
  const badgesQuery = useBadges()
  const [activeMember, setActiveMember] = useState<Member | null>(null)
  const [nominating, setNominating] = useState<Member | null>(null)
  const [nominationStatus, setNominationStatus] = useState<string | null>(null)

  const badgesByMember = groupBadgesByMember(memberBadgesQuery.data)
  const activeBadges = (badgesQuery.data ?? []).filter(
    (badge) => badge.is_active,
  )
  const nameFor = (profileId: string) =>
    membersQuery.data
      ?.find((member) => member.id === profileId)
      ?.full_name?.trim() ?? null

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-green-900">Medlemmer</h1>
        <p className="text-green-700">
          Mød de andre medlemmer i Naturklubben -- og indstil dem til en badge,
          de fortjener.
        </p>
      </div>

      {nominationStatus && (
        <p role="status" className="text-sm text-green-700">
          {nominationStatus}
        </p>
      )}

      {membersQuery.isPending && <MembersLoadingState />}

      {membersQuery.isError && (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 sm:flex-row sm:items-center sm:justify-between"
        >
          <p>Medlemmerne kunne ikke hentes.</p>
          <button
            type="button"
            onClick={() => membersQuery.refetch()}
            className="min-h-11 rounded-lg border border-red-300 px-4 py-2 font-medium"
          >
            Prøv igen
          </button>
        </div>
      )}

      {membersQuery.data?.length === 0 && (
        <div className="rounded-xl border border-green-100 bg-white px-4 py-12 text-center text-green-700">
          Ingen medlemmer at vise endnu.
        </div>
      )}

      {membersQuery.data && membersQuery.data.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {membersQuery.data.map((member) => {
            const name = member.full_name?.trim() || 'Unavngivet medlem'
            const memberBadges = badgesByMember.get(member.id) ?? []

            return (
              <li
                key={member.id}
                className="flex min-w-0 flex-col gap-3 rounded-xl border border-green-100 bg-white p-4 shadow-sm"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setActiveMember(member)}
                    aria-label={`Se stort billede af ${name}`}
                    className="shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
                  >
                    <Avatar
                      name={name}
                      avatarUrl={member.avatar_url}
                      color={member.chat_color ?? '#16a34a'}
                      size="lg"
                      decorative
                    />
                  </button>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="min-w-0 truncate font-medium text-green-950">
                        {name}
                      </h2>
                      {member.is_admin && (
                        <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                          Administrator
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-green-700">
                      Medlem siden{' '}
                      {memberSinceFormatter.format(new Date(member.created_at))}
                    </p>
                  </div>
                </div>

                <BadgeShowcase
                  badges={memberBadges}
                  nameFor={nameFor}
                  size="sm"
                />

                {currentUserId && member.id !== currentUserId && (
                  <button
                    type="button"
                    onClick={() => {
                      setNominationStatus(null)
                      setNominating(member)
                    }}
                    className="min-h-11 self-start rounded-lg border border-green-300 px-3 py-2 text-sm text-green-800"
                  >
                    Indstil til en badge
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {activeMember && (
        <MemberAvatarLightbox
          member={activeMember}
          onClose={() => setActiveMember(null)}
        />
      )}

      {nominating && (
        <NominateBadgeDialog
          nomineeId={nominating.id}
          nomineeName={nominating.full_name?.trim() || 'medlemmet'}
          badges={activeBadges}
          onClose={() => setNominating(null)}
          onNominated={(badgeName) =>
            setNominationStatus(
              `Indstillingen til ${badgeName} er sendt. To administratorer skal godkende den.`,
            )
          }
        />
      )}
    </main>
  )
}

export default MembersPage
