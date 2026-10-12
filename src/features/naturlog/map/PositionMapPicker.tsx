import { useEffect, useState } from 'react'
import { DEFAULT_ZOOM, DENMARK_CENTER } from './tileMath'
import type { LatLng } from './tileMath'
import { SlippyMapCore } from './SlippyMapCore'

interface PositionMapPickerProps {
  position: LatLng | null
  onChange: (position: LatLng) => void
}

const PICKER_ZOOM = 13

export function PositionMapPicker({
  position,
  onChange,
}: PositionMapPickerProps) {
  const [view, setView] = useState(() => ({
    center: position ?? DENMARK_CENTER,
    zoom: position ? PICKER_ZOOM : DEFAULT_ZOOM,
  }))

  useEffect(() => {
    if (!position) return
    // Positionen kan komme fra "Brug min position", uden at brugeren har
    // rørt kortet -- så skal kortet følge med, så nålen viser det rigtige.
    // eslint-disable-next-line react/set-state-in-effect
    setView((current) => {
      const distance = Math.hypot(
        position.lat - current.center.lat,
        position.lng - current.center.lng,
      )
      return distance > 0.0005
        ? { center: position, zoom: current.zoom }
        : current
    })
  }, [position])

  return (
    <div className="flex flex-col gap-2">
      <SlippyMapCore
        label="Kort til at vælge observationens position"
        view={view}
        onViewChange={setView}
        onTap={(position) => {
          setView((current) => ({ ...current, center: position }))
          onChange(position)
        }}
        className="h-56 rounded-xl"
        render={({ size }) => (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full"
            style={{ left: size.width / 2, top: size.height / 2 }}
          >
            <svg width="30" height="38" viewBox="0 0 24 30">
              <path
                d="M12 0C5.9 0 1 4.9 1 11c0 7.2 11 19 11 19s11-11.8 11-19C23 4.9 18.1 0 12 0z"
                fill="#10b981"
                stroke="#ffffff"
                strokeWidth="1.5"
              />
              <circle cx="12" cy="11" r="3.4" fill="#ffffff" />
            </svg>
          </div>
        )}
      />
      <span className="text-xs text-ink-subtle">
        Tryk på kortet for at sætte positionen.
      </span>
    </div>
  )
}
