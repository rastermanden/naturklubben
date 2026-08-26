import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminTabPanel, AdminTabs } from './AdminTabs'
import { ADMIN_TABS } from './adminTabs'

afterEach(cleanup)

describe('AdminTabs', () => {
  it('marks only the active tab as selected', () => {
    render(<AdminTabs activeTab="medlemmer" onSelect={vi.fn()} />)

    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(ADMIN_TABS.length)
    const selected = tabs.filter(
      (tab) => tab.getAttribute('aria-selected') === 'true',
    )
    expect(selected).toHaveLength(1)
    expect(selected[0].textContent).toContain('Medlemmer')
  })

  it('keeps unselected tabs out of the tab order', () => {
    render(<AdminTabs activeTab="medlemmer" onSelect={vi.fn()} />)

    const reachable = screen
      .getAllByRole('tab')
      .filter((tab) => tab.getAttribute('tabindex') === '0')
    expect(reachable).toHaveLength(1)
    expect(reachable[0].textContent).toContain('Medlemmer')
  })

  it('moves between tabs with the arrow keys', () => {
    const onSelect = vi.fn()
    render(<AdminTabs activeTab="medlemmer" onSelect={onSelect} />)

    const active = screen.getByRole('tab', { name: 'Medlemmer' })
    fireEvent.keyDown(active, { key: 'ArrowRight' })
    expect(onSelect).toHaveBeenCalledWith('badges')

    fireEvent.keyDown(active, { key: 'ArrowLeft' })
    expect(onSelect).toHaveBeenCalledWith('ansoegninger')
  })

  it('wraps around at both ends', () => {
    const onSelect = vi.fn()
    const { rerender } = render(
      <AdminTabs activeTab="ansoegninger" onSelect={onSelect} />,
    )

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Ansøgninger' }), {
      key: 'ArrowLeft',
    })
    expect(onSelect).toHaveBeenCalledWith('indstillinger')

    onSelect.mockClear()
    rerender(<AdminTabs activeTab="indstillinger" onSelect={onSelect} />)
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Indstillinger' }), {
      key: 'ArrowRight',
    })
    expect(onSelect).toHaveBeenCalledWith('ansoegninger')
  })

  it('jumps to the first and last tab with Home and End', () => {
    const onSelect = vi.fn()
    render(<AdminTabs activeTab="medlemmer" onSelect={onSelect} />)

    const active = screen.getByRole('tab', { name: 'Medlemmer' })
    fireEvent.keyDown(active, { key: 'End' })
    expect(onSelect).toHaveBeenCalledWith('indstillinger')

    fireEvent.keyDown(active, { key: 'Home' })
    expect(onSelect).toHaveBeenCalledWith('ansoegninger')
  })

  it('shows a badge only when something is waiting', () => {
    render(
      <AdminTabs
        activeTab="ansoegninger"
        onSelect={vi.fn()}
        badges={{ ansoegninger: 3, adgang: 0 }}
      />,
    )

    expect(
      screen.getByRole('tab', { name: 'Ansøgninger, 3 venter' }),
    ).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Adgang' })).toBeTruthy()
  })

  it('renders a panel wired to its tab, and hides the rest', () => {
    render(
      <>
        <AdminTabs activeTab="adgang" onSelect={vi.fn()} />
        <AdminTabPanel tab="adgang" activeTab="adgang">
          <p>Synligt</p>
        </AdminTabPanel>
        <AdminTabPanel tab="medlemmer" activeTab="adgang">
          <p>Skjult</p>
        </AdminTabPanel>
      </>,
    )

    const panel = screen.getByRole('tabpanel')
    expect(panel.textContent).toBe('Synligt')
    expect(screen.queryByText('Skjult')).toBeNull()

    const tab = screen.getByRole('tab', { name: 'Adgang' })
    expect(panel.getAttribute('aria-labelledby')).toBe(tab.id)
    expect(tab.getAttribute('aria-controls')).toBe(panel.id)
  })
})
