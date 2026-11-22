import { useEffect, useState } from 'react'
import { BadgeForm } from './BadgeForm'
import { BadgeMedal } from './BadgeMedal'
import {
  isStalePrintRender,
  printStatusLabel,
  STALE_BADGE_PRINT_MS,
} from './printStatus'
import {
  badgeErrorMessage,
  useAdminBadgeCatalog,
  useRenderBadgePrint,
  useSetBadgeActive,
} from './useBadges'
import type { AdminBadge } from './types'

export function BadgeCatalogSection() {
  const catalogQuery = useAdminBadgeCatalog()
  const { setActive, isPending: togglingActive } = useSetBadgeActive()
  const { renderPrint, isPending: renderingPrint } = useRenderBadgePrint()

  const [editing, setEditing] = useState<AdminBadge | 'new' | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const badges = [...(catalogQuery ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name, 'da'),
  )

  // Opdatér statuspillen, hvis en aktiv rendering overskrider stale-vinduet,
  // så teksten skifter fra "Trykfilen laves…" til "Trykfilen gik i stå" uden
  // genindlæsning.
  useEffect(() => {
    const rendering = (catalogQuery ?? []).filter(
      (badge) => badge.printStatus === 'rendering',
    )
    if (rendering.length === 0) return

    const currentTime = Date.now()
    const activeStartTimes = rendering
      .filter((badge) => !isStalePrintRender(badge, currentTime))
      .map((badge) => badge.printStartedAt)
      .filter((startedAt): startedAt is number => startedAt !== undefined)

    if (activeStartTimes.length === 0) {
      if (rendering.some((badge) => !isStalePrintRender(badge, now))) {
        const timer = window.setTimeout(() => setNow(Date.now()), 0)
        return () => window.clearTimeout(timer)
      }
      return
    }

    const nextExpiry =
      Math.min(...activeStartTimes) + STALE_BADGE_PRINT_MS - currentTime + 50
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.max(50, nextExpiry),
    )
    return () => window.clearTimeout(timer)
  }, [catalogQuery, now])

  async function handleToggleActive(badge: AdminBadge) {
    setStatus(null)
    setError(null)
    try {
      await setActive({
        badgeId: badge._id,
        isActive: !badge.isActive,
      })
      setStatus(
        badge.isActive
          ? `${badge.name} kan ikke længere indstilles til.`
          : `${badge.name} kan indstilles til igen.`,
      )
    } catch (mutationError) {
      setError(badgeErrorMessage(mutationError))
    }
  }

  async function handleRender(badge: AdminBadge) {
    setStatus(null)
    setError(null)
    try {
      const result = await renderPrint(badge._id)
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
      setError(badgeErrorMessage(mutationError))
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium text-ink-body">
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
            className="min-h-11 rounded-lg bg-accent px-4 py-2 text-white"
          >
            Ny badge
          </button>
        )}
      </div>

      {status && (
        <p role="status" className="text-sm text-ink-subtle">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {editing !== null && (
        <BadgeForm
          key={editing === 'new' ? 'new' : editing._id}
          badge={editing === 'new' ? undefined : editing}
          onDone={(message) => {
            setStatus(message)
            setEditing(null)
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {catalogQuery === undefined && (
        <p className="text-sm text-ink-subtle">Henter kataloget…</p>
      )}

      {catalogQuery !== undefined && badges.length === 0 && (
        <p className="text-sm text-ink-subtle">
          Der er ingen badges endnu. Opret den første -- husk, at et billede er
          påkrævet, fordi det er forlægget for det fysiske badge.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {badges.map((badge) => (
          <li
            key={badge._id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-line px-4 py-3"
          >
            <BadgeMedal badge={badge} size="md" decorative />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-ink">
                {badge.name}
                {!badge.isActive && (
                  <span className="rounded-full bg-surface-raised px-2 py-0.5 text-xs text-ink-muted">
                    Deaktiveret
                  </span>
                )}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    badge.printStatus === 'ready'
                      ? 'bg-surface-raised text-ink-muted'
                      : badge.printStatus === 'failed' ||
                          isStalePrintRender(badge, now)
                        ? 'bg-danger-surface text-danger-strong'
                        : 'bg-warn-raised text-warn-strong'
                  }`}
                >
                  {printStatusLabel(badge, now)}
                </span>
              </p>
              {badge.description && (
                <p className="truncate text-sm text-ink-subtle">
                  {badge.description}
                </p>
              )}
              <p className="text-xs text-ink-subtle">
                {badge.diameterMm} mm · {badge.bleedMm} mm beskæringsmargin
              </p>
              {badge.printError && (
                <p className="text-xs text-danger">{badge.printError}</p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {badge.printStatus === 'ready' && badge.printUrl && (
                <a
                  href={badge.printUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-11 rounded-lg border border-line-strong px-3 py-2 text-sm text-ink-muted"
                >
                  Hent trykfil
                </a>
              )}
              {badge.printStatus !== 'ready' && (
                <button
                  type="button"
                  onClick={() => void handleRender(badge)}
                  disabled={renderingPrint}
                  className="min-h-11 rounded-lg border border-warn-line px-3 py-2 text-sm text-warn-strong disabled:opacity-50"
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
                className="min-h-11 rounded-lg border border-line-strong px-3 py-2 text-sm text-ink-muted"
              >
                Ret
              </button>
              <button
                type="button"
                onClick={() => void handleToggleActive(badge)}
                disabled={togglingActive}
                className="min-h-11 rounded-lg border border-line-strong px-3 py-2 text-sm text-ink-muted disabled:opacity-50"
              >
                {badge.isActive ? 'Deaktivér' : 'Aktivér'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
