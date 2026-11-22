import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getFunctionName } from 'convex/server'
import type { Id } from '../../../convex/_generated/dataModel'

type MutationHandler = (args: unknown) => unknown

const queryCalls = vi.hoisted(() => [] as { name: string; args: unknown }[])
const mutationCalls = vi.hoisted(() => [] as { name: string; args: unknown }[])
const mutationHandlers = vi.hoisted(() => new Map<string, MutationHandler>())

const state: {
  meal:
    | {
        plan: {
          mainDish: string
          buyerId: string | null
          buyerName: string | null
          isBuyer: boolean
        } | null
        canManage: boolean
        wishes: {
          id: string
          category: 'paalaeg' | 'broed' | 'snacks' | 'andet'
          text: string
          authorName: string
          mine: boolean
          canDelete: boolean
        }[]
      }
    | undefined
  members: { _id: string; fullName?: string }[] | undefined
} = {
  meal: undefined,
  members: [],
}

vi.mock('convex/react', () => ({
  useQuery: (query: unknown, args: unknown) => {
    const name = getFunctionName(query as never)
    queryCalls.push({ name, args })
    if (args === 'skip') return undefined
    if (name === 'meals:forEvent') return state.meal
    if (name === 'members:listMembers') return state.members
    return undefined
  },
  useMutation: (mutation: unknown) => {
    const name = getFunctionName(mutation as never)
    return async (args: unknown) => {
      mutationCalls.push({ name, args })
      const handler = mutationHandlers.get(name)
      if (handler !== undefined) return await handler(args)
      return null
    }
  },
}))

import { EventMealSection } from './EventMealSection'

const eventId = 'event1' as Id<'events'>

function deferred<T = null>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  queryCalls.length = 0
  mutationCalls.length = 0
  mutationHandlers.clear()
  state.meal = undefined
  state.members = []
})

