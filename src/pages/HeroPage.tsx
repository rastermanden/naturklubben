import { useLocation } from 'react-router-dom'

function HeroPage() {
  const location = useLocation()
  const authRequired = (location.state as { authRequired?: boolean } | null)
    ?.authRequired

  return (
    <main className="flex min-h-[calc(100svh-57px)] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-3xl font-semibold text-green-900">Naturklubben</h1>
      <p className="max-w-prose text-green-800">
        Velkommen til Naturklubben. Log ind for at se kalender, billeder og
        chat.
      </p>

      {authRequired && (
        <p role="alert" className="max-w-prose text-sm text-amber-800">
          Du skal være logget ind for at se den side.
        </p>
      )}
    </main>
  )
}

export default HeroPage
