interface RecoveryDependencies {
  cacheStorage?: Pick<CacheStorage, 'keys' | 'delete'>
  serviceWorker?: Pick<ServiceWorkerContainer, 'getRegistrations'>
  reload?: () => void
}

export async function clearCachedAppAndReload(
  dependencies: RecoveryDependencies = {},
) {
  const cacheStorage =
    dependencies.cacheStorage ??
    ('caches' in window ? window.caches : undefined)
  const serviceWorker =
    dependencies.serviceWorker ??
    ('serviceWorker' in navigator ? navigator.serviceWorker : undefined)
  const reload = dependencies.reload ?? (() => window.location.reload())

  const cacheNames = cacheStorage ? await cacheStorage.keys() : []
  const registrations = serviceWorker
    ? await serviceWorker.getRegistrations()
    : []
  const relevantRegistrations = registrations.filter((registration) =>
    window.location.href.startsWith(registration.scope),
  )
  const relevantCacheNames = cacheNames.filter(
    (cacheName) =>
      cacheName === 'supabase-storage-images' ||
      relevantRegistrations.some((registration) =>
        cacheName.includes(registration.scope),
      ),
  )

  await Promise.all([
    ...relevantCacheNames.map((cacheName) => cacheStorage?.delete(cacheName)),
    ...relevantRegistrations.map((registration) => registration.unregister()),
  ])

  reload()
}
