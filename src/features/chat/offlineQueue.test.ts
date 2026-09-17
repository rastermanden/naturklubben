// Kølogikken er rene funktioner (#219) og testes derfor uden IndexedDB,
// uden netværk og uden `navigator` -- det er hele pointen med at lægge den
// der.
import { describe, expect, it } from 'vitest'
import {
  MAX_SEND_ATTEMPTS,
  createQueuedMessage,
  dropDeliveredMessages,
  enqueueMessage,
  errorText,
  isQueued,
  isRetryableSendError,
  markMessageFailed,
  markMessageSending,
  mergeQueues,
  nextSendableMessage,
  queueForRoom,
  removeQueuedMessage,
  resumeInterruptedQueue,
  resumeQueuedMessage,
  sortQueue,
  type QueuedDraft,
  type QueuedMessage,
} from './offlineQueue'

const draft: QueuedDraft = {
  userId: 'member-1',
  room: 'general',
  content: 'Mød mig ved søen',
}

function queued(
  clientId: string,
  overrides: Partial<QueuedMessage> = {},
): QueuedMessage {
  return {
    ...createQueuedMessage(
      draft,
      clientId,
      `2026-09-17T09:0${clientId.slice(-1)}:00.000Z`,
    ),
    ...overrides,
  }
}

describe('createQueuedMessage', () => {
  it('udfylder standarderne, så en kladde kun skal bære det, brugeren skrev', () => {
    expect(
      createQueuedMessage(draft, 'client-1', '2026-09-17T09:00:00.000Z'),
    ).toEqual({
      clientId: 'client-1',
      userId: 'member-1',
      room: 'general',
      content: 'Mød mig ved søen',
      messageType: 'text',
      mentions: [],
      replyToMessageId: null,
      writtenAt: '2026-09-17T09:00:00.000Z',
      status: 'queued',
      attempts: 0,
      lastError: null,
    })
  })
})

describe('sortQueue', () => {
  it('holder skrive-rækkefølgen, uanset hvordan listen er samlet', () => {
    const queue = [queued('client-3'), queued('client-1'), queued('client-2')]

    expect(sortQueue(queue).map((entry) => entry.clientId)).toEqual([
      'client-1',
      'client-2',
      'client-3',
    ])
  })

  it('rører ikke listen, den får', () => {
    const queue = [queued('client-2'), queued('client-1')]

    sortQueue(queue)

    expect(queue.map((entry) => entry.clientId)).toEqual([
      'client-2',
      'client-1',
    ])
  })
})

describe('enqueueMessage', () => {
  it('lægger beskeden i køen i skrive-rækkefølge', () => {
    const queue = enqueueMessage([queued('client-2')], queued('client-1'))

    expect(queue.map((entry) => entry.clientId)).toEqual([
      'client-1',
      'client-2',
    ])
  })

  it('lægger ikke den samme besked i køen to gange', () => {
    const first = enqueueMessage([], queued('client-1'))
    const again = enqueueMessage(first, queued('client-1'))

    expect(again).toHaveLength(1)
  })
})

describe('mergeQueues', () => {
  it('fletter lagerets kø ind i den, appen allerede har, uden dubletter', () => {
    const merged = mergeQueues(
      [queued('client-2')],
      [queued('client-1'), queued('client-2')],
    )

    expect(merged.map((entry) => entry.clientId)).toEqual([
      'client-1',
      'client-2',
    ])
  })
})

describe('markMessageSending og markMessageFailed', () => {
  it('markerer beskeden som undervejs', () => {
    const [entry] = markMessageSending([queued('client-1')], 'client-1')

    expect(entry.status).toBe('sending')
  })

  it('noterer fejlen og tæller forsøget, så et håbløst forsøg ikke gentages i det uendelige', () => {
    const [entry] = markMessageFailed(
      [queued('client-1')],
      'client-1',
      'Failed to fetch',
    )

    expect(entry.status).toBe('failed')
    expect(entry.attempts).toBe(1)
    expect(entry.lastError).toBe('Failed to fetch')
  })

  it('rører ikke de andre beskeder i køen', () => {
    const queue = markMessageFailed(
      [queued('client-1'), queued('client-2')],
      'client-2',
      'fejl',
    )

    expect(queue[0].status).toBe('queued')
    expect(queue[0].attempts).toBe(0)
  })
})

describe('resumeQueuedMessage', () => {
  it('stiller beskeden tilbage, som da den blev skrevet', () => {
    const failed = markMessageFailed(
      markMessageSending([queued('client-1')], 'client-1'),
      'client-1',
      'fejl',
    )
    const [entry] = resumeQueuedMessage(failed, 'client-1')

    expect(entry.status).toBe('queued')
    expect(entry.attempts).toBe(0)
    expect(entry.lastError).toBeNull()
  })
})

describe('resumeInterruptedQueue', () => {
  it('tager beskeder med tilbage, efter at appen blev lukket midt i en afsendelse', () => {
    const queue = resumeInterruptedQueue([
      markMessageSending([queued('client-1')], 'client-1')[0],
      queued('client-2'),
    ])

    expect(queue.map((entry) => entry.status)).toEqual(['queued', 'queued'])
  })
})

