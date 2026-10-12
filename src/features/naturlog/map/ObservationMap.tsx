import { useEffect, useMemo, useRef, useState } from 'react'
import { formatObservedOn, observerName } from '../observationInput'
import type { Observation } from '../types'
import { clusterPoints, type PositionedObservation } from './clustering'
import {
  boundsFor,
  fitView,
  osmTileUrl,
  zoomViewAt,
  type MapView,
  type Size,
} from './tileMath'
import { SlippyMapCore } from './SlippyMapCore'

interface ObservationMapProps {
  observations: Observation[]
  view: MapView
  onViewChange: (view: MapView) => void
  /** Vises, når ingen af observationerne har en position. */
  emptyMessage?: string
  tileUrl?: (x: number, y: number, z: number) => string
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export function ObservationMap({
  observations,
  view,
  onViewChange,
  emptyMessage = 'Ingen observationer på kortet endnu -- tilføj en position på din næste observation.',
  tileUrl = osmTileUrl,
}: ObservationMapProps) {
  const [selected, setSelected] = useState<Observation | null>(null)
  const [size, setSize] = useState<Size | null>(null)
  const fittedKey = useRef<string | null>(null)

  const positioned = useMemo(
    () =>
      observations
        .filter(
          (observation) =>
            observation.latitude !== null && observation.longitude !== null,
        )
        .map((observation): PositionedObservation<Observation> => ({
          id: observation.id,
          lat: observation.latitude as number,
          lng: observation.longitude as number,
          payload: observation,
        })),
    [observations],
  )

  // Tilpas udsnittet, så alle nåle er synlige -- når kortet er målt, og igen,
  // hvis filtreringen (år, søgning) ændrer, hvilke observationer der vises.
  // Brugerens egen panorering røres ikke, så længe sættet er det samme.
  const pointsKey = positioned.map((point) => point.id).join(',')
  useEffect(() => {
    if (!size || fittedKey.current === pointsKey) return
    fittedKey.current = pointsKey
    onViewChange(fitView(boundsFor(positioned), size))
    // positioned og onViewChange er bevidst udeladt: pointsKey dækker sættet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, pointsKey])

  return (
    <SlippyMapCore
      label="Kort med observationer"
      onResize={setSize}
      tileUrl={tileUrl}
      view={view}
      onViewChange={onViewChange}
      onTap={() => setSelected(null)}
      render={({ view: currentView, size, topLeft }) => {
        const clusters = clusterPoints(positioned, currentView.zoom)
        return (
          <>
            {clusters.map((cluster) => {
              const relX = cluster.x - topLeft.x
              const relY = cluster.y - topLeft.y
              if (cluster.kind === 'cluster') {
                return (
                  <button
                    key={cluster.id}
                    type="button"
                    aria-label={`${cluster.count} observationer -- zoom ind`}
                    onClick={() => {
                      setSelected(null)
                      onViewChange(
                        zoomViewAt(currentView, { x: relX, y: relY }, 2, size),
                      )
                    }}
                    className="absolute z-10 flex h-9 min-w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-accent-soft px-2 text-sm font-semibold text-white shadow-md"
                    style={{ left: relX, top: relY }}
                  >
                    {cluster.count}
                  </button>
                )
              }
              const observation = cluster.observation.payload
              const visible = selected?.id === observation.id
              return (
                <div
                  key={cluster.id}
                  className={`absolute ${visible ? 'z-30' : 'z-10'}`}
                  style={{ left: relX, top: relY }}
                >
                  <button
                    type="button"
                    aria-label={`${observation.species} -- se observation`}
                    onClick={() => setSelected(observation)}
                    className="block -translate-x-1/2 -translate-y-full"
                  >
                    <svg
                      width="30"
                      height="38"
                      viewBox="0 0 24 30"
                      aria-hidden="true"
                      className="drop-shadow"
                    >
                      <path
                        d="M12 0C5.9 0 1 4.9 1 11c0 7.2 11 19 11 19s11-11.8 11-19C23 4.9 18.1 0 12 0z"
                        fill="#10b981"
                        stroke="#ffffff"
                        strokeWidth="1.5"
                      />
                      <circle cx="12" cy="11" r="3.4" fill="#ffffff" />
                    </svg>
                  </button>
                  {visible && (
                    <div
                      role="dialog"
                      aria-label={observation.species}
                      className="absolute z-20 w-64 rounded-lg border border-line-soft bg-surface p-3 shadow-lg"
                      style={{
                        // Popuppen er placeret i forhold til nålen (wrapperen
                        // står allerede i relX/relY). Den lægges over nålen,
                        // eller under, hvis der ikke er plads foroven, og
                        // skubbes vandret ind i kortet.
                        ...(relY > 150 ? { bottom: 44 } : { top: 8 }),
                        left: clamp(
                          -128,
                          8 - relX,
                          size.width - 8 - 256 - relX,
                        ),
                      }}
                    >
                      <h3 className="font-medium text-ink-body">
                        {observation.species}
                      </h3>
                      <p className="text-sm text-ink-subtle">
                        {formatObservedOn(observation.observed_on)}
                        {observation.location
                          ? ` · ${observation.location}`
                          : ''}
                      </p>
                      <p className="mt-1 text-xs text-ink-muted">
                        {observerName(observation)}
                      </p>
                      <button
                        type="button"
                        onClick={() => setSelected(null)}
                        className="mt-2 text-sm text-ink-body underline"
                      >
                        Luk
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
            {positioned.length === 0 && (
              <p
                role="status"
                className="absolute inset-0 flex items-center justify-center bg-surface/70 p-4 text-center text-ink-subtle"
              >
                {emptyMessage}
              </p>
            )}
          </>
        )
      }}
    />
  )
}
