import { Avatar } from '../components/Avatar'
import { useMembers } from '../features/members/useMembers'

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
  const membersQuery = useMembers()

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-green-900">Medlemmer</h1>
        <p className="text-green-700">Mød de andre medlemmer i Naturklubben.</p>
      </div>

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

            return (
              <li
                key={member.id}
                className="flex min-w-0 items-center gap-4 rounded-xl border border-green-100 bg-white p-4 shadow-sm"
              >
                <Avatar
                  name={name}
                  avatarUrl={member.avatar_url}
                  color={member.chat_color ?? '#16a34a'}
                  size="lg"
                  decorative
                />
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
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}

export default MembersPage
