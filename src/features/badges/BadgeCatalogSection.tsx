import { useState } from 'react'
import { BadgeForm } from './BadgeForm'
import { BadgeMedal } from './BadgeMedal'
import { toFriendlyBadgeError } from './badgeErrors'
import { isStalePrintRender, printStatusLabel } from './printStatus'
import {
  badgeImageUrl,
  useBadges,
  useRenderBadgePrint,
  useSetBadgeActive,
} from './useBadges'
import type { Badge } from './types'

export function BadgeCatalogSection() {
  const badgesQuery = useBadges()
  const setActive = useSetBadgeActive()
  const renderPrint = useRenderBadgePrint()

  const [editing, setEditing] = useState<Badge | 'new' | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const badges = badgesQuery.data ?? []

  async function handleToggleActive(badge: Badge) {
    setStatus(null)
    setError(null)
    try {
      await setActive.mutateAsync({
        badgeId: badge.id,
        isActive: !badge.is_active,
      })
      setStatus(
        badge.is_active
          ? `${badge.name} kan ikke længere indstilles til.`
          : `${badge.name} kan indstilles til igen.`,
      )
    } catch (mutationError) {
      setError(toFriendlyBadgeError(mutationError))
    }
  }

  async function handleRender(badge: Badge) {
    setStatus(null)
    setError(null)
    try {
      const result = await renderPrint.mutateAsync(badge.id)
      // Kun 'ready' betyder, at filen ligger der. Meldte vi "er lavet" på alle
      // svar, ville en rendering, der stadig kører -- eller er død og venter på
      // at blive forældet -- se ud som en succes, mens listen blev ved med at
      // sige "Trykfilen laves…".
      setStatus(
        result.status === 'ready'
          ? `Trykfilen til ${badge.name} er lavet.`
          : `Trykfilen til ${badge.name} er i gang. Listen opdaterer sig selv, når den er klar.`,
      )
    } catch (mutationError) {
      setError(toFriendlyBadgeError(mutationError))
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium text-green-900">
          Badge-katalog{badges.length > 0 && ` (${badges.length})`}
        </h2>
        {editing === null && (
          <button
            type="button"
            onClick={() => {
              setStatus(null)
              setError(null)
              setEditing('new')
            }}
            className="min-h-11 rounded-lg bg-green-800 px-4 py-2 text-white"
          >
            Ny badge
          </button>
        )}
      </div>

      {status && (
        <p role="status" className="text-sm text-green-700">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      {editing !== null && (
        <BadgeForm
          badge={editing === 'new' ? undefined : editing}
          onDone={(message) => {
            setStatus(message)
            setEditing(null)
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {badgesQuery.isPending && (
        <p className="text-sm text-green-700">Henter kataloget…</p>
      )}

      {badgesQuery.isError && (
        <p role="alert" className="text-sm text-red-700">
          Kataloget kunne ikke hentes: {toFriendlyBadgeError(badgesQuery.error)}
        </p>
      )}

      {badgesQuery.isSuccess && badges.length === 0 && (
        <p className="text-sm text-green-700">
          Der er ingen badges endnu. Opret den første -- husk, at et billede er
          påkrævet, fordi det er forlægget for det fysiske badge.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {badges.map((badge) => (
          <li
            key={badge.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-green-200 px-4 py-3"
          >
            <BadgeMedal badge={badge} size="md" decorative />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-green-950">
                {badge.name}
                {!badge.is_active && (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">
                    Deaktiveret
                  </span>
                )}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    badge.print_status === 'ready'
                      ? 'bg-green-100 text-green-800'
                      : badge.print_status === 'failed' ||
                          isStalePrintRender(badge)
                        ? 'bg-red-100 text-red-800'
                        : 'bg-amber-100 text-amber-900'
                  }`}
                >
                  {printStatusLabel(badge)}
                </span>
              </p>
              {badge.description && (
                <p className="truncate text-sm text-green-700">
                  {badge.description}
                </p>
              )}
              <p className="text-xs text-green-700">
                {badge.diameter_mm} mm · {badge.bleed_mm} mm beskæringsmargin
              </p>
              {badge.print_error && (
                <p className="text-xs text-red-700">{badge.print_error}</p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {badge.print_status === 'ready' && badge.print_path && (
                <a
                  href={badgeImageUrl(badge.print_path)}
                  download
                  className="min-h-11 rounded-lg border border-green-300 px-3 py-2 text-sm text-green-800"
                >
                  Hent trykfil
                </a>
              )}
              {badge.print_status !== 'ready' && (
                <button
                  type="button"
                  onClick={() => void handleRender(badge)}
                  disabled={renderPrint.isPending}
                  className="min-h-11 rounded-lg border border-amber-400 px-3 py-2 text-sm text-amber-900 disabled:opacity-50"
                >
                  Lav trykfilen
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setStatus(null)
                  setError(null)
                  setEditing(badge)
                }}
                className="min-h-11 rounded-lg border border-green-300 px-3 py-2 text-sm text-green-800"
              >
                Ret
              </button>
              <button
                type="button"
                onClick={() => void handleToggleActive(badge)}
                disabled={setActive.isPending}
                className="min-h-11 rounded-lg border border-green-300 px-3 py-2 text-sm text-green-800 disabled:opacity-50"
              >
                {badge.is_active ? 'Deaktivér' : 'Aktivér'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
