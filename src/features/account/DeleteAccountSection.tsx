import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ACCOUNT_DELETION_CONFIRMATION,
  AccountDeletionError,
  accountDeletionErrorMessage,
  clearDeletedAccountSession,
  deleteAccount,
} from './deleteAccount'
import { useErrorFocus } from '../../hooks/useErrorFocus'

interface DeleteAccountDialogProps {
  email: string
  onClose: () => void
  onDeleted: () => void
  deleteRequest?: (email: string, password: string) => Promise<void>
}

export function DeleteAccountDialog({
  email,
  onClose,
  onDeleted,
  deleteRequest = deleteAccount,
}: DeleteAccountDialogProps) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<
    'password' | 'confirmation' | null
  >(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const confirmationRef = useRef<HTMLInputElement>(null)
  const focusPasswordError = useErrorFocus(passwordRef)
  const focusConfirmationError = useErrorFocus(confirmationRef)
  const canDelete =
    password.length > 0 &&
    confirmation === ACCOUNT_DELETION_CONFIRMATION &&
    !deleting

  useEffect(() => {
    passwordRef.current?.focus()
  }, [])

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !deleting) onClose()
    }

    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [deleting, onClose])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canDelete) return

    setDeleting(true)
    setError(null)
    setErrorField(null)
    try {
      await deleteRequest(email, password)
      onDeleted()
    } catch (caught) {
      setError(accountDeletionErrorMessage(caught))
      if (
        caught instanceof AccountDeletionError &&
        (caught.code === 'invalid_password' ||
          caught.code === 'recent_login_required')
      ) {
        setErrorField('password')
        focusPasswordError()
      } else if (
        caught instanceof AccountDeletionError &&
        caught.code === 'invalid_confirmation'
      ) {
        setErrorField('confirmation')
        focusConfirmationError()
      }
      setDeleting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-account-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-6"
    >
      <article className="max-h-[95svh] w-full overflow-y-auto rounded-t-xl bg-white p-6 shadow-xl sm:max-w-lg sm:rounded-xl">
        <h2
          id="delete-account-title"
          className="text-xl font-semibold text-red-900"
        >
          Slet konto permanent
        </h2>
        <p className="mt-3 text-green-950">
          Handlingen kan ikke fortrydes. Hvis du vil være medlem igen, skal en
          administrator invitere dig på ny.
        </p>

        <div className="mt-4 grid gap-3 text-sm">
          <section className="rounded border border-red-200 bg-red-50 p-3">
            <h3 className="font-semibold text-red-900">Slettes permanent</h3>
            <p className="mt-1 text-red-950">
              Login, profil, avatar, egne billeder, tilmeldinger,
              push-abonnementer og medlemsadgang.
            </p>
          </section>
          <section className="rounded border border-green-200 bg-green-50 p-3">
            <h3 className="font-semibold text-green-900">Bevares anonymt</h3>
            <p className="mt-1 text-green-950">
              Chatbeskeder og kalenderbegivenheder bliver stående i klubbens
              fælles historik som fra “Tidligere medlem”.
            </p>
          </section>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm text-green-950">
            Nuværende adgangskode
            <input
              id="delete-account-password"
              ref={passwordRef}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={errorField === 'password' ? true : undefined}
              aria-describedby={
                errorField === 'password' ? 'delete-account-error' : undefined
              }
              disabled={deleting}
              className="rounded border border-green-300 px-3 py-2 text-base"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-green-950">
            Skriv <strong>{ACCOUNT_DELETION_CONFIRMATION}</strong> for at
            bekræfte
            <input
              id="delete-account-confirmation"
              ref={confirmationRef}
              type="text"
              autoComplete="off"
              required
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              aria-invalid={errorField === 'confirmation' ? true : undefined}
              aria-describedby={
                errorField === 'confirmation'
                  ? 'delete-account-error'
                  : undefined
              }
              disabled={deleting}
              className="rounded border border-green-300 px-3 py-2 text-base"
            />
          </label>

          {error && (
            <p
              id="delete-account-error"
              role={errorField ? undefined : 'alert'}
              className="text-sm text-red-700"
            >
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={deleting}
              className="min-h-11 rounded border border-green-400 px-4 py-2 text-green-900 disabled:opacity-50"
            >
              Annullér
            </button>
            <button
              type="submit"
              disabled={!canDelete}
              className="min-h-11 rounded bg-red-700 px-4 py-2 text-white disabled:opacity-50"
            >
              {deleting ? 'Sletter konto…' : 'Slet min konto permanent'}
            </button>
          </div>
        </form>
      </article>
    </div>
  )
}

export function DeleteAccountSection({ email }: { email: string }) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const navigate = useNavigate()

  return (
    <section className="rounded-lg border border-red-200 p-5">
      <h2 className="text-lg font-semibold text-red-900">Slet konto</h2>
      <p className="mt-2 text-sm text-green-950">
        Fjern din profil, dine billeder og din medlemsadgang permanent. Fælles
        chat- og kalenderhistorik anonymiseres.
      </p>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="mt-4 min-h-11 rounded border border-red-700 px-4 py-2 text-red-700"
      >
        Start kontosletning
      </button>

      {dialogOpen && (
        <DeleteAccountDialog
          email={email}
          onClose={() => setDialogOpen(false)}
          onDeleted={() => {
            navigate('/konto-slettet', { replace: true, flushSync: true })
            void clearDeletedAccountSession()
          }}
        />
      )}
    </section>
  )
}
