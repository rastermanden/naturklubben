import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import {
  panView,
  projectLatLng,
  tilesInView,
  unprojectWorld,
  zoomViewAt,
  osmTileUrl,
  type LatLng,
  type MapView,
  type Size,
} from './tileMath'

export interface SlippyMapContext {
  view: MapView
  size: Size
  /** Position i CSS-pixels i kortets eget koordinatsystem. */
  projectPoint: (lat: number, lng: number) => { x: number; y: number }
  topLeft: { x: number; y: number }
}

interface SlippyMapCoreProps {
  view: MapView
  onViewChange: (view: MapView) => void
  tileUrl?: (x: number, y: number, z: number) => string
  className?: string
  onTap?: (position: LatLng) => void
  render?: (context: SlippyMapContext) => ReactNode
  /** Tilgængeligt navn for kortet. */
  label?: string
  /** Kaldes, når kortets størrelse er målt eller ændrer sig. */
  onResize?: (size: Size) => void
}

/** En finger må flytte sig så meget, før et tryk bliver til et pan. */
const TAP_SLOP = 6

type Gesture =
  | { mode: 'idle' }
  | { mode: 'pan'; startX: number; startY: number; view: MapView }
  | { mode: 'pinch'; startDist: number; startView: MapView }

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState<Size | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const update = () =>
      setSize({ width: element.clientWidth, height: element.clientHeight })
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return { ref, size }
}

