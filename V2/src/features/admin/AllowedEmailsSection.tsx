import { useState, type FormEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { AdminSection } from '../members/AdminSection'

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('ALLOWED_EMAIL_EXISTS')) {
    return 'Den e-mail står allerede på listen.'
  }
  if (message.includes('ALLOWED_EMAIL_INVALID')) {
    return 'Skriv en e-mailadresse.'
  }
  return 'Listen kunne ikke opdateres. Prøv igen.'
}

export function AllowedEmailsSection() {
  const rows = useQuery(api.members.listAllowedEmails)
  const add = useMutation(api.members.addAllowedEmail)
  const remove = useMutation(api.members.removeAllowedEmail)
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await add({ email, note: note.trim() || null })
      setEmail('')
      setNote('')
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminSection
      title="Inviter en e-mail"
      description="Kun adresser på listen kan oprette en bruger i klubbens app."
    >
      <form
        onSubmit={(event) => void onSubmit(event)}
        className="flex flex-col gap-3"
      >
        <label className="flex flex-col gap-1 text-sm text-ink-body">
          E-mail
          <input
            id="admin-invite-email"
            type="email"
            required
            autoComplete="off"
            placeholder="navn@eksempel.dk"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
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
            onChange={(event) => setNote(event.target.value)}
            className="rounded border border-line-strong bg-surface px-3 py-2 text-base text-ink"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 self-start rounded bg-accent px-4 text-white disabled:opacity-60"
        >
          {busy ? 'Tilføjer…' : 'Tilføj'}
        </button>
      </form>
      {rows === undefined && (
        <p className="text-sm text-ink-subtle">Henter listen…</p>
      )}
      <ul className="flex flex-col gap-2">
        {(rows ?? []).map((row) => (
          <li
            key={row.email}
            className="flex items-center justify-between gap-3 rounded border border-line px-3 py-2"
          >
            <span>
              <span className="block text-ink">{row.email}</span>
              {row.note && (
                <span className="text-sm text-ink-subtle">{row.note}</span>
              )}
            </span>
            <button
              type="button"
              onClick={() =>
                void remove({ email: row.email }).catch(() => undefined)
              }
              className="min-h-11 text-sm text-danger"
            >
              Fjern
            </button>
          </li>
        ))}
      </ul>
    </AdminSection>
  )
}
