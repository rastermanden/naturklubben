import { Link } from 'react-router-dom'

function AccountDeletedPage() {
  return (
    <main className="mx-auto flex min-h-[70svh] max-w-lg flex-col justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold text-ink-body">
        Din konto er slettet
      </h1>
      <p className="text-ink-muted">
        Profil, billeder, tilmeldinger, push-abonnementer og medlemsadgang er
        fjernet. Fælles chat- og kalenderhistorik står tilbage anonymt som fra
        “Tidligere medlem”.
      </p>
      <Link to="/" className="underline">
        Gå til forsiden
      </Link>
    </main>
  )
}

export default AccountDeletedPage
