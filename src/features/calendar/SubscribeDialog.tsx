import { useRef, useState } from 'react'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { googleCalendarUrl, webcalUrl } from './subscribeLinks'

/**
 * Dialog med vejledning i at abonnere på klubbens kalender-feed.
 *
 * Bevidst ikke bare et `webcal://`-link: i en browser uden en registreret
 * handler for protokollen sker der ingenting ved klik (typisk desktop-Chrome
 * og Google Kalender-brugere), og brugeren står tilbage uden nogen forklaring.
 * Den primære vej er derfor https-URL'en, som kan kopieres og indsættes i
 * kalender-appen. `webcal://` findes stadig som genvej for dem, hvor det
 * faktisk virker — Apple Kalender og iOS — men er tydeligt markeret som sådan.
 */

export function SubscribeDialog({
  feedUrl,
  onClose,
}: {
  feedUrl: string
  onClose: () => void
}) {
  const [copyStatus, setCopyStatus] = useState<string | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useDialogFocus<HTMLDivElement>({
    onClose,
    initialFocusRef: closeButtonRef,
  })

  async function copyFeedUrl() {
    try {
      if (!navigator.clipboard?.writeText) {
        setCopyStatus('Kopiér linket manuelt herover.')
        return
      }
      await navigator.clipboard.writeText(feedUrl)
      setCopyStatus('Link kopieret.')
    } catch {
      setCopyStatus('Kunne ikke kopiere. Kopiér linket manuelt herover.')
    }
  }

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="subscribe-title"
      tabIndex={-1}
    >
      <article className="max-h-[90vh] w-full overflow-y-auto rounded-t-xl bg-white p-6 shadow-xl sm:max-w-lg sm:rounded-xl">
        <div className="flex items-start justify-between gap-4">
          <h2
            id="subscribe-title"
            className="text-xl font-semibold text-green-900"
          >
            Abonnér på kalenderen
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Luk"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-2xl text-green-900"
          >
            ×
          </button>
        </div>

        <p className="mt-4 text-green-950">
          Abonnerer du, holder din egen kalender sig selv opdateret med klubbens
          ture og arrangementer. Kopiér linket og indsæt det i din kalender-app.
        </p>

        <label
          htmlFor="calendar-feed-url"
          className="mt-6 block text-sm font-medium text-green-700"
        >
          Kalender-link
        </label>
        <div className="mt-1 flex flex-wrap gap-2">
          <input
            id="calendar-feed-url"
            type="text"
            readOnly
            value={feedUrl}
            onFocus={(event) => event.currentTarget.select()}
            className="min-h-11 min-w-0 flex-1 rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-950"
          />
          <button
            type="button"
            onClick={copyFeedUrl}
            className="min-h-11 rounded bg-green-800 px-4 py-2 text-white"
          >
            Kopiér
          </button>
        </div>
        <p role="status" className="mt-2 min-h-5 text-sm text-green-700">
          {copyStatus}
        </p>

        <h3 className="mt-6 font-semibold text-green-900">Google Kalender</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-green-950">
          <li>
            Åbn{' '}
            <a
              href="https://calendar.google.com/"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Google Kalender
            </a>{' '}
            på en computer — det kan ikke lade sig gøre fra mobil-appen.
          </li>
          <li>
            Klik på <strong>+</strong> ud for «Andre kalendere» i venstre side.
          </li>
          <li>
            Vælg <strong>Fra URL</strong>.
          </li>
          <li>Indsæt linket ovenfor, og klik «Tilføj kalender».</li>
        </ol>
        <p className="mt-2">
          <a
            href={googleCalendarUrl(feedUrl)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center rounded border border-green-700 px-4 py-2 text-green-800 hover:bg-green-50"
          >
            Åbn Google Kalender med linket
          </a>
        </p>

        <h3 className="mt-6 font-semibold text-green-900">
          Apple Kalender og iPhone
        </h3>
        <p className="mt-2 text-green-950">
          Åbn genvejen herunder — den beder kalender-appen om at oprette
          abonnementet. Sker der ingenting, har din browser ingen kalender-app
          at åbne linket i; brug så «Fra URL» med linket ovenfor i stedet.
        </p>
        <p className="mt-2">
          <a
            href={webcalUrl(feedUrl)}
            className="inline-flex min-h-11 items-center rounded border border-green-700 px-4 py-2 text-green-800 hover:bg-green-50"
          >
            Åbn i kalender-app
          </a>
        </p>

        <h3 className="mt-6 font-semibold text-green-900">Outlook</h3>
        <p className="mt-2 text-green-950">
          Vælg «Tilføj kalender» → «Abonner via internettet», og indsæt linket
          ovenfor.
        </p>

        <p className="mt-6 text-sm text-green-700">
          Kalenderen opdateres automatisk. Hvor tit bestemmer din kalender-app
          selv — typisk hver time til én gang i døgnet.
        </p>
      </article>
    </div>
  )
}
