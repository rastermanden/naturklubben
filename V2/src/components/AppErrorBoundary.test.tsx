import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppErrorBoundary } from './AppErrorBoundary'

afterEach(cleanup)

/** Kaster, indtil `state.broken` sættes fra `false`. */
const state = { broken: true }
function Flaky() {
  if (state.broken) throw new Error('queryen fejlede')
  return <p>Feltet er tilbage</p>
}

describe('AppErrorBoundary', () => {
  it('viser hele-siden-beskeden uden en fallback', () => {
    state.broken = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <AppErrorBoundary>
        <Flaky />
      </AppErrorBoundary>,
    )

    expect(screen.getByRole('alert').textContent).toContain(
      'Noget gik galt på denne side',
    )
  })

  it('viser kun fallbacken, når der er en -- resten af siden skal kunne bruges', () => {
    state.broken = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <AppErrorBoundary fallback={<p>Feltet kunne ikke hentes</p>}>
        <Flaky />
      </AppErrorBoundary>,
    )

    expect(screen.getByText('Feltet kunne ikke hentes')).toBeTruthy()
    expect(screen.queryByText(/Noget gik galt/)).toBeNull()
  })

  it('monterer undertræet igen, når fallbacken beder om det', () => {
    // Uden en vej tilbage ville en forbigående fejl -- et deploy midt i en
    // session -- koste feltet resten af sessionen: React monterer ikke selv
    // et undertræ, en grænse har fanget.
    state.broken = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <AppErrorBoundary
        fallback={(retry) => (
          <button type="button" onClick={retry}>
            Prøv igen
          </button>
        )}
      >
        <Flaky />
      </AppErrorBoundary>,
    )

    expect(screen.queryByText('Feltet er tilbage')).toBeNull()

    state.broken = false
    fireEvent.click(screen.getByRole('button', { name: 'Prøv igen' }))

    expect(screen.getByText('Feltet er tilbage')).toBeTruthy()
  })
})
