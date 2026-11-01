import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const mocks = vi.hoisted(() => ({ signOut: vi.fn() }))

vi.mock('./useAuth', () => ({
  useAuth: () => ({ signOut: mocks.signOut }),
}))

import { SignOutSection } from './SignOutSection'

afterEach(() => {
  cleanup()
  mocks.signOut.mockReset()
})

function renderOnProfile() {
  return render(
    <MemoryRouter initialEntries={['/profil']}>
      <Routes>
        <Route
          path="/profil"
          element={<SignOutSection email="medlem@example.com" />}
        />
        <Route path="/" element={<h1>Forside</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('SignOutSection', () => {
  it('viser, hvem man er logget ind som', () => {
    renderOnProfile()
    expect(screen.getByText('medlem@example.com')).toBeTruthy()
  })

  it('logger ud og sender til forsiden', async () => {
    mocks.signOut.mockResolvedValue(undefined)
    renderOnProfile()

    fireEvent.click(screen.getByRole('button', { name: 'Log ud' }))

    expect(await screen.findByRole('heading', { name: 'Forside' })).toBeTruthy()
    expect(mocks.signOut).toHaveBeenCalledTimes(1)
  })
})
