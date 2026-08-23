import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { DeleteAccountSection } from '../features/account/DeleteAccountSection'
import { useAuth } from '../features/auth/useAuth'
import { ChatColorOption } from '../features/chat/ChatColorOption'
import { profilesMapQueryKey } from '../features/chat/useProfilesMap'
import { readableTextColor } from '../lib/colorContrast'
import { supabase } from '../lib/supabaseClient'

// Skal matche file_size_limit på avatars-bucketten (se migrationen
// 20260822120000_avatars_bucket.sql).
const MAX_AVATAR_SIZE = 5 * 1024 * 1024

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

function ProfilePage() {
  const { session } = useAuth()
  const userId = session!.user.id
  const email = session!.user.email
  const queryClient = useQueryClient()

  const [fullName, setFullName] = useState('')
  const [chatColor, setChatColor] = useState('#16a34a')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, chat_color, avatar_url')
        .eq('id', userId)
        .single()
      if (data) {
        setFullName(data.full_name ?? '')
        setChatColor(data.chat_color ?? '#16a34a')
        setAvatarUrl(data.avatar_url ?? null)
      }
    }
    void load()
  }, [userId])

  async function handleAvatarChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const input = event.target
    const file = input.files?.[0]
    // Nulstil med det samme, så det virker at vælge den *samme* fil igen efter
    // en fejl -- ellers udløser browseren ingen change-event anden gang.
    input.value = ''
    if (!file) return

    setSuccessMsg(null)
    setErrorMsg(null)

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Filen er ikke et billede.')
      return
    }
    if (file.size > MAX_AVATAR_SIZE) {
      setErrorMsg('Billedet er for stort (maks. 5 MB).')
      return
    }

    setUploading(true)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      // Unikt filnavn frem for et fast `<user-id>.<ext>`: den offentlige URL
      // ændrer sig ved hvert upload, så browseren og Storage-CDN'et ikke bliver
      // ved med at vise det gamle billede.
      const path = `${userId}/${crypto.randomUUID()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { contentType: file.type })
      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(path)
      const publicUrl = urlData.publicUrl

      // Gemmes med det samme -- at vælge et billede er en handling i sig selv,
      // og oprydningen nedenfor sletter den gamle fil, så profiles.avatar_url
      // ikke må nå at pege på noget, der er væk.
      const { error: saveError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', userId)
        .select('id')
        .single()
      if (saveError) throw saveError

      await queryClient.invalidateQueries({ queryKey: profilesMapQueryKey })
      setAvatarUrl(publicUrl)
      setSuccessMsg('Profilbilledet er gemt.')

      // Bedste indsats: fjern tidligere avatarer, så mappen ikke vokser.
      const { data: existing } = await supabase.storage
        .from('avatars')
        .list(userId)
      const stale = (existing ?? [])
        .map((item) => `${userId}/${item.name}`)
        .filter((name) => name !== path)
      if (stale.length > 0) {
        await supabase.storage.from('avatars').remove(stale)
      }
    } catch (error) {
      setErrorMsg(
        error instanceof Error
          ? `Billedet kunne ikke uploades: ${error.message}`
          : 'Billedet kunne ikke uploades. Prøv igen.',
      )
    } finally {
      setUploading(false)
    }
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setSuccessMsg(null)
    setErrorMsg(null)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName || null,
          chat_color: chatColor,
          avatar_url: avatarUrl,
        })
        .eq('id', userId)
        .select('id')
        .single()
      if (error) throw error
      await queryClient.invalidateQueries({ queryKey: profilesMapQueryKey })
      setSuccessMsg('Profilen er gemt.')
    } catch (error) {
      setErrorMsg(
        error instanceof Error
          ? `Profilen kunne ikke gemmes: ${error.message}`
          : 'Profilen kunne ikke gemmes. Prøv igen.',
      )
    } finally {
      setSaving(false)
    }
  }

  function initials(name: string) {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join('')
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-green-900">Min profil</h1>
        <p className="text-green-700">Tilpas dit navn, farve og billede.</p>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-6">
        {/* Avatar preview & upload */}
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="relative group"
            aria-label="Skift profilbillede"
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Profilbillede"
                className="h-24 w-24 rounded-full object-cover"
                style={{ outline: `3px solid ${chatColor}` }}
              />
            ) : (
              <span
                className="flex h-24 w-24 items-center justify-center rounded-full text-3xl font-bold"
                style={{
                  backgroundColor: chatColor,
                  color: readableTextColor(chatColor),
                }}
              >
                {initials(fullName) || '?'}
              </span>
            )}
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/70 text-sm text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              {uploading ? 'Uploader…' : 'Skift'}
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={handleAvatarChange}
          />
          <p className="text-xs text-green-700">
            Klik på billedet for at uploade et nyt foto.
          </p>
        </div>

        {/* Name */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="fullName"
            className="text-sm font-medium text-green-900"
          >
            Navn
          </label>
          <input
            id="fullName"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Dit navn"
            className="rounded-lg border border-green-300 px-4 py-2 text-green-950"
          />
        </div>

        {/* Chat color */}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-green-900">Chat-farve</p>
          <div className="flex flex-wrap gap-3">
            {PRESET_COLORS.map(({ value, label }) => (
              <ChatColorOption
                key={value}
                value={value}
                label={label}
                selected={chatColor.toLowerCase() === value}
                onSelect={setChatColor}
              />
            ))}
            <input
              type="color"
              value={chatColor}
              onChange={(e) => setChatColor(e.target.value)}
              aria-label="Vælg en brugerdefineret farve"
              className="h-11 w-11 cursor-pointer rounded-full border-0 p-0"
              title="Brugerdefineret farve"
            />
          </div>
          {/* Preview */}
          <div className="mt-1 flex items-end gap-2">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium"
              style={{
                backgroundColor: chatColor,
                color: readableTextColor(chatColor),
              }}
            >
              {initials(fullName) || '?'}
            </span>
            <div
              className="rounded-2xl px-4 py-2 text-sm"
              style={{
                backgroundColor: chatColor,
                color: readableTextColor(chatColor),
              }}
            >
              Hej, det er mig!
            </div>
          </div>
        </div>

        {successMsg && (
          <p role="status" className="text-sm text-green-700">
            {successMsg}
          </p>
        )}
        {errorMsg && (
          <p role="alert" className="text-sm text-red-700">
            {errorMsg}
          </p>
        )}

        <button
          type="submit"
          disabled={saving || uploading}
          className="min-h-11 rounded-lg bg-green-800 px-6 py-2 text-white disabled:opacity-50"
        >
          {saving ? 'Gemmer…' : 'Gem profil'}
        </button>
      </form>

      {email && <DeleteAccountSection email={email} />}
    </main>
  )
}

export default ProfilePage
