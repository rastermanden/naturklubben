import type { FormEvent, RefObject } from 'react'
import {
  toFriendlyAllowedEmailError,
  type AllowedEmail,
} from './useAllowedEmails'
import { AdminSection } from './AdminSection'
import { formatAdminDate } from './formatAdminDate'

/**
 * Invitationsformularen og listen over tilladte e-mails.
 *
 * De to hørte altid sammen — formularen skriver til listen — men lå tidligere
 * med ansøgningerne imellem sig, så man skulle scrolle forbi noget helt tredje
 * for at se resultatet af det, man lige havde gjort. Her står de under samme
 * fane.
 */
export function AllowedEmailsSection({
  emails,
  isPending,
  isError,
  isSuccess,
  error,
  email,
  note,
  onEmailChange,
  onNoteChange,
  onSubmit,
  onRemove,
  adding,
  removing,
  inviteError,
  inviteEmailInvalid,
  emailRef,
}: {
  emails: AllowedEmail[]
  isPending: boolean
  isError: boolean
  isSuccess: boolean
  error: unknown
  email: string
  note: string
  onEmailChange: (value: string) => void
  onNoteChange: (value: string) => void
  onSubmit: (event: FormEvent) => void
  onRemove: (email: string) => void
  adding: boolean
  removing: boolean
  inviteError: string | null
  inviteEmailInvalid: boolean
  emailRef: RefObject<HTMLInputElement | null>
}) {
  return (
    <>
      <AdminSection
        title="Inviter en e-mail"
        description="Kun adresser på listen kan oprette en bruger i klubbens app."
      >
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm text-ink-body">
            E-mail
            <input
              id="admin-invite-email"
              ref={emailRef}
              type="email"
              required
              autoComplete="off"
              placeholder="navn@eksempel.dk"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              aria-invalid={inviteEmailInvalid ? true : undefined}
              aria-describedby={
                inviteEmailInvalid ? 'admin-invite-error' : undefined
              }
              className="rounded border border-line-strong bg-surface px-3 py-2 text-base text-ink"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-ink-body">
            Note (valgfri)
            <input
              id="admin-invite-note"
              type="text"
              placeholder="Fx “Anne fra bestyrelsen”"
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
              className="rounded border border-line-strong bg-surface px-3 py-2 text-base text-ink"
            />
          </label>

          {inviteError && (
            <p
              id="admin-invite-error"
              role={inviteEmailInvalid ? undefined : 'alert'}
              className="text-sm text-danger"
            >
              {inviteError}
            </p>
          )}

          <button
            type="submit"
            disabled={adding}
            className="min-h-11 self-start rounded-lg bg-accent px-6 py-2 text-white disabled:opacity-50"
          >
            {adding ? 'Tilføjer…' : 'Tilføj til listen'}
          </button>
        </form>
      </AdminSection>

      <AdminSection title="Tilladte e-mails" count={emails.length}>
        {isPending && <p className="text-sm text-ink-subtle">Henter listen…</p>}

        {isError && (
          <p role="alert" className="text-sm text-danger">
            Listen kunne ikke hentes: {toFriendlyAllowedEmailError(error)}
          </p>
        )}

        {isSuccess && emails.length === 0 && (
          <p className="text-sm text-ink-subtle">
            Der er ingen e-mails på listen endnu.
          </p>
        )}

        <ul className="flex flex-col gap-2">
          {emails.map((entry) => (
            <li
              key={entry.email}
              className="flex items-center justify-between gap-3 rounded-lg border border-line px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-ink">
                  {entry.email}
                  {entry.is_admin && (
                    <span className="ml-2 rounded bg-accent px-2 py-0.5 align-middle text-xs text-white">
                      Admin
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-ink-subtle">
                  {entry.note ? `${entry.note} · ` : ''}
                  Tilføjet {formatAdminDate(entry.created_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRemove(entry.email)}
                disabled={removing}
                className="min-h-11 shrink-0 rounded-lg border border-danger-line px-3 py-2 text-sm text-danger disabled:opacity-50"
              >
                Fjern
              </button>
            </li>
          ))}
        </ul>
      </AdminSection>
    </>
  )
}
