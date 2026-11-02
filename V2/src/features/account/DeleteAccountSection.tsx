import { useRef, useState, type FormEvent, type RefObject } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthActions } from '@convex-dev/auth/react'
import { useConvex, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { useErrorFocus } from '../../hooks/useErrorFocus'
import {
  ACCOUNT_DELETION_CONFIRMATION,
  AccountDeletionError,
  accountDeletionErrorMessage,
  useDeleteAccount,
} from './deleteAccount'
import { downloadAccountExport } from './exportAccount'

/**
 * Samme dialoger som den nuværende app: eksport bag adgangskode, og sletning
 * med adgangskode plus bekræftelsessætningen.
 */
export function DeleteAccountSection() {
  const emailQuery = useQuery(api.account.myEmail)
  const email = typeof emailQuery === 'string' ? emailQuery : ''
  const [dialogOpen, setDialogOpen] = useState(false)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const navigate = useNavigate()
  const { signIn, signOut } = useAuthActions()
  const { requestDeletion } = useDeleteAccount()
  const convex = useConvex()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const exportTriggerRef = useRef<HTMLButtonElement>(null)

  async function confirmPassword(password: string) {
    try {
      await signIn('password', { email, password, flow: 'signIn' })
    } catch {
      throw new AccountDeletionError('invalid_password')
    }
  }

  if (!email) return null

  return (
    <section className="grid gap-4 rounded-lg border border-line p-5">
      <div>
        <h2 className="text-lg font-semibold text-ink-body">
          Dine data og din konto
        </h2>
        <p className="mt-2 text-sm text-ink">
          Hent først en kopi af dine egne data, hvis du vil gemme dem før en
          eventuel kontosletning.
        </p>
        <button
          ref={exportTriggerRef}
          type="button"
          onClick={() => setExportDialogOpen(true)}
          className="mt-4 min-h-11 rounded border border-accent-soft px-4 py-2 font-medium text-ink-muted"
        >
          Hent mine data
        </button>
      </div>

      <div className="border-t border-danger-line pt-4">
        <h3 className="text-lg font-semibold text-danger-strong">Slet konto</h3>
        <p className="mt-2 text-sm text-ink">
          Fjern din profil, dine billeder og din medlemsadgang permanent. Fælles
          chat- og kalenderhistorik anonymiseres.
        </p>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setDialogOpen(true)}
          className="mt-4 min-h-11 rounded border border-danger-line-strong px-4 py-2 text-danger"
        >
          Start kontosletning
        </button>
      </div>

      {exportDialogOpen && (
        <ExportDialog
          email={email}
          returnFocusRef={exportTriggerRef}
          onClose={() => setExportDialogOpen(false)}
          onExport={async (password) => {
            await confirmPassword(password)
            const data = await convex.query(api.account.exportData, {})
            downloadAccountExport(data)
          }}
        />
      )}

      {dialogOpen && (
        <DeleteDialog
          email={email}
          returnFocusRef={triggerRef}
          onClose={() => setDialogOpen(false)}
          onDelete={async (password, confirmation) => {
            await confirmPassword(password)
            try {
              await requestDeletion(confirmation)
            } catch (caught) {
              throw caught instanceof AccountDeletionError
                ? caught
                : new AccountDeletionError('unknown')
            }
            await signOut()
            navigate('/konto-slettet')
          }}
        />
      )}
    </section>
  )
}

