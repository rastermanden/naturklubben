import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth'

/**
 * "Log ud" på profilsiden (#285). Knappen stod før i menuen ved siden af de
 * daglige punkter; den hører til ens egen konto og er flyttet hertil, så
 * menuen kan være kortere på en telefon.
 */
export function SignOutSection({ email }: { email: string | null }) {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await signOut()
      navigate('/')
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <section
      aria-labelledby="profile-sign-out-heading"
      className="flex flex-col gap-3 rounded-lg border border-line bg-surface-sunken p-4"
    >
      <div>
        <h2 id="profile-sign-out-heading" className="font-medium text-ink-body">
          Log ud
        </h2>
        {email && (
          <p className="text-sm text-ink-subtle">
            Du er logget ind som <span className="font-medium">{email}</span>.
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => void handleSignOut()}
        disabled={signingOut}
        className="min-h-11 self-start rounded border border-line-strong px-4 py-2 font-medium text-ink-body hover:bg-surface disabled:opacity-60"
      >
        {signingOut ? 'Logger ud…' : 'Log ud'}
      </button>
    </section>
  )
}
