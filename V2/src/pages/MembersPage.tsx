import { Avatar } from '../components/Avatar'
import { useCurrentProfile } from '../features/auth/useCurrentProfile'
import { useMembers } from '../features/members/useMembers'
import { CauseMarks } from '../features/profile/CauseMarks'
import { displayPronouns } from '../features/profile/pronouns'

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
          className="flex items-center gap-4 rounded-xl border border-line-soft bg-surface p-4"
        >
          <span className="h-16 w-16 shrink-0 rounded-full bg-surface-raised motion-safe:animate-pulse" />
          <span className="flex flex-1 flex-col gap-2">
            <span className="h-5 w-3/4 rounded bg-surface-raised motion-safe:animate-pulse" />
            <span className="h-4 w-full rounded bg-surface-sunken motion-safe:animate-pulse" />
          </span>
        </div>
      ))}
      <span className="sr-only">Henter medlemmer…</span>
    </div>
  )
}

/**
 * Medlemslisten.
 *
 * Badges og "indstil til en badge" hører til badge-slicen og er ikke med her;
 * det samme gælder det store avatar-billede, som kræver den fælles
 * dialog-fokusfælde i `src/hooks/`. Se rapporten.
 */
export default function MembersPage() {
  const { profile } = useCurrentProfile()
  const { members, isLoading } = useMembers()

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-body">Medlemmer</h1>
        <p className="text-ink-subtle">
          Mød de andre medlemmer i Naturklubben.
        </p>
      </div>

      {isLoading && <MembersLoadingState />}

      {!isLoading && members.length === 0 && (
        <div className="rounded-xl border border-line-soft bg-surface px-4 py-12 text-center text-ink-subtle">
          Ingen medlemmer at vise endnu.
        </div>
      )}

      {members.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((member) => {
            const name = member.fullName?.trim() || 'Unavngivet medlem'
            const pronouns = displayPronouns(member.pronouns)

            return (
              <li
                key={member._id}
                className="flex min-w-0 flex-col gap-3 rounded-xl border border-line-soft bg-surface p-4 shadow-sm"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <Avatar
                    name={name}
                    avatarUrl={member.avatarUrl ?? null}
                    color={member.chatColor}
                    size="lg"
                    decorative
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="min-w-0 truncate font-medium text-ink">
                        {name}
                        {member._id === profile?._id && (
                          <span className="font-normal text-ink-subtle">
                            {' '}
                            (dig)
                          </span>
                        )}
                      </h2>
                      {pronouns && (
                        <span className="shrink-0 text-sm text-ink-subtle">
                          {pronouns}
                        </span>
                      )}
                      <CauseMarks causes={member.causes} />
                      {member.isAdmin && (
                        <span className="shrink-0 rounded-full bg-surface-raised px-2 py-0.5 text-xs font-medium text-ink-muted">
                          Administrator
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-ink-subtle">
                      Medlem siden{' '}
                      {memberSinceFormatter.format(new Date(member.createdAt))}
                    </p>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
