import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'

interface EventPickerProps {
  /** Begivenhedens id, eller `''` for "Ingen". */
  value: string
  /**
   * Titlen på den begivenhed, `value` peger på, hvis den ikke nødvendigvis er
   * i listen -- fx albummets egen begivenhed. Uden den ville en `select` med
   * en `value`, der ikke matcher nogen `option`, falde tilbage til den første
   * og dermed vise "Ingen", mens uploaden knytter begivenheden alligevel.
   */
  valueTitle?: string
  /**
   * Feltets etiket. Standarden passer i upload-formularen; i lysbordet
   * flytter man et billede, der allerede ligger et sted, og dér betyder
   * "(valgfri)" ingenting.
   */
  label?: string
  onChange: (eventId: string) => void
}

/**
 * Det valgfrie "Knyt til begivenhed"-felt i upload-formularen.
 *
 * Feltet ligger i sin egen komponent, fordi Convex' `useQuery` kaster, når
 * funktionen fejler: står kaldet i `GalleryPage`, river en fejl hele siden med
 * sig, og så kan man heller ikke uploade uden begivenhed. Her fanger
 * `AppErrorBoundary` omkring komponenten fejlen, og resten af formularen
 * bliver stående.
 *
 * Listen dækker både afholdte og kommende begivenheder -- billeder uploades
 * som regel efter turen -- og datoen står ved titlen, så to ture med samme
 * navn kan skelnes.
 */
export function EventPicker({
  value,
  valueTitle,
  label = 'Knyt til begivenhed (valgfri)',
  onChange,
}: EventPickerProps) {
  const events = useQuery(api.calendar.eventOptions, {})

  if (events !== undefined && events.length === 0 && value === '') return null

  // Feltet er brugbart, mens listen hentes: en `disabled` select er ude af
  // tab-rækkefølgen, så en skærmlæser møder den slet ikke -- og der kommer
  // ingen besked, når den bliver aktiv. `aria-busy` siger det i stedet.
  const options = events ?? []
  const valueIsListed =
    value === '' || options.some((event) => event.id === value)

  return (
    <label className="flex flex-col gap-1 text-sm text-ink-body">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-busy={events === undefined}
        className="min-h-11 rounded border border-line-strong bg-surface px-3 py-2 text-base"
      >
        <option value="">Ingen</option>
        {!valueIsListed && (
          <option value={value}>{valueTitle ?? 'Denne begivenhed'}</option>
        )}
        {options.map((event) => (
          <option key={event.id} value={event.id}>
            {eventLabel(event)}
          </option>
        ))}
      </select>
    </label>
  )
}

function eventLabel(event: { title: string; startAt: number }) {
  const date = new Date(event.startAt).toLocaleDateString('da-DK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return `${event.title} (${date})`
}
