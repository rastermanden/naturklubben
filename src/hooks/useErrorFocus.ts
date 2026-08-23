import { useCallback, useLayoutEffect, useState, type RefObject } from 'react'

export function useErrorFocus<T extends HTMLElement>(ref: RefObject<T | null>) {
  const [focusRequest, setFocusRequest] = useState(0)
  const [announcement, setAnnouncement] = useState(0)

  useLayoutEffect(() => {
    if (focusRequest > 0) ref.current?.focus()
  }, [focusRequest, ref])

  const requestErrorFocus = useCallback(() => {
    if (document.activeElement === ref.current) {
      setAnnouncement((request) => request + 1)
      return
    }

    setAnnouncement(0)
    setFocusRequest((request) => request + 1)
  }, [ref])

  return [requestErrorFocus, announcement] as const
}
