import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../features/auth/useAuth'
import { supabase } from '../lib/supabaseClient'

const PRESET_COLORS = [
  '#16a34a', // grøn
  '#2563eb', // blå
  '#dc2626', // rød
  '#d97706', // orange
  '#7c3aed', // lilla
  '#db2777', // pink
  '#0891b2', // cyan
  '#65a30d', // lime
  '#92400e', // brun
  '#475569', // grå
]

function ProfilePage() {
  const { session } = useAuth()
  const userId = session!.user.id

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

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setUploading(true)
    setErrorMsg(null)
    try {
      const ext = file.name.split('.').pop()
      const path = `avatars/${userId}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(path, file, { upsert: true })
      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from('photos').getPublicUrl(path)
      setAvatarUrl(urlData.publicUrl)
    } catch {
      setErrorMsg('Billedet kunne ikke uploades. Prøv igen.')
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
        .update({ full_name: fullName || null, chat_color: chatColor, avatar_url: avatarUrl })
        .eq('id', userId)
      if (error) throw error
      setSuccessMsg('Profilen er gemt.')
    } catch {
      setErrorMsg('Profilen kunne ikke gemmes. Prøv igen.')
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
                className="flex h-24 w-24 items-center justify-center rounded-full text-3xl font-bold text-white"
                style={{ backgroundColor: chatColor }}
              >
                {initials(fullName) || '?'}
              </span>
            )}
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-sm text-white opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity">
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
          <label htmlFor="fullName" className="text-sm font-medium text-green-900">
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
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setChatColor(color)}
                aria-label={`Vælg farven ${color}`}
                className="h-9 w-9 rounded-full transition-transform hover:scale-110 focus:scale-110"
                style={{
                  backgroundColor: color,
                  outline: chatColor === color ? `3px solid ${color}` : '3px solid transparent',
                  outlineOffset: '2px',
                }}
              />
            ))}
            <input
              type="color"
              value={chatColor}
              onChange={(e) => setChatColor(e.target.value)}
              aria-label="Vælg en brugerdefineret farve"
              className="h-9 w-9 cursor-pointer rounded-full border-0 p-0"
              title="Brugerdefineret farve"
            />
          </div>
          {/* Preview */}
          <div className="mt-1 flex items-end gap-2">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white"
              style={{ backgroundColor: chatColor }}
            >
              {initials(fullName) || '?'}
            </span>
            <div
              className="rounded-2xl px-4 py-2 text-white text-sm"
              style={{ backgroundColor: chatColor }}
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
    </main>
  )
}

export default ProfilePage