function ExportDialog({
  email,
  onClose,
  onExport,
  returnFocusRef,
}: {
  email: string
  onClose: () => void
  onExport: (password: string) => Promise<void>
  returnFocusRef: RefObject<HTMLButtonElement | null>
}) {
  const [password, setPassword] = useState('')
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const dialogRef = useDialogFocus<HTMLDivElement>({
    onClose: () => {
      if (!exporting) onClose()
    },
    initialFocusRef: passwordRef,
    returnFocusRef,
  })

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setExporting(true)
    setError(null)
    try {
      await onExport(password)
      onClose()
    } catch (caught) {
      setError(accountDeletionErrorMessage(caught))
      setExporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-6">
      <article
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-account-title"
        tabIndex={-1}
        className="w-full rounded-t-xl bg-surface p-6 shadow-xl sm:max-w-lg sm:rounded-xl"
      >
        <h2
          id="export-account-title"
          className="text-xl font-semibold text-ink-body"
        >
          Hent mine data
        </h2>
        <p className="mt-3 text-sm text-ink">
          Bekræft med adgangskoden til {email}. Filen er en JSON-kopi af dine
          egne data.
        </p>
        <form onSubmit={(event) => void handleSubmit(event)} className="mt-5">
          <label className="flex flex-col gap-1 text-sm text-ink">
            Adgangskode
            <input
              ref={passwordRef}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded border border-line-strong px-3 py-2 text-base"
            />
          </label>
          {error && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          )}
          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded border border-line-strong px-4 py-2 text-ink-body"
            >
              Luk
            </button>
            <button
              type="submit"
              disabled={!password || exporting}
              className="min-h-11 rounded bg-accent-soft px-4 py-2 text-white disabled:opacity-50"
            >
              {exporting ? 'Samler dine data…' : 'Hent data som JSON'}
            </button>
          </div>
        </form>
      </article>
    </div>
  )
}

function DeleteDialog({
  email,
  onClose,
  onDelete,
  returnFocusRef,
}: {
  email: string
  onClose: () => void
  onDelete: (password: string, confirmation: string) => Promise<void>
  returnFocusRef: RefObject<HTMLButtonElement | null>
}) {
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
  const dialogRef = useDialogFocus<HTMLDivElement>({
    onClose: () => {
      if (!deleting) onClose()
    },
    initialFocusRef: passwordRef,
    returnFocusRef,
  })
  const canDelete =
    password.length > 0 &&
    confirmation === ACCOUNT_DELETION_CONFIRMATION &&
    !deleting

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canDelete) return
    setDeleting(true)
    setError(null)
    setErrorField(null)
    try {
      await onDelete(password, confirmation)
    } catch (caught) {
      setError(accountDeletionErrorMessage(caught))
      if (
        caught instanceof AccountDeletionError &&
        caught.code === 'invalid_password'
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-6">
      <article
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        tabIndex={-1}
        className="max-h-[95svh] w-full overflow-y-auto rounded-t-xl bg-surface p-6 shadow-xl sm:max-w-lg sm:rounded-xl"
      >
        <h2
          id="delete-account-title"
          className="text-xl font-semibold text-danger-strong"
        >
          Slet konto permanent
        </h2>
        <p className="mt-3 text-ink">
          Handlingen kan ikke fortrydes. Hvis du vil være medlem igen, skal en
          administrator invitere dig på ny. Kontoen er {email}.
        </p>
        <div className="mt-4 grid gap-3 text-sm">
          <section className="rounded border border-danger-line bg-danger-surface p-3">
            <h3 className="font-semibold text-danger-strong">
              Slettes permanent
            </h3>
            <p className="mt-1 text-danger-strong">
              Login, profil, avatar, egne billeder, tilmeldinger,
              push-abonnementer og medlemsadgang.
            </p>
          </section>
          <section className="rounded border border-line bg-surface-sunken p-3">
            <h3 className="font-semibold text-ink-body">Bevares anonymt</h3>
            <p className="mt-1 text-ink">
              Chatbeskeder og kalenderbegivenheder bliver stående i klubbens
              fælles historik som fra “Tidligere medlem”.
            </p>
          </section>
        </div>
        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="mt-5 flex flex-col gap-4"
        >
          <label className="flex flex-col gap-1 text-sm text-ink">
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
              disabled={deleting}
              className="rounded border border-line-strong px-3 py-2 text-base"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-ink">
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
              disabled={deleting}
              className="rounded border border-line-strong px-3 py-2 text-base"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={deleting}
              className="min-h-11 rounded border border-line-strong px-4 py-2 text-ink-body disabled:opacity-50"
            >
              Annullér
            </button>
            <button
              type="submit"
              disabled={!canDelete}
              className="min-h-11 rounded bg-danger-solid px-4 py-2 text-white disabled:opacity-50"
            >
              {deleting ? 'Sletter konto…' : 'Slet min konto permanent'}
            </button>
          </div>
        </form>
      </article>
    </div>
  )
}
