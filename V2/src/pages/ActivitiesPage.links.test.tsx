import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('convex/react', () => ({
  useConvexAuth: () => ({ isAuthenticated: false, isLoading: false }),
  useQuery: () => [
    {
      id: 'moenter',
      title: 'Design af Mønter',
      description: 'Klubbens mønter.',
      icon: 'footprints',
      sortOrder: 1,
      linkUrl: 'https://bral.dk',
      linkLabel: 'Læs om valutaen på bral.dk',
    },
    {
      id: 'btg',
      title: 'BøsseTennisGolf',
      description: 'Turneringen.',
      icon: 'footprints',
      sortOrder: 4,
      linkUrl: 'https://rastermanden.github.io/btg/',
      linkLabel: 'Se BøsseTennisGolf-siden',
    },
  ],
}))

import ActivitiesPage from './ActivitiesPage'

afterEach(cleanup)

describe('aktivitetslinks', () => {
  it('viser bral.dk og BøsseTennisGolf-siden som i den nuværende app', () => {
    render(
      <MemoryRouter>
        <ActivitiesPage />
      </MemoryRouter>,
    )
    expect(
      screen
        .getByRole('link', { name: /Læs om valutaen på bral.dk/ })
        .getAttribute('href'),
    ).toBe('https://bral.dk')
    expect(
      screen
        .getByRole('link', { name: /Se BøsseTennisGolf-siden/ })
        .getAttribute('href'),
    ).toBe('https://rastermanden.github.io/btg/')
  })
})
