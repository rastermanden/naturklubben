import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../../components/Avatar'
import { useMembers, type Member } from '../members/useMembers'
import { toFriendlyAdminRoleError } from './adminRoleErrors'
import { useAdminRoles } from './useAdminRoles'

const changedAtFormatter = new Intl.DateTimeFormat('da-DK', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function memberName(member: Member) {
  return member.full_name?.trim() || 'Unavngivet medlem'
}

export function AdminRolesSection({
  currentUserId,
}: {
  currentUserId: string
}) {
  const navigate = useNavigate()
  const membersQuery = useMembers()
  const { roleChangesQuery, setAdminRole } = useAdminRoles(currentUserId)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleRoleChange(member: Member) {
    const name = memberName(member)
    const makeAdmin = !member.is_admin
    const selfDemotion = member.id === currentUserId && !makeAdmin
    const confirmation = makeAdmin
      ? `Gør ${name} til administrator?\n\nDet giver adgang til admin-panelet og mulighed for at administrere invitationer, ansøgninger og andre adminroller.`
      : selfDemotion
        ? `Fjern din egen adminrolle?\n\nDu mister straks adgang til admin-panelet og kan ikke selv få rollen tilbage. Handlingen gennemføres kun, hvis der er en anden administrator.`
        : `Fjern adminrollen fra ${name}?\n\nPersonen mister straks adgang til admin-panelet.`

    if (!window.confirm(confirmation)) return

    setSuccess(null)
    setError(null)

    try {
      await setAdminRole.mutateAsync({
        targetUserId: member.id,
        makeAdmin,
      })

      if (selfDemotion) {
        window.alert('Din adminrolle er fjernet.')
        navigate('/', { replace: true })
        return
      }

      setSuccess(
        makeAdmin
          ? `${name} er nu administrator.`
          : `${name} er ikke længere administrator.`,
      )
    } catch (mutationError) {
      setError(toFriendlyAdminRoleError(mutationError))
    }
  }

  const members = membersQuery.data ?? []
  const roleChanges = roleChangesQuery.data ?? []

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-medium text-green-900">Medlemmer og adminroller</h2>
        <p className="text-sm text-green-700">
          Administratorer har adgang til hele admin-panelet og kan ændre andres
          roller.
        </p>
      </div>

      {success && (
        <p role="status" className="text-sm text-green-700">
          {success}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      {membersQuery.isPending && (
        <p role="status" className="text-sm text-green-700">
          Henter medlemmer…
        </p>
      )}
      {membersQuery.isError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          <p>Medlemmerne kunne ikke hentes.</p>
          <button
            type="button"
            onClick={() => membersQuery.refetch()}
            className="min-h-11 shrink-0 rounded-lg border border-red-300 px-3 py-2"
          >
            Prøv igen
          </button>
        </div>
      )}

      {membersQuery.isSuccess && members.length === 0 && (
        <p className="text-sm text-green-700">
          Der er ingen medlemmer at vise.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {members.map((member) => {
          const name = memberName(member)

          return (
            <li
              key={member.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-green-200 px-4 py-3"
            >
              <Avatar
                name={name}
                avatarUrl={member.avatar_url}
                color={member.chat_color ?? '#16a34a'}
                size="sm"
                decorative
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-green-950">
                  {name}
                  {member.id === currentUserId && (
                    <span className="font-normal text-green-700"> (dig)</span>
                  )}
                </p>
                <p className="text-sm text-green-700">
                  {member.is_admin ? 'Administrator' : 'Medlem'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleRoleChange(member)}
                disabled={setAdminRole.isPending}
                className={
                  member.is_admin
                    ? 'min-h-11 rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700 disabled:opacity-50'
                    : 'min-h-11 rounded-lg bg-green-800 px-3 py-2 text-sm text-white disabled:opacity-50'
                }
              >
                {member.is_admin ? 'Fjern adminrolle' : 'Gør til administrator'}
              </button>
            </li>
          )
        })}
      </ul>

      <div className="mt-2">
        <h3 className="font-medium text-green-900">Seneste rolleændringer</h3>
        <p className="text-sm text-green-700">
          De seneste 20 ændringer vises her.
        </p>
      </div>

      {roleChangesQuery.isPending && (
        <p role="status" className="text-sm text-green-700">
          Henter rollehistorik…
        </p>
      )}
      {roleChangesQuery.isError && (
        <p role="alert" className="text-sm text-red-700">
          Rollehistorikken kunne ikke hentes.
        </p>
      )}
      {roleChangesQuery.isSuccess && roleChanges.length === 0 && (
        <p className="text-sm text-green-700">
          Der er endnu ingen rolleændringer.
        </p>
      )}

      <ol className="flex flex-col gap-2">
        {roleChanges.map((change) => (
          <li
            key={change.id}
            className="rounded-lg border border-green-100 bg-green-50 px-4 py-3 text-sm"
          >
            <p className="text-green-950">
              <span className="font-medium">{change.actor_name}</span>{' '}
              {change.new_is_admin
                ? 'gjorde'
                : 'fjernede administratorrollen fra'}{' '}
              <span className="font-medium">{change.target_name}</span>
              {change.new_is_admin && ' til administrator'}.
            </p>
            <p className="mt-1 text-xs text-green-700">
              {change.old_is_admin ? 'Administrator' : 'Medlem'} →{' '}
              {change.new_is_admin ? 'Administrator' : 'Medlem'} ·{' '}
              {changedAtFormatter.format(new Date(change.changed_at))}
            </p>
          </li>
        ))}
      </ol>
    </section>
  )
}
