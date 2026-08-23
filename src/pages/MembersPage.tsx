import { Avatar } from '../components/Avatar'
import { useMembers } from '../features/members/useMembers'

function formatMemberSince(dateString: string) {
  return new Date(dateString).toLocaleDateString('da-DK', {
    year: 'numeric',
    month: 'long',
  })
}

function MembersPage() {
  const { data: members, isLoading } = useMembers()

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-4 text-2xl font-semibold text-green-900">
        Medlemmer
      </h1>

      {isLoading && <p className="text-green-800">Henter medlemmer…</p>}

      {members && members.length === 0 && (
        <p className="text-green-800">Ingen medlemmer endnu.</p>
      )}

      {members && members.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {members.map((member) => {
            const name = member.full_name || 'Unavngivet medlem'
            return (
              <li
                key={member.id}
                className="flex items-center gap-3 rounded-lg border border-green-100 bg-white p-3"
              >
                <Avatar
                  name={name}
                  avatarUrl={member.avatar_url}
                  color={member.chat_color ?? '#16a34a'}
                  size="lg"
                />
                <div className="min-w-0">
                  <p className="truncate font-medium text-green-950">
                    {name}
                    {member.is_admin && (
                      <span className="ml-2 rounded bg-green-800 px-2 py-0.5 align-middle text-xs text-white">
                        Admin
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-green-700">
                    Medlem siden {formatMemberSince(member.created_at)}
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
