import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../../components/Avatar'
import type { Id } from '../../../convex/_generated/dataModel'
import { AdminSection } from './AdminSection'
import { toFriendlyAdminRoleError } from './adminRoleErrors'
import { useAdminRoles } from './useAdminRoles'
import { useMembers, type Member } from './useMembers'

const changedAtFormatter = new Intl.DateTimeFormat('da-DK', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function memberName(member: Member) {
  return member.fullName?.trim() || 'Unavngivet medlem'
}

/**
 * "Medlemmer og adminroller" i adminpanelet: forfrem, nedgrader og se de
 * seneste ændringer. Reglerne -- sidste admin, uændret rolle, konto under
 * sletning -- ligger i `members.setAdmin`; her oversættes kun svaret.
 */
export function AdminRolesSection({
  currentUserId,
}: {
  currentUserId: Id<'profiles'>
}) {
  const navigate = useNavigate()
  const { members, isLoading } = useMembers()
  const { roleChanges, isLoading: changesLoading, setAdminRole, isPending } =
    useAdminRoles()
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleRoleChange(member: Member) {
    const name = memberName(member)
    const makeAdmin = !member.isAdmin
    const selfDemotion = member._id === currentUserId && !makeAdmin
    const confirmation = makeAdmin
      ? `Gør ${name} til administrator?\n\nDet giver adgang til admin-panelet og mulighed for at administrere invitationer, ansøgninger og andre adminroller.`
      : selfDemotion
        ? `Fjern din egen adminrolle?\n\nDu mister straks adgang til admin-panelet og kan ikke selv få rollen tilbage. Handlingen gennemføres kun, hvis der er en anden administrator.`
        : `Fjern adminrollen fra ${name}?\n\nPersonen mister straks adgang til admin-panelet.`

    if (!window.confirm(confirmation)) return

    setSuccess(null)
    setError(null)

    try {
      await setAdminRole({ targetId: member._id, makeAdmin })

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

  return (
    <>
      <AdminSection
        title="Medlemmer og adminroller"
        description="Administratorer har adgang til hele admin-panelet og kan ændre andres roller."
        count={members.length}
      >
        {success && (
          <p role="status" className="text-sm text-ink-subtle">
            {success}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        {isLoading && (
          <p role="status" className="text-sm text-ink-subtle">
            Henter medlemmer…
          </p>
        )}

        {!isLoading && members.length === 0 && (
          <p className="text-sm text-ink-subtle">
            Der er ingen medlemmer at vise.
          </p>
        )}

        <ul className="flex flex-col gap-2">
          {members.map((member) => {
            const name = memberName(member)

            return (
              <li
                key={member._id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-line px-4 py-3"
              >
                <Avatar
                  name={name}
                  avatarUrl={member.avatarUrl ?? null}
                  color={member.chatColor}
                  size="sm"
                  decorative
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">
                    {name}
                    {member._id === currentUserId && (
                      <span className="font-normal text-ink-subtle">
                        {' '}
                        (dig)
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-ink-subtle">
                    {member.isAdmin ? 'Administrator' : 'Medlem'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRoleChange(member)}
                  disabled={isPending}
                  className={
                    member.isAdmin
                      ? 'min-h-11 rounded-lg border border-danger-line px-3 py-2 text-sm text-danger disabled:opacity-50'
                      : 'min-h-11 rounded-lg bg-accent px-3 py-2 text-sm text-white disabled:opacity-50'
                  }
                >
                  {member.isAdmin
                    ? 'Fjern adminrolle'
                    : 'Gør til administrator'}
                </button>
              </li>
            )
          })}
        </ul>
      </AdminSection>

      <AdminSection
        title="Seneste rolleændringer"
        description="De seneste 20 ændringer vises her."
      >
        {changesLoading && (
          <p role="status" className="text-sm text-ink-subtle">
            Henter rollehistorik…
          </p>
        )}
        {!changesLoading && roleChanges.length === 0 && (
          <p className="text-sm text-ink-subtle">
            Der er endnu ingen rolleændringer.
          </p>
        )}

        <ol className="flex flex-col gap-2">
          {roleChanges.map((change) => (
            <li
              key={change._id}
              className="rounded-lg border border-line-soft bg-surface-sunken px-4 py-3 text-sm"
            >
              <p className="text-ink">
                <span className="font-medium">{change.actorName}</span>{' '}
                {change.newIsAdmin
                  ? 'gjorde'
                  : 'fjernede administratorrollen fra'}{' '}
                <span className="font-medium">{change.targetName}</span>
                {change.newIsAdmin && ' til administrator'}.
              </p>
              <p className="mt-1 text-xs text-ink-subtle">
                {change.oldIsAdmin ? 'Administrator' : 'Medlem'} →{' '}
                {change.newIsAdmin ? 'Administrator' : 'Medlem'} ·{' '}
                {changedAtFormatter.format(new Date(change.changedAt))}
              </p>
            </li>
          ))}
        </ol>
      </AdminSection>
    </>
  )
}