describe('nextSendableMessage', () => {
  it('sender den ældste først', () => {
    const queue = [queued('client-2'), queued('client-1')]

    expect(
      nextSendableMessage(queue, 'member-1', 'general')?.clientId,
    ).toBe('client-1')
  })

  it('springer en besked over, der allerede er undervejs', () => {
    const queue = markMessageSending(
      [queued('client-1'), queued('client-2')],
      'client-1',
    )

    expect(
      nextSendableMessage(queue, 'member-1', 'general')?.clientId,
    ).toBe('client-2')
  })

  it('giver op efter det aftalte antal forsøg, så brugeren selv skal trykke', () => {
    let queue = [queued('client-1')]
    for (let attempt = 0; attempt < MAX_SEND_ATTEMPTS; attempt += 1) {
      queue = markMessageFailed(queue, 'client-1', 'fejl')
    }

    expect(nextSendableMessage(queue, 'member-1', 'general')).toBeUndefined()
  })

  it('sender ikke en anden brugers ventende besked med denne brugers token', () => {
    const queue = [queued('client-1', { userId: 'member-2' })]

    expect(nextSendableMessage(queue, 'member-1', 'general')).toBeUndefined()
  })

  it('sender ikke et andet rums ventende besked, før man selv står i det rum', () => {
    const queue = [queued('client-1', { room: 'admin' })]

    expect(nextSendableMessage(queue, 'member-1', 'general')).toBeUndefined()
    expect(
      nextSendableMessage(queue, 'member-1', 'admin')?.clientId,
    ).toBe('client-1')
  })
})

describe('queueForRoom', () => {
  it('viser kun det ventende for det rum, man står i', () => {
    const queue = [queued('client-1'), queued('client-2', { room: 'admin' })]

    expect(
      queueForRoom(queue, 'general', 'member-1').map((entry) => entry.clientId),
    ).toEqual(['client-1'])
    expect(
      queueForRoom(queue, 'admin', 'member-1').map((entry) => entry.clientId),
    ).toEqual(['client-2'])
  })

  it('viser ikke en anden brugers ventende besked som ens egen', () => {
    const queue = [
      queued('client-1'),
      queued('client-2', { userId: 'member-2' }),
    ]

    expect(
      queueForRoom(queue, 'general', 'member-1').map((entry) => entry.clientId),
    ).toEqual(['client-1'])
  })
})

describe('dropDeliveredMessages', () => {
  it('skjuler en besked, der allerede er kommet ind i historikken', () => {
    const queue = [queued('client-1'), queued('client-2')]

    expect(
      dropDeliveredMessages(queue, [{ id: 'client-1' }]).map(
        (entry) => entry.clientId,
      ),
    ).toEqual(['client-2'])
  })
})

describe('removeQueuedMessage og isQueued', () => {
  it('fjerner beskeden helt', () => {
    const queue = removeQueuedMessage(
      [queued('client-1'), queued('client-2')],
      'client-1',
    )

    expect(queue.map((entry) => entry.clientId)).toEqual(['client-2'])
    expect(isQueued(queue, 'client-1')).toBe(false)
    expect(isQueued(queue, 'client-2')).toBe(true)
  })
})

describe('isRetryableSendError', () => {
  it('prøver igen, når browseren slet ikke kunne nå frem', () => {
    expect(isRetryableSendError(new TypeError('Failed to fetch'))).toBe(true)
  })

  it('prøver igen på den fejl, supabase-js giver videre for et afvist fetch', () => {
    expect(
      isRetryableSendError({
        message: 'TypeError: Failed to fetch',
        details: 'TypeError: Failed to fetch\n    at u',
        hint: '',
        code: '',
      }),
    ).toBe(true)
  })

  it('prøver igen på en serverfejl og på en afbrudt forespørgsel', () => {
    expect(
      isRetryableSendError({ message: 'Service Unavailable', status: 503 }),
    ).toBe(true)
    const aborted = new Error('The operation was aborted.')
    aborted.name = 'AbortError'
    expect(isRetryableSendError(aborted)).toBe(true)
  })

  it('lægger ikke en afvist besked i køen -- den ville fejle igen og igen', () => {
    expect(
      isRetryableSendError({
        message:
          'new row for relation "messages" violates check constraint "messages_content_state_check"',
        details: 'Failing row contains (…)',
        hint: null,
        code: '23514',
      }),
    ).toBe(false)
    expect(
      isRetryableSendError({
        message:
          'new row violates row-level security policy for table "messages"',
        code: '42501',
      }),
    ).toBe(false)
    expect(isRetryableSendError(undefined)).toBe(false)
  })
})

describe('errorText', () => {
  it('giver en læsbar tekst, uanset hvad der blev kastet', () => {
    expect(errorText(new Error('Netværket er nede'))).toBe('Netværket er nede')
    expect(errorText('gik galt')).toBe('gik galt')
    expect(errorText({ message: 'Fejl fra serveren' })).toBe(
      'Fejl fra serveren',
    )
    expect(errorText({})).toBe('Ukendt fejl')
  })
})
