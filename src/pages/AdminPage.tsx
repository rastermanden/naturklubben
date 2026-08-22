import { useState, type FormEvent } from 'react'
import { useAuth } from '../features/auth/useAuth'
import {
  toFriendlyAllowedEmailError,
  useAllowedEmails,
} from '../features/admin/useAllowedEmails'

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

  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

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

  const emails = allowedEmailsQuery.data ?? []

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-green-900">Admin</h1>
        <p className="text-green-700">
          Her bestemmer du, hvem der må oprette en bruger i Naturklubben. Kun
          e-mailadresser på listen kan gennemføre en tilmelding.
        </p>
      </div>

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
      </form>

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
                <p className="truncate text-green-950">{entry.email}</p>
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
