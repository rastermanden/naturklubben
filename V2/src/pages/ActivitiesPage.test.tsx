import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('convex/react', () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useQuery: () => [],
}))

import ActivitiesPage from './ActivitiesPage'

afterEach(cleanup)

describe('ActivitiesPage', () => {
  it('viser Spil for et medlem, som i den nuværende app', () => {
    render(
      <MemoryRouter>
        <ActivitiesPage />
      </MemoryRouter>,
    )
    expect(
      screen.getByRole('link', { name: /Spil/ }).getAttribute('href'),
    ).toBe('/spil')
    expect(
      screen.getByRole('link', { name: /Naturlog/ }).getAttribute('href'),
    ).toBe('/naturlog')
  })
})
