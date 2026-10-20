import { useConvexAuth } from 'convex/react'

/**
 * Forsiden i V2 mens porten foregår: viser hvad der er på plads, og om appen
 * overhovedet har forbindelse til Convex-deploymentet.
 *
 * Siden er tænkt som den synlige kvittering på, at klient, auth-provider og
 * backend hænger sammen. Den skal slettes, når HeroPage er portet.
 */
export default function StatusPage() {
  const { isLoading, isAuthenticated } = useConvexAuth()

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold text-ink">Naturklubben V2</h1>
      <p className="text-ink-muted">
        Convex-native omskrivning. Den nuværende app kører uændret videre ved
        siden af, indtil denne er færdig.
      </p>

      <dl className="rounded-lg border border-line bg-surface-sunken p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-ink-muted">Backend</dt>
          <dd className="font-medium text-ink">Convex</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-ink-muted">Forbindelse</dt>
          <dd className="font-medium text-ink">
            {isLoading ? 'kontakter…' : 'ok'}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-ink-muted">Session</dt>
          <dd className="font-medium text-ink">
            {isAuthenticated ? 'logget ind' : 'ikke logget ind'}
          </dd>
        </div>
      </dl>
    </section>
  )
}
