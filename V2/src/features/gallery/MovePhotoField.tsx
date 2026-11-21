import { useState } from 'react'
import { AppErrorBoundary } from '../../components/AppErrorBoundary'
import { EventPicker } from './EventPicker'
import type { Photo } from './types'

interface MovePhotoFieldProps {
  photo: Photo
  /**
   * Titlen på den begivenhed, billedet hører til nu. Den kommer fra albummet i
   * `GalleryPage` og ikke fra billedet selv: at slå den op pr. billede ville
   * koste en databaselæsning for hvert billede i en side på 40.
   */
  currentTitle?: string
  moving: boolean
  onMove: (photo: Photo, eventId: string | null) => void
}

/**
 * "Flyt til"-feltet i lysbordet: vælg en anden begivenhed for billedet, eller
 * "Ingen" for at flytte det til "Uden begivenhed".
 *
 * Valget kræver et tryk på "Flyt" bagefter. En flytning, der skete i samme
 * øjeblik man rørte feltet, ville være for let at lave ved et uheld på en
 * telefon -- og den flytter et billede, andre medlemmer kender, væk fra det
 * album, de leder i.
 *
 * Feltet genbruger `EventPicker` fra upload-formularen, så listen, datoerne og
 * tilgængeligheden er de samme to steder.
 */
export function MovePhotoField({
  photo,
  currentTitle,
  moving,
  onMove,
}: MovePhotoFieldProps) {
  const current = photo.eventId ?? ''
  const [choice, setChoice] = useState<string | null>(null)
  const selected = choice ?? current

  return (
    <div className="flex w-full max-w-md flex-col gap-2 text-left">
      {/*
        Samme grund som i upload-formularen: `useQuery` kaster, når funktionen
        fejler, og uden en grænse her ville en fejlende begivenhedsliste tage
        hele lysbordet -- og dermed billedet og kommentarerne -- med sig.
      */}
      <AppErrorBoundary
        fallback={(retry) => (
          <p role="alert" className="text-sm text-red-200">
            Listen over begivenheder kunne ikke hentes.{' '}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                retry()
              }}
              className="min-h-11 underline"
            >
              Prøv igen
            </button>
          </p>
        )}
      >
        <div className="[&_label]:text-white [&_select]:text-ink">
          <EventPicker
            value={selected}
            valueTitle={currentTitle}
            onChange={setChoice}
          />
        </div>
      </AppErrorBoundary>
      {selected !== current && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onMove(photo, selected === '' ? null : selected)
          }}
          disabled={moving}
          className="min-h-11 self-start rounded bg-white px-4 py-2 text-green-900 disabled:opacity-60"
        >
          {moving
            ? 'Flytter…'
            : selected === ''
              ? 'Flyt til Uden begivenhed'
              : 'Flyt billedet'}
        </button>
      )}
    </div>
  )
}
