import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

const mocks = vi.hoisted(() => ({ session: null as object | null }))

vi.mock('../features/auth/useAuth', () => ({
  useAuth: () => ({ session: mocks.session }),
}))
vi.mock('../features/activities/useActivities', () => ({
  useActivities: () => ({ data: [], isPending: false, isError: false }),
}))

import ActivitiesPage from './ActivitiesPage'

afterEach(() => {
  cleanup()
  mocks.session = null
})

function clubLinks() {
  render(
    <MemoryRouter>
      <ActivitiesPage />
    </MemoryRouter>,
  )
  return within(screen.getByRole('list', { name: 'Klubbens egne' }))
}

describe('ActivitiesPage: Naturlog og Spil (#285)', () => {
  it('viser kort til Naturlog og Spil for medlemmer', () => {
    mocks.session = { user: { id: 'member-id' } }
    const list = clubLinks()

    expect(
      list.getByRole('link', { name: /Naturlog/ }).getAttribute('href'),
    ).toBe('/naturlog')
    expect(list.getByRole('link', { name: /Spil/ }).getAttribute('href')).toBe(
      '/spil',
    )
    expect(list.getByRole('link', { name: /BTG turnering/ })).toBeTruthy()
  })

  it('viser kun BTG for gæster, fordi Naturlog og Spil kræver login', () => {
    const list = clubLinks()

    expect(list.getByRole('link', { name: /BTG turnering/ })).toBeTruthy()
    expect(list.queryByRole('link', { name: /Naturlog/ })).toBeNull()
    expect(list.queryByRole('link', { name: /Spil/ })).toBeNull()
  })
})
