import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ActivitiesSection } from './ActivitiesSection'
import type { Activity } from './types'
import {
  useActivities,
  useDeleteActivity,
  useReorderActivities,
} from './useActivities'

// Formularen har sin egen adfærd og sin egen Supabase-mutation; her handler
// testen om listen, rækkefølgen og sletningen.
vi.mock('./ActivityForm', () => ({
  ActivityForm: ({ activity }: { activity?: Activity }) => (
    <p>{activity ? `Retter ${activity.title}` : 'Ny aktivitet-formular'}</p>
  ),
}))

// Hele hook-modulet mockes: det trækker Supabase-klienten ind, og testen
// handler om listen, ikke om kaldene bag den.
vi.mock('./useActivities', () => ({
  useActivities: vi.fn(),
  useDeleteActivity: vi.fn(),
  useReorderActivities: vi.fn(),
  useSaveActivity: vi.fn(),
}))

const activities: Activity[] = [
  {
    id: 'a',
    title: 'Hornfisk',
    description: 'Vi mødes om hornfisketure.',
    icon: 'binoculars',
    sort_order: 1,
    link_url: null,
    link_label: null,
  },
  {
    id: 'b',
    title: 'Madkoordinering',
    description: 'Vi planlægger indkøb og menuer.',
    icon: null,
    sort_order: 2,
    link_url: 'https://bral.dk',
    link_label: 'Læs mere',
  },
]

const reorder = vi.fn()
const remove = vi.fn()

beforeEach(() => {
  reorder.mockResolvedValue(undefined)
  remove.mockResolvedValue(undefined)

  vi.mocked(useActivities).mockReturnValue({
    data: activities,
    isPending: false,
    isError: false,
    isSuccess: true,
    error: null,
  } as unknown as ReturnType<typeof useActivities>)

  vi.mocked(useReorderActivities).mockReturnValue({
    mutateAsync: reorder,
    isPending: false,
  } as unknown as ReturnType<typeof useReorderActivities>)

  vi.mocked(useDeleteActivity).mockReturnValue({
    mutateAsync: remove,
    isPending: false,
  } as unknown as ReturnType<typeof useDeleteActivity>)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('ActivitiesSection', () => {
  it('lists the activities in the order they are shown to members', () => {
    render(<ActivitiesSection />)

    const titles = screen
      .getAllByRole('listitem')
      .map((item) => item.textContent)
    expect(titles[0]).toContain('Hornfisk')
    expect(titles[1]).toContain('Madkoordinering')
  })

  it('writes the new order when an activity is moved down', async () => {
    render(<ActivitiesSection />)

    fireEvent.click(screen.getByRole('button', { name: 'Flyt Hornfisk ned' }))

    expect(reorder).toHaveBeenCalledWith([
      { id: 'b', sort_order: 1 },
      { id: 'a', sort_order: 2 },
    ])
    expect((await screen.findByRole('status')).textContent).toBe(
      'Hornfisk er flyttet ned.',
    )
  })

  // Den øverste kan ikke flyttes op, den nederste ikke ned -- ellers ville
  // knappen skrive en rækkefølge, der er identisk med den, der står.
  it('disables the moves that would run past the ends of the list', () => {
    render(<ActivitiesSection />)

    const up = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Flyt Hornfisk op',
    })
    const down = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Flyt Madkoordinering ned',
    })
    expect(up.disabled).toBe(true)
    expect(down.disabled).toBe(true)
  })

  it('deletes only after the admin confirms', () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => false),
    )
    render(<ActivitiesSection />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Slet' })[0])
    expect(remove).not.toHaveBeenCalled()

    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    )
    fireEvent.click(screen.getAllByRole('button', { name: 'Slet' })[0])
    expect(remove).toHaveBeenCalledWith('a')
  })

  it('opens the form on the activity being edited', () => {
    render(<ActivitiesSection />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Ret' })[1])
    expect(screen.getByText('Retter Madkoordinering')).toBeTruthy()
  })

  it('shows a failed write in Danish instead of a Postgres code', async () => {
    remove.mockRejectedValue({ code: '42501' })
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    )
    render(<ActivitiesSection />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Slet' })[0])

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Du har ikke rettigheder til at ændre aktiviteterne. Prøv at logge ind igen.',
    )
  })
})
