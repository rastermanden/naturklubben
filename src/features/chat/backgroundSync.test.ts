// Background Sync (#219).
//
// jsdom har hverken service worker eller SyncManager, så testene skifter
// `navigator.serviceWorker` ud med det, de enkelte grene skal se. Det er
// API-kontrakten, der efterprøves: at et nej er et nej, og at registreringen
// bruger det tag, service workeren lytter på.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CHAT_QUEUE_SYNC_TAG } from '../../lib/chatQueueSync'
import { requestChatQueueSync } from './backgroundSync'

function stubServiceWorker(registration: unknown) {
  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve(registration) },
  })
}

afterEach(() => {
  Reflect.deleteProperty(window.navigator, 'serviceWorker')
  vi.restoreAllMocks()
})

describe('requestChatQueueSync', () => {
  it('melder pænt nej, når browseren slet ikke har service workers', async () => {
    expect(await requestChatQueueSync()).toBe(false)
  })

  it('melder nej, når browseren ikke har Background Sync -- køen sendes så ved næste app-start', async () => {
    stubServiceWorker({})

    expect(await requestChatQueueSync()).toBe(false)
  })

  it('registrerer opgaven med det tag, service workeren lytter på', async () => {
    const register = vi.fn().mockResolvedValue(undefined)
    stubServiceWorker({ sync: { register } })

    expect(await requestChatQueueSync()).toBe(true)
    expect(register).toHaveBeenCalledWith(CHAT_QUEUE_SYNC_TAG)
  })

  it('melder nej frem for at kaste, hvis browseren afviser registreringen', async () => {
    const register = vi.fn().mockRejectedValue(new Error('Permission denied'))
    stubServiceWorker({ sync: { register } })

    expect(await requestChatQueueSync()).toBe(false)
  })
})
