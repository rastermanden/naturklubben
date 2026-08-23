import { useCallback, useEffect, useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabaseClient'

/**
 * Hvorfor notifikationer ikke kan slås til lige nu -- eller null, hvis de kan.
 *
 * `needs-install` er iOS-tilfældet: Safari på iPhone/iPad giver først en app
 * adgang til Web Push, når den er lagt på hjemmeskærmen. Sat i Safari-fanen
 * findes PushManager slet ikke, så vi kan ikke skelne på API'et alene og må
 * kigge på platformen.
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

const VAPID_FUNCTION = 'chat-push'

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
 * er (fx på PR-previews, hvor PWA'en er slået fra), og ville ellers hænge
 * knappen i "arbejder..." for evigt.
 */
async function waitForRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
  ])
}

// Returtypen er bevidst Uint8Array<ArrayBuffer> og ikke bare Uint8Array:
// pushManager.subscribe kræver en BufferSource, og den generiske Uint8Array
// kan i teorien ligge på en SharedArrayBuffer, som ikke tæller som en.
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

async function fetchVapidPublicKey(
  functionName = VAPID_FUNCTION,
): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{
    publicKey: string
  }>(functionName, { method: 'GET' })
  if (error) throw error
  if (!data?.publicKey) throw new Error('Ingen VAPID-nøgle fra serveren')
  return data.publicKey
}

export async function prepareBrowserPushSubscription(
  functionName = VAPID_FUNCTION,
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

  const publicKey = await fetchVapidPublicKey(functionName)
  const applicationServerKey = base64UrlToUint8Array(publicKey)
  const existing = await registration.pushManager.getSubscription()
  if (existing && !usesKey(existing, applicationServerKey)) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', existing.endpoint)
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

export function usePushNotifications(userId: string) {
  const [status, setStatus] = useState<PushStatus>({ state: 'loading' })
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

      const { data } = await supabase
        .from('push_subscriptions')
        .select('id')
        .eq('user_id', userId)
        .eq('endpoint', subscription.endpoint)
        .maybeSingle()
      if (!cancelled) setStatus({ state: data ? 'on' : 'off' })
    }

    void detect()
    return () => {
      cancelled = true
    }
  }, [userId])

  const enable = useCallback(async () => {
    setError(null)
    setIsWorking(true)
    try {
      const subscription = await prepareBrowserPushSubscription()

      const { error: upsertError } = await supabase
        .from('push_subscriptions')
        .upsert(
          {
            user_id: userId,
            endpoint: subscription.endpoint,
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
          { onConflict: 'endpoint' },
        )
      if (upsertError) {
        // Rul browserabonnementet tilbage, så UI'et ikke påstår "til", mens
        // serveren ikke aner, hvor den skal sende hen.
        const registration = await waitForRegistration()
        await (await registration?.pushManager.getSubscription())?.unsubscribe()
        throw upsertError
      }

      setStatus({ state: 'on' })
    } catch (caught) {
      console.error('Kunne ikke slå notifikationer til', caught)
      // 503 fra chat-push: functionen kunne hverken hente eller oprette et
      // VAPID-nøglepar -- typisk fordi databasen ikke svarede, eller fordi
      // push_vapid_keys-migrationen ikke er deployet endnu. Det retter sig selv,
      // så "prøv igen om lidt" er det rigtige råd -- ikke "kontakt admin".
      if (caught instanceof PushSetupError) {
        setStatus({ state: 'unavailable', reason: caught.reason })
      } else if (
        caught instanceof FunctionsHttpError &&
        caught.context?.status === 503
      ) {
        setError(
          'Serveren kunne ikke sætte notifikationer op lige nu. Prøv igen om lidt.',
        )
      } else {
        setError('Notifikationer kunne ikke slås til. Prøv igen.')
      }
    } finally {
      setIsWorking(false)
    }
  }, [userId])

  const disable = useCallback(async () => {
    setError(null)
    setIsWorking(true)
    try {
      const registration = await waitForRegistration()
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription) {
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('endpoint', subscription.endpoint)
        await subscription.unsubscribe()
      }
      setStatus({ state: 'off' })
    } catch (caught) {
      console.error('Kunne ikke slå notifikationer fra', caught)
      setError('Notifikationer kunne ikke slås fra. Prøv igen.')
    } finally {
      setIsWorking(false)
    }
  }, [])

  return { status, isWorking, error, enable, disable }
}
