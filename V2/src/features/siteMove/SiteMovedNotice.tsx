import { movedUrl } from './siteMove'
import { useSiteMoved } from './useSiteMoved'

/**
 * Helsidebeskeden, som den gamle app viser efter flytningen til
 * naturklubben.dk. Den dækker hele appen: alt under den gamle adresse
 * holder op med at blive opdateret, så der er intet at bruge den til.
 */
export function SiteMovedNotice() {
  const moved = useSiteMoved()
  if (!moved) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="site-moved-title"
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-surface p-6"
    >
      <div className="max-w-md text-center">
        <h1
          id="site-moved-title"
          className="text-3xl font-semibold text-ink-body"
        >
          Naturklubben er flyttet
        </h1>
        <p className="mt-4 text-ink">
          Appen har fået sin egen adresse: <strong>naturklubben.dk</strong>. Den
          gamle adresse bliver ikke opdateret mere.
        </p>
        <p className="mt-3 text-ink-muted">
          Første gang skal du logge ind igen. Har du appen på din hjemmeskærm,
          så tilføj den igen fra den nye adresse, og slå notifikationer til
          igen, hvis du bruger dem.
        </p>
        <a
          href={movedUrl(window.location)}
          className="mt-6 inline-flex min-h-11 items-center rounded bg-accent px-6 py-2 font-medium text-white hover:bg-accent-hover"
        >
          Gå til naturklubben.dk
        </a>
      </div>
    </div>
  )
}
