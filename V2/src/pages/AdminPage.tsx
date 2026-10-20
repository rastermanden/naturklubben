import { useCurrentProfile } from '../features/auth/useCurrentProfile'
import { AdminRolesSection } from '../features/members/AdminRolesSection'

/**
 * Adminpanelet.
 *
 * Adgangen kræves af `AdminRoute`, som læser samme `profiles.isAdmin` som
 * backend'ens `requireAdmin`. Siden her har indtil videre kun
 * medlemssektionen: ansøgninger, badges, aktiviteter, adgangslisten
 * (allowlist) og notifikationsindstillinger hører til andre slices og tilføjer
 * deres eget kort og deres egen fane, når de er portet. Derfor er
 * `?sektion=`-fanerne fra den gamle app ikke med endnu.
 */
export default function AdminPage() {
  const { profile } = useCurrentProfile()

  if (!profile) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 sm:p-6">
        <h1 className="text-2xl font-semibold text-ink-body">Admin</h1>
        <p role="status" className="text-ink-subtle">
          Henter din profil…
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-body">Admin</h1>
        <p className="text-ink-subtle">
          Her administrerer du medlemmernes roller. Resten af admin-panelet
          følger efter, efterhånden som det bliver portet.
        </p>
      </div>

      <AdminRolesSection currentUserId={profile._id} />
    </main>
  )
}
