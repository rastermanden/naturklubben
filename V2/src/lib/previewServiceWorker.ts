/**
 * Fjerner en service worker, et tidligere preview har registreret under
 * sin egen sti. Produktionens worker har scope `/` og må blive: den styrer
 * hele origin, og et preview-besøg må ikke slå den fra.
 */

export function isPreviewScopedRegistration(
  scope: string,
  previewScope: string,
): boolean {
  let pathname: string
  try {
    pathname = new URL(scope).pathname
  } catch {
    return false
  }
  if (pathname === '/') return false

  const normalized = previewScope.endsWith('/')
    ? previewScope
    : `${previewScope}/`
  return scope === normalized.slice(0, -1) || scope.startsWith(normalized)
}

export function isPreviewCache(name: string): boolean {
  return name.includes('pr-preview')
}

export async function clearPreviewServiceWorker(input: {
  previewScope: string
  registrations: readonly {
    scope: string
    unregister: () => Promise<boolean>
  }[]
  cacheNames: readonly string[]
  deleteCache: (name: string) => Promise<boolean>
}): Promise<void> {
  await Promise.all(
    input.registrations
      .filter((registration) =>
        isPreviewScopedRegistration(registration.scope, input.previewScope),
      )
      .map((registration) => registration.unregister()),
  )
  await Promise.all(
    input.cacheNames
      .filter(isPreviewCache)
      .map((name) => input.deleteCache(name)),
  )
}

/** Kører i browseren ved opstart. Gør ingenting uden service worker-API. */
export function clearStalePreviewServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return
  }

  const previewScope = new URL(import.meta.env.BASE_URL, window.location.origin)
    .href

  void (async () => {
    const registrations = await navigator.serviceWorker.getRegistrations()
    const cacheNames = 'caches' in window ? await caches.keys() : []
    await clearPreviewServiceWorker({
      previewScope,
      registrations,
      cacheNames,
      deleteCache: (name) => caches.delete(name),
    })
  })()
}
