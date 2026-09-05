import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Fuldskærm i to lag: appens eget -- chatten lægger sig hen over app-shellen
 * -- og browserens, når den kan. Browserlaget er det, der også skjuler
 * adresselinjen, og det er dér, den store gevinst ligger på en telefon.
 * Safari på iPhone afviser `requestFullscreen`, og så står appens eget lag
 * alene tilbage; derfor er det aldrig betinget af, at browserlaget lykkes.
 */
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const isFullscreenRef = useRef(false)
  useEffect(() => {
    isFullscreenRef.current = isFullscreen
  }, [isFullscreen])

  // Forlader man browserens fuldskærm med Esc eller en systemgestus, får
  // appen ingen knap at reagere på -- kun denne hændelse.
  useEffect(() => {
    function syncWithBrowser() {
      if (!document.fullscreenElement) setIsFullscreen(false)
    }
    document.addEventListener('fullscreenchange', syncWithBrowser)
    return () =>
      document.removeEventListener('fullscreenchange', syncWithBrowser)
  }, [])

  // Går man fra chatten til en anden side, skal browseren ikke blive
  // hængende i fuldskærm på en side, der aldrig bad om det.
  useEffect(
    () => () => {
      if (isFullscreenRef.current) void setBrowserFullscreen(false)
    },
    [],
  )

  const toggleFullscreen = useCallback(() => {
    const next = !isFullscreen
    setIsFullscreen(next)
    void setBrowserFullscreen(next)
  }, [isFullscreen])

  return { isFullscreen, toggleFullscreen }
}

async function setBrowserFullscreen(on: boolean) {
  try {
    if (on) await document.documentElement.requestFullscreen?.()
    else if (document.fullscreenElement) await document.exitFullscreen()
  } catch {
    // Browseren må gerne sige nej -- appens eget fuldskærmslag står allerede.
  }
}
