import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Id } from '../../../convex/_generated/dataModel'

const mutate = vi.fn()
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
  members: { _id: string; fullName?: string }[]
} = {
  meal: undefined,
  members: [],
}

vi.mock('convex/react', () => ({
  useQuery: (_query: unknown, args: unknown) => {
    if (args === 'skip') return undefined
    if (args !== null && typeof args === 'object' && 'eventId' in args) {
      return state.meal
    }
    return state.members
  },
  useMutation: () => mutate,
}))

import { EventMealSection } from './EventMealSection'

const eventId = 'event1' as Id<'events'>

afterEach(() => {
  cleanup()
  mutate.mockClear()
  state.meal = undefined
  state.members = []
})

describe('EventMealSection', () => {
  it('viser ingenting, når begivenheden ikke har en madplan', () => {
    state.meal = { plan: null, canManage: false, wishes: [] }
    const { container } = render(<EventMealSection eventId={eventId} />)
    expect(container.textContent).toBe('')
  })

  it('viser hovedretten og ønskerne samlet efter kategori', () => {
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
          text: 'rugbrød',
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
    expect(screen.getByText('rugbrød')).toBeTruthy()
    expect(screen.getAllByText('Ingen endnu.').length).toBe(2)
  })

  it('sender ønsket med kategori', () => {
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

    render(<EventMealSection eventId={eventId} />)
    fireEvent.change(screen.getByLabelText('Ønske'), {
      target: { value: 'knækbrød' },
    })
    fireEvent.change(screen.getByLabelText('Kategori'), {
      target: { value: 'broed' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Tilføj' }))

    expect(mutate).toHaveBeenCalledWith({
      eventId,
      category: 'broed',
      text: 'knækbrød',
    })
  })
})
