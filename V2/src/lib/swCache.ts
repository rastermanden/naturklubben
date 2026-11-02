/**
 * Hvilke forespørgsler service workeren må lægge i billedcachen.
 *
 * Den nuværende app cacher `*.supabase.co/storage/...`. V2's billeder ligger
 * i Convex filstorage, så værten er en anden, men reglen er den samme:
 * kun de offentlige fil-URL'er, ikke API-kald eller andre domæner.
 */
export function isCachedImageRequest(url: URL): boolean {
  return (
    url.protocol === 'https:' &&
    url.hostname.endsWith('.convex.cloud') &&
    url.pathname.startsWith('/api/storage/')
  )
}

/**
 * Produktions-workeren har scope `/` og må ikke besvare et preview med
 * produktionens `index.html`. Samme denylist som i den nuværende app.
 */
export function previewNavigationPattern(basePath: string): RegExp {
  return new RegExp(`^${basePath}pr-preview/`)
}
