import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import {
  badgeArtworkStyle,
  clampCrop,
  maxCropSize,
  minCropSize,
  type BadgeCropValues,
  type BadgeImageSize,
} from './badgeCrop'

interface BadgeCropPickerProps {
  imageUrl: string
  size: BadgeImageSize
  crop: BadgeCropValues
  onChange: (crop: BadgeCropValues) => void
}

/**
 * Beskæringen vælges her -- den gættes ikke ud fra billedet. Admin flytter og
 * zoomer inden for den cirkulære maske, og tallene gemmes på badge-rækken, så
 * både den runde visning i appen og trykfilen læser præcis det samme udsnit.
 *
 * Både træk og skydere: træk er hurtigst med en mus, skyderne virker med
 * tastatur og på en telefon, hvor et træk let bliver til en scroll.
 */
export function BadgeCropPicker({
  imageUrl,
  size,
  crop,
  onChange,
}: BadgeCropPickerProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    startCrop: BadgeCropValues
  } | null>(null)

  const largest = maxCropSize(size)
  const smallest = minCropSize(size)
  const maxX = Math.max(size.imageWidth - crop.cropSize, 0)
  const maxY = Math.max(size.imageHeight - crop.cropSize, 0)

  function update(next: Partial<BadgeCropValues>) {
    onChange(clampCrop(size, { ...crop, ...next }))
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    // Kun primær knap/finger -- højreklik skal stadig give kontekstmenuen.
    if (event.button !== 0) return
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startCrop: crop,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const viewport = viewportRef.current?.getBoundingClientRect()
    if (!viewport || viewport.width === 0) return

    // Et pixel på skærmen svarer til crop_size / rammens bredde pixels i
    // originalen. At trække billedet til højre flytter udsnittet til venstre.
    const scale = drag.startCrop.cropSize / viewport.width
    update({
      cropX: drag.startCrop.cropX - (event.clientX - drag.startX) * scale,
      cropY: drag.startCrop.cropY - (event.clientY - drag.startY) * scale,
    })
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={viewportRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="relative aspect-square w-full max-w-xs touch-none overflow-hidden rounded-lg bg-media-backdrop select-none"
      >
        <img
          src={imageUrl}
          alt="Badgebilledet med det valgte udsnit"
          draggable={false}
          style={badgeArtworkStyle(size, crop)}
        />
        {/* Alt uden for cirklen dæmpes, så det er tydeligt, hvad der kommer med. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
        />
      </div>

      <p className="text-xs text-ink-subtle">
        Træk i billedet for at flytte udsnittet, eller brug skyderne.
      </p>

      <label className="flex flex-col gap-1 text-sm text-ink-body">
        Zoom
        <input
          type="range"
          min={smallest}
          max={largest}
          step={1}
          // Skyderen vender om, så "til højre" er at zoome ind.
          value={largest + smallest - crop.cropSize}
          onChange={(event) =>
            update({
              cropSize: largest + smallest - Number(event.target.value),
            })
          }
          className="h-11"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-ink-body">
        Vandret
        <input
          type="range"
          min={0}
          max={Math.max(maxX, 1)}
          step={1}
          value={Math.min(crop.cropX, maxX)}
          disabled={maxX === 0}
          onChange={(event) => update({ cropX: Number(event.target.value) })}
          className="h-11 disabled:opacity-40"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-ink-body">
        Lodret
        <input
          type="range"
          min={0}
          max={Math.max(maxY, 1)}
          step={1}
          value={Math.min(crop.cropY, maxY)}
          disabled={maxY === 0}
          onChange={(event) => update({ cropY: Number(event.target.value) })}
          className="h-11 disabled:opacity-40"
        />
      </label>
    </div>
  )
}
