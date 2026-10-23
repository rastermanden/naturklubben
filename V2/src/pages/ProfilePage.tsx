import { useEffect, useState, type FormEvent } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { Avatar } from '../components/Avatar'
import { toFriendlyMemberError } from '../features/auth/authErrors'
import { useCurrentProfile } from '../features/auth/useCurrentProfile'
import { CausesField } from '../features/profile/CausesField'
import { PronounsField } from '../features/profile/PronounsField'
import { normalizeCauses } from '../features/profile/causes'
import { normalizePronouns } from '../features/profile/pronouns'
import { readableTextColor } from '../features/theme/colorContrast'

const PRESET_COLORS = [
  { value: '#16a34a', label: 'grøn' },
  { value: '#2563eb', label: 'blå' },
  { value: '#dc2626', label: 'rød' },
  { value: '#d97706', label: 'orange' },
  { value: '#7c3aed', label: 'lilla' },
  { value: '#db2777', label: 'pink' },
  { value: '#0891b2', label: 'cyan' },
  { value: '#65a30d', label: 'lime' },
  { value: '#92400e', label: 'brun' },
  { value: '#475569', label: 'grå' },
]

type ProfileForm = {
  fullName: string
  pronouns: string | null
  causes: string[]
  chatColor: string
}

/**
 * Min profil: navn, pronominer, hjertesager og chatfarve.
 *
 * Formularen seedes én gang fra profilen (`form === null` som vagt), så en
 * igangværende rettelse ikke bliver overskrevet, hvis profilen opdateres fra
 * en anden fane. Efter et gem er det gemte og formularen det samme.
 *
 * To ting er bevidst ikke med endnu, se rapporten: valg af profilbillede
 * (kræver en upload-mutation til Convex' filstorage) og kontosletning
 * (hører til konto-slicen).
 */
export default function ProfilePage() {
  const { profile, isLoading } = useCurrentProfile()
  const updateProfile = useMutation(api.members.updateProfile)

  const [form, setForm] = useState<ProfileForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!profile || form !== null) return
    setForm({
      fullName: profile.fullName ?? '',
      pronouns: profile.pronouns ?? null,
      causes: normalizeCauses(profile.causes),
      chatColor: profile.chatColor,
    })
  }, [form, profile])

  if (isLoading || !form) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col gap-4 p-4 sm:p-6">
        <h1 className="text-2xl font-semibold text-ink-body">Min profil</h1>
        <p role="status" className="text-ink-subtle">
          Henter profilen…
        </p>
      </main>
    )
  }

  const displayName = form.fullName.trim() || 'Unavngivet medlem'

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    if (!form) return

    setSaving(true)
    setSuccessMsg(null)
    setErrorMsg(null)

    try {
      await updateProfile({
        fullName: form.fullName.trim() === '' ? null : form.fullName,
        pronouns: normalizePronouns(form.pronouns),
        causes: normalizeCauses(form.causes),
        chatColor: form.chatColor,
      })
      setSuccessMsg('Profilen er gemt.')
    } catch (saveError) {
      setErrorMsg(toFriendlyMemberError(saveError))
    } finally {
      setSaving(false)
    }
  }

  async function handleFeatureNotifications(enabled: boolean) {
    setSuccessMsg(null)
    setErrorMsg(null)

    try {
      await updateProfile({ featureNotificationsEnabled: enabled })
      setSuccessMsg(
        enabled
          ? 'Du får nu besked om nye ting i appen.'
          : 'Du får ikke længere besked om nye ting i appen.',
      )
    } catch (saveError) {
      setErrorMsg(toFriendlyMemberError(saveError))
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-body">Min profil</h1>
        <p className="text-ink-subtle">
          Tilpas dit navn, pronominer, hjertesager og farve.
        </p>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-3">
          <Avatar
            name={displayName}
            avatarUrl={profile?.avatarUrl ?? null}
            color={form.chatColor}
            size="xl"
          />
          <p className="text-xs text-ink-subtle">
            Profilbillede kan endnu ikke skiftes i V2 -- det kræver
            filstorage-upload, som ikke er portet.
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="fullName"
            className="text-sm font-medium text-ink-body"
          >
            Navn
          </label>
          <input
            id="fullName"
            type="text"
            value={form.fullName}
            onChange={(event) =>
              setForm({ ...form, fullName: event.target.value })
            }
            placeholder="Dit navn"
            className="rounded-lg border border-line-strong px-4 py-2 text-ink"
          />
        </div>

        <PronounsField
          value={form.pronouns}
          onChange={(pronouns) => setForm({ ...form, pronouns })}
        />

        <CausesField
          value={form.causes}
          onChange={(causes) => setForm({ ...form, causes })}
        />

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-ink-body">Chat-farve</p>
          <div className="flex flex-wrap gap-3">
            {PRESET_COLORS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                aria-label={`Vælg farven ${label}`}
                aria-pressed={form.chatColor.toLowerCase() === value}
                onClick={() => setForm({ ...form, chatColor: value })}
                className={`h-11 w-11 rounded-full border-2 ${
                  form.chatColor.toLowerCase() === value
                    ? 'border-ink'
                    : 'border-transparent'
                }`}
                style={{ backgroundColor: value }}
              />
            ))}
            <input
              id="profile-chat-color"
              type="color"
              value={form.chatColor}
              onChange={(event) =>
                setForm({ ...form, chatColor: event.target.value })
              }
              aria-label="Vælg en brugerdefineret farve"
              className="h-11 w-11 cursor-pointer rounded-full border-0 p-0"
              title="Brugerdefineret farve"
            />
          </div>
          <div className="mt-1 flex items-end gap-2">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium"
              style={{
                backgroundColor: form.chatColor,
                color: readableTextColor(form.chatColor),
              }}
            >
              {displayName.slice(0, 1).toUpperCase()}
            </span>
            <div
              className="rounded-2xl px-4 py-2 text-sm"
              style={{
                backgroundColor: form.chatColor,
                color: readableTextColor(form.chatColor),
              }}
            >
              Hej, det er mig!
            </div>
          </div>
        </div>

        {successMsg && (
          <p role="status" className="text-sm text-ink-subtle">
            {successMsg}
          </p>
        )}
        {errorMsg && (
          <p role="alert" className="text-sm text-danger">
            {errorMsg}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="min-h-11 rounded-lg bg-accent px-6 py-2 text-white disabled:opacity-50"
        >
          {saving ? 'Gemmer…' : 'Gem profil'}
        </button>
      </form>

      <section
        aria-labelledby="profile-notifications-heading"
        className="flex flex-col gap-3 rounded-lg border border-line bg-surface-sunken p-4"
      >
        <div>
          <h2
            id="profile-notifications-heading"
            className="font-medium text-ink-body"
          >
            Notifikationer
          </h2>
          <p className="text-sm text-ink-subtle">
            Chattens notifikationer vælger du på chatsiden, når den er portet.
            Her styrer du beskeden om nye ting i appen.
          </p>
        </div>
        <label className="flex items-start gap-3 text-sm text-ink-body">
          <input
            type="checkbox"
            checked={profile?.featureNotificationsEnabled ?? true}
            onChange={(event) =>
              void handleFeatureNotifications(event.target.checked)
            }
            className="mt-1 h-5 w-5"
          />
          <span>
            Send mig en notifikation, når der kommer noget nyt i appen.
          </span>
        </label>
      </section>
    </main>
  )
}
