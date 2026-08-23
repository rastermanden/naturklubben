import { useEffect, useRef, useState } from 'react'
import { matchPath, useLocation } from 'react-router-dom'
import type { RouteMetadata } from '../routeMetadata'

interface RouteNavigationProps {
  routes: readonly RouteMetadata[]
  contentId?: string
}

export function RouteNavigation({
  routes,
  contentId = 'main-content',
}: RouteNavigationProps) {
  const location = useLocation()
  const previousPathname = useRef(location.pathname)
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    const pathnameChanged = previousPathname.current !== location.pathname
    previousPathname.current = location.pathname

    const route = routes.find((candidate) =>
      matchPath({ path: candidate.path, end: true }, location.pathname),
    )
    if (!route) return

    document.title = route.documentTitle
    if (!pathnameChanged) return

    const focusTimer = window.setTimeout(() => {
      setAnnouncement(route.announcement)

      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return

      const content = document.getElementById(contentId)
      const focusTarget =
        content?.querySelector<HTMLElement>('[data-route-focus], h1') ?? content
      if (!focusTarget) return

      if (!focusTarget.hasAttribute('tabindex')) {
        focusTarget.tabIndex = -1
      }
      focusTarget.focus()
    }, 0)

    return () => window.clearTimeout(focusTimer)
  }, [contentId, location.pathname, routes])

  return (
    <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {announcement}
    </p>
  )
}
