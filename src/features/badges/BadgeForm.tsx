import { useEffect, useState, type FormEvent } from 'react'
import { BadgeCropPicker } from './BadgeCropPicker'
import { BadgeMedal } from './BadgeMedal'
import {
  badgeImageWarning,
  centeredCrop,
  clampCrop,
  slugifyBadgeName,
  type BadgeCropValues,
  type BadgeImageSize,
} from './badgeCrop'
import { toFriendlyBadgeError } from './badgeErrors'
import { readBadgeImage, validateBadgeImageFile } from './badgeImageFile'
import { badgeImageUrl, useSaveBadge } from './useBadges'
import type { Badge } from './types'

interface BadgeFormProps {
  badge?: Badge
  onDone: (message: string) => void
  onCancel: () => void
}

export function BadgeForm({ badge, onDone, onCancel }: BadgeFormProps) {
  const saveBadge = useSaveBadge()

  const [name, setName] = useState(badge?.name ?? '')
  const [slug, setSlug] = useState(badge?.slug ?? '')
  const [slugEdited, setSlugEdited] = useState(Boolean(badge))
  const [description, setDescription] = useState(badge?.description ?? '')
  const [diameterMm, setDiameterMm] = useState(String(badge?.diameter_mm ?? 58))
  const [bleedMm, setBleedMm] = useState(String(badge?.bleed_mm ?? 5))
  const [isActive, setIsActive] = useState(badge?.is_active ?? true)
  const [error, setError] = useState<string | null>(null)

  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    badge ? badgeImageUrl(badge.image_path) : null,
  )
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [size, setSize] = useState<BadgeImageSize | null>(
    badge
      ? { imageWidth: badge.image_width, imageHeight: badge.image_height }
      : null,
  )
  const [crop, setCrop] = useState<BadgeCropValues>(
    badge
      ? { cropX: badge.crop_x, cropY: badge.crop_y, cropSize: badge.crop_size }
      : { cropX: 0, cropY: 0, cropSize: 1 },
  )

  // Object-URL'er lever, til de bliver frigivet -- ellers holder browseren fast
  // i hver eneste fil, admin har set på undervejs.
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [objectUrl])

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.target
    const chosen = input.files?.[0]
    // Nulstil, så den *samme* fil kan vælges igen efter en fejl.
    input.value = ''
    if (!chosen) return

    setError(null)
    const invalid = validateBadgeImageFile(chosen)
    if (invalid) {
      setError(invalid)
      return
    }

    try {
      const loaded = await readBadgeImage(chosen)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      const nextSize = {
        imageWidth: loaded.width,
        imageHeight: loaded.height,
      }
      setFile(chosen)
      setObjectUrl(loaded.objectUrl)
      setPreviewUrl(loaded.objectUrl)
      setSize(nextSize)
      setCrop(centeredCrop(nextSize))
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Billedet kunne ikke læses.',
      )
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    const effectiveSlug = slug || slugifyBadgeName(name)
    if (!name.trim()) {
      setError('Badgen skal have et navn.')
      return
    }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(effectiveSlug)) {
      setError('Slug må kun indeholde a-z, 0-9 og bindestreg.')
      return
    }
    if (!badge && !file) {
      setError('Vælg et billede. En badge uden billede kan ikke produceres.')
      return
    }
    if (!size) {
      setError('Billedets mål mangler. Vælg billedet igen.')
      return
    }

    const diameter = Number(diameterMm)
    const bleed = Number(bleedMm)
    if (!Number.isFinite(diameter) || diameter < 10 || diameter > 200) {
      setError('Diameteren skal være mellem 10 og 200 mm.')
      return
    }
    if (!Number.isFinite(bleed) || bleed < 0 || bleed > 20) {
      setError('Beskæringsmarginen skal være mellem 0 og 20 mm.')
      return
    }

    // Afrund *og* klamp igen: `badges_crop_within_image` kræver, at
    // crop_x + crop_size holder sig inden for billedet, og afrundingen alene
    // kan skubbe udsnittet en pixel udenfor.
    const stored = clampCrop(size, {
      cropX: Math.round(crop.cropX),
      cropY: Math.round(crop.cropY),
      cropSize: Math.round(crop.cropSize),
    })

    try {
      await saveBadge.mutateAsync({
        badgeId: badge?.id,
        values: {
          name,
          slug: effectiveSlug,
          description,
          cropX: stored.cropX,
          cropY: stored.cropY,
          cropSize: stored.cropSize,
          diameterMm: diameter,
          bleedMm: bleed,
          isActive,
        },
        image: file
          ? { file, width: size.imageWidth, height: size.imageHeight }
          : undefined,
        previousImagePath: badge?.image_path,
      })
      onDone(
        badge
          ? `${name} er opdateret. Trykfilen laves om.`
          : `${name} er oprettet. Trykfilen er på vej.`,
      )
    } catch (mutationError) {
      setError(toFriendlyBadgeError(mutationError))
    }
  }

  const warning = size ? badgeImageWarning(size) : null

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-lg border border-green-300 bg-white p-4"
    >
      <h3 className="font-medium text-green-900">
        {badge ? `Ret ${badge.name}` : 'Ny badge'}
      </h3>

      <label className="flex flex-col gap-1 text-sm text-green-900">
        Navn
        <input
          type="text"
          value={name}
          required
          maxLength={80}
          onChange={(event) => {
            setName(event.target.value)
            if (!slugEdited) setSlug(slugifyBadgeName(event.target.value))
          }}
          placeholder="Fx Bonderøven"
          className="rounded border border-green-300 px-3 py-2 text-base text-green-950"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-green-900">
        Slug
        <input
          type="text"
          value={slug}
          maxLength={60}
          onChange={(event) => {
            setSlugEdited(true)
            setSlug(event.target.value)
          }}
          className="rounded border border-green-300 px-3 py-2 text-base text-green-950"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-green-900">
        Beskrivelse (valgfri)
        <textarea
          value={description}
          rows={2}
          maxLength={2000}
          onChange={(event) => setDescription(event.target.value)}
          className="rounded border border-green-300 px-3 py-2 text-base text-green-950"
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-green-900">
          Billede {badge ? '(vælg et nyt for at udskifte)' : '(påkrævet)'}
        </span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label="Vælg badgebillede"
          onChange={handleFileChange}
          className="text-sm text-green-900"
        />
        <p className="text-xs text-green-700">
          PNG, JPEG eller WebP. Kvadratisk og mindst 1000x1000 px anbefales --
          originalen bruges som forlæg til det fysiske badge og nedskaleres
          aldrig.
        </p>
        {warning && (
          <p role="status" className="text-xs text-amber-800">
            {warning}
          </p>
        )}
      </div>

      {previewUrl && size && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex-1">
            <BadgeCropPicker
              imageUrl={previewUrl}
              size={size}
              crop={crop}
              onChange={setCrop}
            />
          </div>
          <div className="flex flex-col items-center gap-2">
            <span className="text-xs text-green-700">Sådan ser den ud</span>
            <BadgeMedal
              badge={{
                name: name || 'Badge',
                image_path: badge?.image_path ?? '',
                image_width: size.imageWidth,
                image_height: size.imageHeight,
                crop_x: crop.cropX,
                crop_y: crop.cropY,
                crop_size: crop.cropSize,
              }}
              previewUrl={previewUrl}
              size="lg"
              decorative
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-sm text-green-900">
          Diameter (mm)
          <input
            type="number"
            min={10}
            max={200}
            step="0.5"
            value={diameterMm}
            onChange={(event) => setDiameterMm(event.target.value)}
            className="w-28 rounded border border-green-300 px-3 py-2 text-base text-green-950"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-green-900">
          Beskæringsmargin (mm)
          <input
            type="number"
            min={0}
            max={20}
            step="0.5"
            value={bleedMm}
            onChange={(event) => setBleedMm(event.target.value)}
            className="w-28 rounded border border-green-300 px-3 py-2 text-base text-green-950"
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm text-green-900">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(event) => setIsActive(event.target.checked)}
          className="h-5 w-5"
        />
        Kan indstilles til
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={saveBadge.isPending}
          className="min-h-11 rounded-lg bg-green-800 px-6 py-2 text-white disabled:opacity-50"
        >
          {saveBadge.isPending ? 'Gemmer…' : 'Gem badge'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-lg border border-green-300 px-4 py-2 text-green-800"
        >
          Annullér
        </button>
      </div>
    </form>
  )
}
