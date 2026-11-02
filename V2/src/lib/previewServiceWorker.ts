/**
 * Fjerner den gamle preview-worker (`sw.js`) under previewets egen sti.
 * `sw-prod.js` bliver: den leverer push. Produktionens worker har scope `/`
 * og må også blive, for et preview-besøg må ikke slå den fra.
 */

/**
 * Den gamle preview-worker (`sw.js`) afregistrerer sig selv og må ikke blive
 * liggende. `sw-prod.js` er den worker, appen selv registrerer, så push kan
 * leveres -- den har samme scope og må ikke ryddes væk sammen med den gamle.
 */
export function isStalePreviewWorker(
  registration: { scope: string; scriptURL: string },
  previewScope: string,
): boolean {
  if (!isPreviewScopedRegistration(registration.scope, previewScope)) {
    return false
  }
  let pathname: string
  try {
    pathname = new URL(registration.scriptURL).pathname
  } catch {
    return false
  }
  return pathname.endsWith('/sw.js')
}

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
    scriptURL: string
    unregister: () => Promise<boolean>
  }[]
  cacheNames: readonly string[]
  deleteCache: (name: string) => Promise<boolean>
}): Promise<void> {
  await Promise.all(
    input.registrations
      .filter((registration) =>
        isStalePreviewWorker(registration, input.previewScope),
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
export function clearStalePreviewServiceWorker(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return Promise.resolve()
  }

  const previewScope = new URL(import.meta.env.BASE_URL, window.location.origin)
    .href

  return (async () => {
    const registrations = await navigator.serviceWorker.getRegistrations()
    const cacheNames = 'caches' in window ? await caches.keys() : []
    await clearPreviewServiceWorker({
      previewScope,
      registrations: registrations.map((registration) => ({
        scope: registration.scope,
        scriptURL:
          registration.active?.scriptURL ??
          registration.waiting?.scriptURL ??
          registration.installing?.scriptURL ??
          '',
        unregister: () => registration.unregister(),
      })),
      cacheNames,
      deleteCache: (name) => caches.delete(name),
    })
  })()
}
