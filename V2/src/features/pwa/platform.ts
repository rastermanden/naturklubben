/**
 * Hvilken slags enhed og visning appen kører i. Bruges både til
 * "Installér app" (#291) og til push-notifikationer, der på iOS kun virker
 * fra hjemmeskærmen.
 */

type NavigatorLike = Pick<
  Navigator,
  'userAgent' | 'platform' | 'maxTouchPoints'
>

/** iPhone, iPod eller iPad -- også iPadOS 13+, der melder sig som Mac med touch. */
export function isIosDevice(nav: NavigatorLike = navigator): boolean {
  return (
    /iPad|iPhone|iPod/.test(nav.userAgent) ||
    (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
  )
}

export function isAndroidDevice(nav: NavigatorLike = navigator): boolean {
  return /Android/i.test(nav.userAgent)
}

/** Kører appen fra hjemmeskærmen (installeret) frem for i en browserfane? */
export function isStandaloneDisplay(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    // Safaris egen, ikke-standardiserede variant.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}