describe('EventMealSection', () => {
  it('viser ingenting, når begivenheden ikke har en madplan og man ikke er arrangør', () => {
    state.meal = { plan: null, canManage: false, wishes: [] }
    const { container } = render(<EventMealSection eventId={eventId} />)
    expect(container.textContent).toBe('')
    expect(
      queryCalls.filter((call) => call.name === 'members:listMembers'),
    ).toEqual([{ name: 'members:listMembers', args: 'skip' }])
  })

  it('skjuler opret-formularen indtil knappen trykkes og opretter listen med startMeal', async () => {
    state.meal = { plan: null, canManage: true, wishes: [] }
    state.members = [{ _id: 'troels', fullName: 'Troels' }]
    const pending = deferred()
    mutationHandlers.set('meals:startMeal', () => pending.promise)

    render(<EventMealSection eventId={eventId} />)

    expect(screen.queryByLabelText('Hovedret')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Opret listen' })).toBeNull()
    expect(
      queryCalls.filter((call) => call.name === 'members:listMembers'),
    ).toEqual([{ name: 'members:listMembers', args: 'skip' }])

    fireEvent.click(screen.getByRole('button', { name: 'Opret mad og indkøb' }))

    expect(
      queryCalls.some(
        (call) =>
          call.name === 'members:listMembers' &&
          typeof call.args === 'object' &&
          call.args !== null,
      ),
    ).toBe(true)

    const dishInput = screen.getByLabelText('Hovedret') as HTMLInputElement
    fireEvent.change(dishInput, {
      target: { value: 'Lasagne' },
    })
    fireEvent.change(screen.getByLabelText('Madansvarlig'), {
      target: { value: 'troels' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Opret listen' }))

    expect(dishInput.disabled).toBe(true)
    expect(mutationCalls).toEqual([
      {
        name: 'meals:startMeal',
        args: {
          eventId,
          mainDish: 'Lasagne',
          buyerId: 'troels',
        },
      },
    ])

    pending.resolve(null)
    await waitFor(() => {
      expect(screen.queryByLabelText('Hovedret')).toBeNull()
    })
  })

  it('viser hovedretten, ønskerne samlet efter kategori og ombryder lange ønsker', () => {
    const longWish =
      'Et meget langt ønske om rugbrød og smør, der ikke må blive klippet af med ellipsis'
    state.meal = {
      plan: {
        mainDish: 'Chili con carne',
        buyerId: 'troels',
        buyerName: 'Troels',
        isBuyer: true,
      },
      canManage: false,
      wishes: [
        {
          id: 'w1',
          category: 'broed',
          text: longWish,
          authorName: 'Kasper',
          mine: false,
          canDelete: true,
        },
        {
          id: 'w2',
          category: 'paalaeg',
          text: 'leverpostej',
          authorName: 'Mikkel',
          mine: false,
          canDelete: true,
        },
      ],
    }

    render(<EventMealSection eventId={eventId} />)

    expect(screen.getByRole('heading', { name: 'Mad og indkøb' })).toBeTruthy()
    expect(screen.getByText('Chili con carne')).toBeTruthy()
    expect(screen.getByText('Troels')).toBeTruthy()
    expect(screen.getByText('Du står for indkøbet.')).toBeTruthy()
    const headings = screen
      .getAllByRole('heading', { level: 4 })
      .map((heading) => heading.textContent)
    expect(headings[0]).toContain('Pålæg')
    expect(headings[1]).toContain('Brød')
    expect(screen.getByText('leverpostej')).toBeTruthy()

    const wishText = screen.getByText(longWish)
    expect(wishText.className).toContain('break-words')
    expect(wishText.className).not.toContain('truncate')
    expect(wishText.parentElement?.className).toContain('min-w-0')
    expect(wishText.parentElement?.className).toContain('flex-1')

    expect(screen.getAllByText('Ingen endnu.').length).toBe(2)
    expect(screen.queryByRole('button', { name: 'Ret hovedret' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Fjern listen' })).toBeNull()
  })

  it('sender ønsket med kategori og låser felterne under afsendelse', async () => {
    state.meal = {
      plan: {
        mainDish: 'Chili con carne',
        buyerId: null,
        buyerName: null,
        isBuyer: false,
      },
      canManage: false,
      wishes: [],
    }
    const pending = deferred()
    mutationHandlers.set('meals:addWish', () => pending.promise)

    render(<EventMealSection eventId={eventId} />)
    const wishInput = screen.getByLabelText('Ønske') as HTMLInputElement
    const categorySelect = screen.getByLabelText(
      'Kategori',
    ) as HTMLSelectElement

    fireEvent.change(wishInput, { target: { value: 'knækbrød' } })
    fireEvent.change(categorySelect, { target: { value: 'broed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Tilføj' }))

    expect(wishInput.disabled).toBe(true)
    expect(categorySelect.disabled).toBe(true)
    expect(mutationCalls).toEqual([
      {
        name: 'meals:addWish',
        args: {
          eventId,
          category: 'broed',
          text: 'knækbrød',
        },
      },
    ])

    pending.resolve(null)
    await waitFor(() => {
      expect(wishInput.disabled).toBe(false)
      expect(wishInput.value).toBe('')
    })
    expect(categorySelect.disabled).toBe(false)
  })

  it('viser nuværende madansvarlig mens listen hentes og kan skifte madansvarlig', async () => {
    state.meal = {
      plan: {
        mainDish: 'Chili con carne',
        buyerId: 'troels',
        buyerName: 'Troels',
        isBuyer: false,
      },
      canManage: true,
      wishes: [],
    }
    state.members = undefined

    const { rerender } = render(<EventMealSection eventId={eventId} />)
    const select = screen.getByLabelText(
      'Skift madansvarlig',
    ) as HTMLSelectElement
    expect(select.disabled).toBe(true)
    expect(select.value).toBe('troels')
    expect(select.selectedOptions[0]?.textContent).toBe('Troels')

    state.members = [
      { _id: 'troels', fullName: 'Troels' },
      { _id: 'kasper', fullName: 'Kasper' },
    ]
    rerender(<EventMealSection eventId={eventId} />)

    fireEvent.change(screen.getByLabelText('Skift madansvarlig'), {
      target: { value: 'kasper' },
    })

    await waitFor(() => {
      expect(mutationCalls).toEqual([
        {
          name: 'meals:setBuyer',
          args: {
            eventId,
            buyerId: 'kasper',
          },
        },
      ])
    })
  })

  it('viser kun slet-knap med ønsket i aria-label når canDelete er true', async () => {
    state.meal = {
      plan: {
        mainDish: 'Chili con carne',
        buyerId: null,
        buyerName: null,
        isBuyer: false,
      },
      canManage: false,
      wishes: [
        {
          id: 'w1',
          category: 'broed',
          text: 'rugbrød',
          authorName: 'Kasper',
          mine: true,
          canDelete: true,
        },
        {
          id: 'w2',
          category: 'andet',
          text: 'kaffe',
          authorName: 'Mikkel',
          mine: false,
          canDelete: false,
        },
      ],
    }

    render(<EventMealSection eventId={eventId} />)

    const deleteButton = screen.getByRole('button', { name: 'Slet rugbrød' })
    expect(screen.queryByRole('button', { name: 'Slet kaffe' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Slet' })).toBeNull()

    fireEvent.click(deleteButton)

    await waitFor(() => {
      expect(mutationCalls).toEqual([
        {
          name: 'meals:deleteWish',
          args: { wishId: 'w1' },
        },
      ])
    })
  })

  it('viser en dansk fejlbesked, når en handling afvises', async () => {
    state.meal = {
      plan: {
        mainDish: 'Chili con carne',
        buyerId: null,
        buyerName: null,
        isBuyer: false,
      },
      canManage: false,
      wishes: [],
    }
    mutationHandlers.set('meals:addWish', () =>
      Promise.reject(new Error('MEAL_WISHES_FULL')),
    )

    render(<EventMealSection eventId={eventId} />)
    fireEvent.change(screen.getByLabelText('Ønske'), {
      target: { value: 'sennep' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Tilføj' }))

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(
        'Listen er fuld. Fjern et ønske, før du skriver et nyt.',
      )
    })
  })

  it('lader arrangøren rette hovedretten og fjerne listen efter bekræftelse', async () => {
    state.meal = {
      plan: {
        mainDish: 'Chili con carne',
        buyerId: null,
        buyerName: null,
        isBuyer: false,
      },
      canManage: true,
      wishes: [],
    }
    state.members = []
    const pendingUpdate = deferred()
    mutationHandlers.set('meals:updateMainDish', () => pendingUpdate.promise)

    render(<EventMealSection eventId={eventId} />)

    fireEvent.click(screen.getByRole('button', { name: 'Ret hovedret' }))
    const editInput = document.getElementById(
      'meal-dish-edit',
    ) as HTMLInputElement
    expect(editInput.value).toBe('Chili con carne')

    fireEvent.change(editInput, { target: { value: 'Grøntsagssuppe' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gem' }))

    expect(editInput.disabled).toBe(true)
    expect(mutationCalls).toContainEqual({
      name: 'meals:updateMainDish',
      args: { eventId, mainDish: 'Grøntsagssuppe' },
    })

    pendingUpdate.resolve(null)
    await waitFor(() => {
      expect(document.getElementById('meal-dish-edit')).toBeNull()
    })

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false)
    fireEvent.click(screen.getByRole('button', { name: 'Fjern listen' }))
    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining('Hovedretten og alle ønsker'),
    )
    expect(
      mutationCalls.filter((call) => call.name === 'meals:deleteMeal'),
    ).toEqual([])

    confirmSpy.mockReturnValueOnce(true)
    fireEvent.click(screen.getByRole('button', { name: 'Fjern listen' }))

    await waitFor(() => {
      expect(mutationCalls).toContainEqual({
        name: 'meals:deleteMeal',
        args: { eventId },
      })
    })
  })
})
