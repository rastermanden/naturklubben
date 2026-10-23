import { useCallback, useEffect, useState } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'

/**
 * Push-notifikationer i browseren.
 *
 * Svarer til `src/features/notifications/usePushNotifications.ts` i den gamle
 * app, men to ting er flyttet: VAPID-nøglen hentes gennem en Convex-action i
 * stedet for et GET-kald til en Edge Function, og abonnementet gemmes med en
 * mutation i stedet for et `upsert` mod en tabel.
 *
 * **Det sidste stykke virker endnu ikke.** Abonnementet kan oprettes og gemmes,
 * men der kan ikke sendes en notifikation, før `web-push`-pakken er tilføjet --
 * se `V2/convex/pushSend.ts`. Knappen må ikke love mere, end serveren kan
 * holde, så teksten i `NotificationToggle` siger det.
 */

export type PushUnavailableReason = 'unsupported' | 'needs-install' | 'blocked'

export interface BrowserPushSubscription {
  endpoint: string
  p256dh: string
  auth: string
}

export type PushStatus =
  | { state: 'loading' }
  | { state: 'unavailable'; reason: PushUnavailableReason }
  | { state: 'off' }
  | { state: 'on' }

export class PushSetupError extends Error {
  readonly reason: PushUnavailableReason

  constructor(reason: PushUnavailableReason) {
    super(reason)
    this.name = 'PushSetupError'
    this.reason = reason
  }
}

function isIosSafari() {
  const ua = navigator.userAgent
  // iPadOS 13+ melder sig som Mac, men har touch -- derfor maxTouchPoints.
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safaris egen, ikke-standardiserede variant.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function pushApiAvailable() {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/**
 * Venter på en aktiv service worker, men giver op efter et par sekunder:
 * `navigator.serviceWorker.ready` resolver aldrig, hvis der ingen registrering
 * er, og ville ellers hænge knappen i "arbejder..." for evigt.
 */
async function waitForRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
  ])
}

// Returtypen er bevidst Uint8Array<ArrayBuffer>: pushManager.subscribe kræver
// en BufferSource, og den generiske Uint8Array kan i teorien ligge på en
// SharedArrayBuffer, som ikke tæller som en.
function base64UrlToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='))
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function encodeKey(subscription: PushSubscription, name: 'p256dh' | 'auth') {
  const key = subscription.getKey(name)
  if (!key) throw new Error(`Abonnementet mangler ${name}-nøglen`)
  let binary = ''
  for (const byte of new Uint8Array(key)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Er abonnementet oprettet med præcis denne VAPID-nøgle? */
function usesKey(subscription: PushSubscription, key: Uint8Array) {
  const current = subscription.options.applicationServerKey
  if (!current) return false
  const bytes = new Uint8Array(current)
  return (
    bytes.length === key.length && bytes.every((byte, i) => byte === key[i])
  )
}

/**
 * Skridtene, der kræver en browser: tilladelse, service worker og selve
 * abonnementet hos push-tjenesten. Nøglen kommer fra serveren.
 */
export async function prepareBrowserPushSubscription(
  fetchVapidPublicKey: () => Promise<string>,
): Promise<BrowserPushSubscription> {
  if (!pushApiAvailable()) {
    throw new PushSetupError(
      isIosSafari() && !isStandalone() ? 'needs-install' : 'unsupported',
    )
  }
  if (Notification.permission === 'denied') {
    throw new PushSetupError('blocked')
  }

  const permission =
    Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new PushSetupError(
      permission === 'denied' ? 'blocked' : 'unsupported',
    )
  }

  const registration = await waitForRegistration()
  if (!registration) throw new PushSetupError('unsupported')

  const publicKey = await fetchVapidPublicKey()
  const applicationServerKey = base64UrlToUint8Array(publicKey)
  const existing = await registration.pushManager.getSubscription()
  // Et abonnement, der er oprettet med en anden nøgle, kan serveren ikke
  // kryptere til. Det smides væk og laves om.
  if (existing && !usesKey(existing, applicationServerKey)) {
    await existing.unsubscribe()
  }

  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    }))

  return {
    endpoint: subscription.endpoint,
    p256dh: encodeKey(subscription, 'p256dh'),
    auth: encodeKey(subscription, 'auth'),
  }
}

export function usePushNotifications() {
  const fetchVapidPublicKey = useAction(api.push.vapidPublicKey)
  const registerSubscription = useMutation(api.push.registerSubscription)
  const unregisterSubscription = useMutation(api.push.unregisterSubscription)

  const [endpoint, setEndpoint] = useState<string | null>(null)
  const [status, setStatus] = useState<PushStatus>({ state: 'loading' })
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Er netop denne browsers endpoint gemt på medlemmet? Convex-abonnementet
  // opdaterer svaret, når mutationen har skrevet.
  const registered = useQuery(
    api.push.subscriptionStatus,
    endpoint === null ? 'skip' : { endpoint },
  )

  useEffect(() => {
    let cancelled = false

    async function detect() {
      if (!pushApiAvailable()) {
        if (!cancelled) {
          setStatus({
            state: 'unavailable',
            reason:
              isIosSafari() && !isStandalone()
                ? 'needs-install'
                : 'unsupported',
          })
        }
        return
      }
      if (Notification.permission === 'denied') {
        if (!cancelled) setStatus({ state: 'unavailable', reason: 'blocked' })
        return
      }

      const registration = await waitForRegistration()
      if (cancelled) return
      if (!registration) {
        setStatus({ state: 'unavailable', reason: 'unsupported' })
        return
      }

      const subscription = await registration.pushManager.getSubscription()
      if (cancelled) return
      if (!subscription) {
        setStatus({ state: 'off' })
        return
      }
      setEndpoint(subscription.endpoint)
    }

    void detect()
    return () => {
      cancelled = true
    }
  }, [])

  // Serveren er sandheden om, hvorvidt enheden er tilmeldt: browserens
  // abonnement kan være ryddet, eller det kan høre til en anden konto.
  useEffect(() => {
    if (endpoint === null || registered === undefined) return
    setStatus(registered ? { state: 'on' } : { state: 'off' })
  }, [endpoint, registered])

  const enable = useCallback(async () => {
    setError(null)
    setIsWorking(true)
    try {
      const subscription = await prepareBrowserPushSubscription(async () =>
        await fetchVapidPublicKey({}),
      )
      await registerSubscription(subscription)
      setEndpoint(subscription.endpoint)
      setStatus({ state: 'on' })
    } catch (caught) {
      console.error('Kunne ikke slå notifikationer til', caught)
      if (caught instanceof PushSetupError) {
        setStatus({ state: 'unavailable', reason: caught.reason })
      } else {
        setError('Notifikationer kunne ikke slås til. Prøv igen.')
      }
    } finally {
      setIsWorking(false)
    }
  }, [fetchVapidPublicKey, registerSubscription])

  const disable = useCallback(async () => {
    setError(null)
    setIsWorking(true)
    try {
      const registration = await waitForRegistration()
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription) {
        await unregisterSubscription({ endpoint: subscription.endpoint })
        await subscription.unsubscribe()
      }
      setEndpoint(null)
      setStatus({ state: 'off' })
    } catch (caught) {
      console.error('Kunne ikke slå notifikationer fra', caught)
      setError('Notifikationer kunne ikke slås fra. Prøv igen.')
    } finally {
      setIsWorking(false)
    }
  }, [unregisterSubscription])

  return { status, isWorking, error, enable, disable }
}
