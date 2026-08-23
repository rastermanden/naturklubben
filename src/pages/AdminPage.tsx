import { useState, type FormEvent } from 'react'
import { useAuth } from '../features/auth/useAuth'
import {
  toFriendlyAllowedEmailError,
  useAllowedEmails,
} from '../features/admin/useAllowedEmails'
import {
  toFriendlyProbationApplicationError,
  type NotificationDelivery,
  useProbationApplications,
} from '../features/probation/useProbationApplications'
import { NotificationToggle } from '../features/notifications/NotificationToggle'

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('da-DK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function AdminPage() {
  const { session } = useAuth()
  const userId = session!.user.id
  const { allowedEmailsQuery, addEmail, removeEmail } = useAllowedEmails(userId)
  const {
    applicationsQuery,
    approveApplication,
    rejectApplication,
    retryNotification,
  } = useProbationApplications()

  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  function showDeliveryFailure(
    delivery: NotificationDelivery,
    savedMessage: string,
  ) {
    setSuccessMsg(savedMessage)
    if (delivery.status === 'failed') {
      setError(
        delivery.error ??
          'Beslutningen er gemt, men notifikationen kunne ikke leveres. Prøv igen fra kortet.',
      )
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSuccessMsg(null)

    const trimmed = email.trim().toLowerCase()
    if (!trimmed) return

    try {
      await addEmail.mutateAsync({ email: trimmed, note })
      setEmail('')
      setNote('')
      setSuccessMsg(`${trimmed} kan nu oprette en bruger.`)
    } catch (mutationError) {
      setError(toFriendlyAllowedEmailError(mutationError))
    }
  }

  async function handleRemove(emailToRemove: string) {
    if (
      !window.confirm(
        `Fjern ${emailToRemove} fra listen?\n\nAdressen kan så ikke længere bruges til at oprette en ny bruger. En bruger, der allerede er oprettet, bliver ikke slettet.`,
      )
    ) {
      return
    }

    setError(null)
    setSuccessMsg(null)
    try {
      await removeEmail.mutateAsync(emailToRemove)
      setSuccessMsg(`${emailToRemove} er fjernet fra listen.`)
    } catch (mutationError) {
      setError(toFriendlyAllowedEmailError(mutationError))
    }
  }

  async function handleApprove(applicationId: number, applicantEmail: string) {
    setError(null)
    setSuccessMsg(null)

    try {
      const delivery = await approveApplication.mutateAsync(applicationId)
      showDeliveryFailure(
        delivery,
        `${applicantEmail} er godkendt og kan nu oprette en bruger.`,
      )
    } catch (mutationError) {
      setError(toFriendlyProbationApplicationError(mutationError))
    }
  }

  async function handleReject(applicationId: number, applicantEmail: string) {
    if (
      !window.confirm(
        `Afvis ansøgningen fra ${applicantEmail}?\n\nAnsøgningen fjernes fra admin-listen, men personen kan sende en ny ansøgning senere.`,
      )
    ) {
      return
    }

    setError(null)
    setSuccessMsg(null)

    try {
      const delivery = await rejectApplication.mutateAsync(applicationId)
      showDeliveryFailure(
        delivery,
        `Ansøgningen fra ${applicantEmail} er afvist.`,
      )
    } catch (mutationError) {
      setError(toFriendlyProbationApplicationError(mutationError))
    }
  }

  async function handleRetryNotification(
    applicationId: number,
    kind: 'admin' | 'decision',
  ) {
    setError(null)
    setSuccessMsg(null)
    try {
      const delivery = await retryNotification.mutateAsync({
        applicationId,
        kind,
      })
      if (delivery.status === 'sent') {
        setSuccessMsg('Notifikationen blev leveret.')
      } else {
        setError(
          delivery.error ?? 'Notifikationen kunne ikke leveres. Prøv igen.',
        )
      }
    } catch (mutationError) {
      setError(toFriendlyProbationApplicationError(mutationError))
    }
  }

  const emails = allowedEmailsQuery.data ?? []
  const applications = applicationsQuery.data ?? []
  const handlingApplication =
    approveApplication.isPending || rejectApplication.isPending
  const retryingNotification = retryNotification.isPending

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-green-900">Admin</h1>
        <p className="text-green-700">
          Her bestemmer du, hvem der må oprette en bruger i Naturklubben. Kun
          e-mailadresser på listen kan gennemføre en tilmelding.
        </p>
      </div>

      {successMsg && (
        <p role="status" className="text-sm text-green-700">
          {successMsg}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <section className="space-y-2 rounded-lg border border-green-200 bg-green-50 p-4">
        <h2 className="font-medium text-green-900">Admin-notifikationer</h2>
        <p className="text-sm text-green-700">
          Slå dem til på mindst én administrators enhed for at få besked om nye
          ansøgninger.
        </p>
        <NotificationToggle userId={userId} />
      </section>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-lg border border-green-200 bg-green-50 p-4"
      >
        <h2 className="font-medium text-green-900">Inviter en e-mail</h2>

        <label className="flex flex-col gap-1 text-sm text-green-900">
          E-mail
          <input
            type="email"
            required
            autoComplete="off"
            placeholder="navn@eksempel.dk"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded border border-green-300 bg-white px-3 py-2 text-base text-green-950"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-green-900">
          Note (valgfri)
          <input
            type="text"
            placeholder="Fx “Anne fra bestyrelsen”"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="rounded border border-green-300 bg-white px-3 py-2 text-base text-green-950"
          />
        </label>

        <button
          type="submit"
          disabled={addEmail.isPending}
          className="min-h-11 self-start rounded-lg bg-green-800 px-6 py-2 text-white disabled:opacity-50"
        >
          {addEmail.isPending ? 'Tilføjer…' : 'Tilføj til listen'}
        </button>
      </form>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium text-green-900">
          Ansøgninger om prøvemedlemskab
          {applications.length > 0 && ` (${applications.length})`}
        </h2>

        {applicationsQuery.isPending && (
          <p className="text-sm text-green-700">Henter ansøgninger…</p>
        )}

        {applicationsQuery.isError && (
          <p role="alert" className="text-sm text-red-700">
            Ansøgningerne kunne ikke hentes:{' '}
            {toFriendlyProbationApplicationError(applicationsQuery.error)}
          </p>
        )}

        {applicationsQuery.isSuccess && applications.length === 0 && (
          <p className="text-sm text-green-700">
            Der ligger ingen åbne ansøgninger lige nu.
          </p>
        )}

        <ul className="flex flex-col gap-2">
          {applications.map((application) => (
            <li
              key={application.id}
              className="flex flex-col gap-3 rounded-lg border border-green-200 px-4 py-3"
            >
              <div className="space-y-1">
                <p className="text-green-950">{application.full_name}</p>
                <p className="text-sm text-green-800">{application.email}</p>
                <p className="text-sm text-green-700">
                  Ansøgt {formatDate(application.created_at)}
                </p>
                <p className="whitespace-pre-wrap text-sm text-green-900">
                  {application.motivation}
                </p>
                {application.status !== 'pending' && (
                  <p className="text-sm font-medium text-green-800">
                    {application.status === 'approved'
                      ? 'Ansøgningen er godkendt.'
                      : 'Ansøgningen er afvist.'}
                  </p>
                )}
              </div>
              {application.status === 'pending' && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      void handleApprove(application.id, application.email)
                    }
                    disabled={handlingApplication}
                    className="min-h-11 rounded-lg bg-green-800 px-4 py-2 text-white disabled:opacity-50"
                  >
                    Godkend
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void handleReject(application.id, application.email)
                    }
                    disabled={handlingApplication}
                    className="min-h-11 rounded-lg border border-red-300 px-4 py-2 text-red-700 disabled:opacity-50"
                  >
                    Afvis
                  </button>
                </div>
              )}

              {application.status === 'pending' &&
                application.admin_notification_status === 'failed' && (
                  <div className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                    <p>
                      Admin-notifikationen er ikke leveret
                      {application.admin_notification_error
                        ? `: ${application.admin_notification_error}`
                        : '.'}
                    </p>
                    {application.notification_function_url && (
                      <button
                        type="button"
                        onClick={() =>
                          void handleRetryNotification(application.id, 'admin')
                        }
                        disabled={retryingNotification}
                        className="min-h-11 rounded border border-amber-500 px-3 py-2 disabled:opacity-50"
                      >
                        Prøv admin-notifikationen igen
                      </button>
                    )}
                  </div>
                )}

              {application.status === 'pending' &&
                (application.admin_notification_status === 'pending' ||
                  application.admin_notification_status === 'sending') && (
                  <p className="text-sm text-amber-800">
                    Admin-notifikationen venter på levering…
                  </p>
                )}

              {application.status !== 'pending' &&
                application.decision_notification_status === 'failed' && (
                  <div className="space-y-2 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                    <p>
                      Beslutningen er gemt, men ansøgerens notifikation er ikke
                      leveret
                      {application.decision_notification_error
                        ? `: ${application.decision_notification_error}`
                        : '.'}
                    </p>
                    {application.notification_function_url && (
                      <button
                        type="button"
                        onClick={() =>
                          void handleRetryNotification(
                            application.id,
                            'decision',
                          )
                        }
                        disabled={retryingNotification}
                        className="min-h-11 rounded border border-red-400 px-3 py-2 disabled:opacity-50"
                      >
                        Prøv ansøgernotifikationen igen
                      </button>
                    )}
                  </div>
                )}

              {application.status !== 'pending' &&
                (application.decision_notification_status === 'pending' ||
                  application.decision_notification_status === 'sending') && (
                  <p className="text-sm text-green-700">
                    Ansøgerens notifikation venter på levering…
                  </p>
                )}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium text-green-900">
          Tilladte e-mails{emails.length > 0 && ` (${emails.length})`}
        </h2>

        {allowedEmailsQuery.isPending && (
          <p className="text-sm text-green-700">Henter listen…</p>
        )}

        {allowedEmailsQuery.isError && (
          <p role="alert" className="text-sm text-red-700">
            Listen kunne ikke hentes:{' '}
            {toFriendlyAllowedEmailError(allowedEmailsQuery.error)}
          </p>
        )}

        {allowedEmailsQuery.isSuccess && emails.length === 0 && (
          <p className="text-sm text-green-700">
            Der er ingen e-mails på listen endnu.
          </p>
        )}

        <ul className="flex flex-col gap-2">
          {emails.map((entry) => (
            <li
              key={entry.email}
              className="flex items-center justify-between gap-3 rounded-lg border border-green-200 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-green-950">
                  {entry.email}
                  {entry.is_admin && (
                    <span className="ml-2 rounded bg-green-800 px-2 py-0.5 align-middle text-xs text-white">
                      Admin
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-green-700">
                  {entry.note ? `${entry.note} · ` : ''}
                  Tilføjet {formatDate(entry.created_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleRemove(entry.email)}
                disabled={removeEmail.isPending}
                className="min-h-11 shrink-0 rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700 disabled:opacity-50"
              >
                Fjern
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

export default AdminPage