function pointerDistance(
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function SlippyMapCore({
  view,
  onViewChange,
  tileUrl = osmTileUrl,
  className,
  onTap,
  render,
  label = 'Kort',
  onResize,
}: SlippyMapCoreProps) {
  const { ref: containerRef, size } = useElementSize<HTMLDivElement>()
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const viewChanged = useRef(false)
  const [gesture, setGesture] = useState<Gesture>({ mode: 'idle' })
  const [gestureView, setGestureView] = useState<MapView | null>(null)

  const effectiveView = gestureView ?? view

  useEffect(() => {
    if (size) onResize?.(size)
    // onResize er bevidst udeladt: kun en ny størrelse skal udløse kaldet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size])

  const onWheel = useCallback(
    (event: WheelEvent) => {
      if (!size) return
      event.preventDefault()
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const point = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      }
      onViewChange(zoomViewAt(view, point, event.deltaY < 0 ? 1 : -1, size))
    },
    [size, view, onViewChange, containerRef],
  )

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [onWheel, containerRef])

  function containerPoint(event: ReactMouseEvent): { x: number; y: number } {
    const rect = containerRef.current?.getBoundingClientRect()
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!size) return
    // Knapper og links i kortet (nåle, klynger, zoom, attribution) skal selv
    // have deres klik. Fanger kortet pegeren, sender browseren klikket til
    // kortet i stedet, og knappen reagerer aldrig.
    if ((event.target as Element).closest('button, a')) return
    event.currentTarget.setPointerCapture(event.pointerId)
    viewChanged.current = false
    pointers.current.set(event.pointerId, containerPoint(event))
    if (pointers.current.size === 2) {
      const [first, second] = [...pointers.current.values()]
      setGesture({
        mode: 'pinch',
        startDist: pointerDistance(first, second),
        startView: view,
      })
      setGestureView(view)
    } else if (pointers.current.size === 1) {
      const point = containerPoint(event)
      setGesture({ mode: 'pan', startX: point.x, startY: point.y, view })
      setGestureView(view)
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId) || gesture.mode === 'idle')
      return
    if (!size) return
    pointers.current.set(event.pointerId, containerPoint(event))

    if (gesture.mode === 'pan') {
      const point = containerPoint(event)
      if (
        !viewChanged.current &&
        Math.hypot(point.x - gesture.startX, point.y - gesture.startY) <
          TAP_SLOP
      ) {
        return
      }
      viewChanged.current = true
      setGestureView(
        panView(
          gesture.view,
          point.x - gesture.startX,
          point.y - gesture.startY,
        ),
      )
      return
    }

    if (gesture.mode === 'pinch' && pointers.current.size === 2) {
      const [first, second] = [...pointers.current.values()]
      const distance = pointerDistance(first, second)
      const center = {
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
      }
      const steps = Math.round(Math.log2(distance / gesture.startDist))
      if (steps !== 0) {
        viewChanged.current = true
        const next = zoomViewAt(gesture.startView, center, steps, size)
        setGestureView(next)
        setGesture({
          mode: 'pinch',
          startDist: distance,
          startView: next,
        })
      }
    }
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.delete(event.pointerId)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    if (pointers.current.size === 0) {
      if (gesture.mode === 'pan' && !viewChanged.current && onTap && size) {
        const point = containerPoint(event)
        const center = projectLatLng(
          view.center.lat,
          view.center.lng,
          view.zoom,
        )
        onTap(
          unprojectWorld(
            center.x + (point.x - size.width / 2),
            center.y + (point.y - size.height / 2),
            view.zoom,
          ),
        )
      }
      // En tap ændrer ikke kortet: onTap-kaldet ovenfor (som for eksempel kan
      // flytte nålen i PositionMapPicker) må ikke overskrives af at genhævde
      // den uændrede gestus-visning bagefter. Kun en gestus, der reelt flyttede
      // sig (pan eller pinch), committes.
      if (gestureView && viewChanged.current) onViewChange(gestureView)
      setGesture({ mode: 'idle' })
      setGestureView(null)
      return
    }

    if (pointers.current.size === 1 && gesture.mode === 'pinch') {
      const point = [...pointers.current.values()][0]
      setGesture({
        mode: 'pan',
        startX: point.x,
        startY: point.y,
        view: gestureView ?? view,
      })
    }
  }

  function handleDoubleClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (!size) return
    if ((event.target as Element).closest('button, a')) return
    const point = containerPoint(event)
    onViewChange(zoomViewAt(view, point, 1, size))
  }

  const { tiles, topLeft } = tilesInView(
    effectiveView,
    size ?? { width: 0, height: 0 },
  )
  const projectPoint = (lat: number, lng: number) => {
    const world = projectLatLng(lat, lng, effectiveView.zoom)
    return { x: world.x - topLeft.x, y: world.y - topLeft.y }
  }

  const zoomButtons = [
    { label: 'Zoom ind', delta: 1 },
    { label: 'Zoom ud', delta: -1 },
  ]

  return (
    <div
      ref={containerRef}
      className={`relative min-h-40 overflow-hidden touch-none select-none ${className ?? ''}`}
      style={{ touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onDoubleClick={handleDoubleClick}
      role="region"
      aria-label={label}
    >
      {size &&
        tiles.map((tile) => (
          <img
            key={`${tile.x}:${tile.y}:${effectiveView.zoom}`}
            src={tileUrl(tile.x, tile.y, effectiveView.zoom)}
            alt=""
            draggable={false}
            style={{
              position: 'absolute',
              left: tile.left,
              top: tile.top,
              width: 256,
              height: 256,
            }}
            className="pointer-events-none"
          />
        ))}

      {size &&
        render?.({
          view: effectiveView,
          size,
          projectPoint,
          topLeft,
        })}

      <div className="pointer-events-none absolute right-0 bottom-0 left-0 flex items-end justify-between p-1">
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
          className="pointer-events-auto rounded bg-black/40 px-1.5 py-0.5 text-[10px] leading-tight text-white no-underline"
        >
          © OpenStreetMap-bidragsydere
        </a>
        <div className="pointer-events-auto flex flex-col overflow-hidden rounded border border-line-strong bg-surface shadow-sm">
          {zoomButtons.map((button) => (
            <button
              key={button.label}
              type="button"
              aria-label={button.label}
              onClick={() => {
                if (!size) return
                onViewChange(
                  zoomViewAt(
                    view,
                    { x: size.width / 2, y: size.height / 2 },
                    button.delta,
                    size,
                  ),
                )
              }}
              className="flex h-9 w-9 items-center justify-center text-lg font-semibold text-ink-body hover:bg-surface-raised"
            >
              {button.delta > 0 ? '+' : '−'}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
