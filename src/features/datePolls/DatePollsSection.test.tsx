import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { DatePoll } from './datePolls'

const mocks = vi.hoisted(() => ({
  polls: [] as unknown[],
  createPoll: vi.fn(),
  setVote: vi.fn(),
  closePoll: vi.fn(),
  linkEvent: vi.fn(),
  deletePoll: vi.fn(),
  createEvent: vi.fn(),
}))

const mutation = (fn: ReturnType<typeof vi.fn>) => ({
  mutateAsync: fn,
  isPending: false,
})

vi.mock('./useDatePolls', () => ({
  useDatePolls: () => ({
    pollsQuery: {
      data: mocks.polls,
      isPending: false,
      isError: false,
      isSuccess: true,
    },
    createPoll: mutation(mocks.createPoll),
    setVote: mutation(mocks.setVote),
    closePoll: mutation(mocks.closePoll),
    linkEvent: mutation(mocks.linkEvent),
    deletePoll: mutation(mocks.deletePoll),
  }),
  toFriendlyDatePollError: () => 'Det lykkedes ikke.',
}))
vi.mock('../members/useMembers', () => ({
  useMembers: () => ({
    data: [
      { id: 'alice', full_name: 'Alice', is_admin: true },
      { id: 'bob', full_name: 'Bob', is_admin: true },
      { id: 'carl', full_name: 'Carl', is_admin: true },
      { id: 'dina', full_name: 'Dina', is_admin: false },
    ],
  }),
}))
vi.mock('../calendar/useEvents', () => ({
  useEvents: () => ({ createEvent: mutation(mocks.createEvent) }),
}))

import { DatePollsSection } from './DatePollsSection'

const OPEN_POLL: DatePoll = {
  id: 'poll-1',
  title: 'Svampetur',
  description: 'Hvornår kan I?',
  created_by: 'bob',
  created_at: '2026-11-01T10:00:00Z',
  closed_at: null,
  chosen_option_id: null,
  event_id: null,
  options: [
    {
      id: 'opt-a',
      position: 0,
      starts_at: new Date(2026, 11, 5, 10).toISOString(),
      ends_at: null,
      votes: [{ user_id: 'bob', answer: 'yes' }],
    },
    {
      id: 'opt-b',
      position: 1,
      starts_at: new Date(2026, 11, 6, 10).toISOString(),
      ends_at: null,
      votes: [
        { user_id: 'bob', answer: 'yes' },
        { user_id: 'alice', answer: 'maybe' },
      ],
    },
  ],
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
  mocks.polls = []
})

function renderSection() {
  return render(
    <MemoryRouter>
      <DatePollsSection adminId="alice" />
    </MemoryRouter>,
  )
}

describe('DatePollsSection (#288)', () => {
  it('opretter en afstemning med navn og de udfyldte datoer', async () => {
    mocks.createPoll.mockResolvedValue('new-id')
    renderSection()

    fireEvent.click(screen.getByRole('button', { name: 'Ny datoafstemning' }))
    const form = screen.getByRole('form', { name: 'Ny datoafstemning' })
    fireEvent.change(within(form).getByLabelText('Navn'), {
      target: { value: '  Julefrokost ' },
    })
    fireEvent.change(within(form).getByLabelText('Dato 1'), {
      target: { value: '2026-12-11T18:00' },
    })
    fireEvent.change(within(form).getByLabelText('Dato 2'), {
      target: { value: '2026-12-12T18:00' },
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Tilføj dato' }))
    fireEvent.click(
      within(form).getByRole('button', { name: 'Opret afstemning' }),
    )

    await waitFor(() => expect(mocks.createPoll).toHaveBeenCalledTimes(1))
    expect(mocks.createPoll).toHaveBeenCalledWith({
      title: 'Julefrokost',
      description: null,
      options: [
        {
          starts_at: new Date('2026-12-11T18:00').toISOString(),
          ends_at: null,
        },
        {
          starts_at: new Date('2026-12-12T18:00').toISOString(),
          ends_at: null,
        },
      ],
    })
    await waitFor(() =>
      expect(
        screen.queryByRole('form', { name: 'Ny datoafstemning' }),
      ).toBeNull(),
    )
  })

  it('sender ikke en afstemning med kun én dato', () => {
    renderSection()
    fireEvent.click(screen.getByRole('button', { name: 'Ny datoafstemning' }))
    const form = screen.getByRole('form', { name: 'Ny datoafstemning' })
    fireEvent.change(within(form).getByLabelText('Navn'), {
      target: { value: 'Tur' },
    })
    fireEvent.change(within(form).getByLabelText('Dato 1'), {
      target: { value: '2026-12-11T18:00' },
    })
    fireEvent.click(
      within(form).getByRole('button', { name: 'Opret afstemning' }),
    )

    expect(within(form).getByRole('alert').textContent).toMatch(/mindst 2/)
    expect(mocks.createPoll).not.toHaveBeenCalled()
  })

  it('viser optælling, hvem der svarede hvad, den bedste dato og hvem der mangler', () => {
    mocks.polls = [OPEN_POLL]
    renderSection()

    const card = screen.getByRole('article', { name: /Svampetur/ })
    const dates = within(card).getAllByRole('listitem')
    expect(dates[0]!.textContent).toContain('1 kan · 0 måske · 0 kan ikke')
    expect(dates[1]!.textContent).toContain('1 kan · 1 måske · 0 kan ikke')
    expect(dates[1]!.textContent).toContain('Passer flest')
    expect(dates[0]!.textContent).not.toContain('Passer flest')
    expect(dates[1]!.textContent).toContain('Kan: Bob · Kan måske: dig')
    expect(card.textContent).toContain('Mangler at svare: Carl')
    expect(card.textContent).toContain('Oprettet af Bob')
  })

  it('gemmer mit svar, og et tryk på det valgte svar fortryder det', () => {
    mocks.polls = [OPEN_POLL]
    mocks.setVote.mockResolvedValue(undefined)
    renderSection()

    const card = screen.getByRole('article', { name: /Svampetur/ })
    const [first, second] = within(card).getAllByRole('group', {
      name: /Dit svar for/,
    })
    fireEvent.click(within(first!).getByRole('button', { name: 'Kan' }))
    expect(mocks.setVote).toHaveBeenLastCalledWith({
      optionId: 'opt-a',
      answer: 'yes',
    })

    const maybe = within(second!).getByRole('button', { name: 'Kan måske' })
    expect(maybe.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(maybe)
    expect(mocks.setVote).toHaveBeenLastCalledWith({
      optionId: 'opt-b',
      answer: null,
    })
  })

  it('vælger en dato og lukker afstemningen efter en bekræftelse', () => {
    mocks.polls = [OPEN_POLL]
    mocks.closePoll.mockResolvedValue(undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderSection()

    const card = screen.getByRole('article', { name: /Svampetur/ })
    fireEvent.click(
      within(card).getAllByRole('button', { name: 'Vælg denne dato' })[1]!,
    )
    expect(mocks.closePoll).toHaveBeenCalledWith({
      pollId: 'poll-1',
      optionId: 'opt-b',
    })
  })

  it('opretter begivenheden ud fra den valgte dato og knytter den til afstemningen', async () => {
    mocks.polls = [
      {
        ...OPEN_POLL,
        closed_at: '2026-11-02T10:00:00Z',
        chosen_option_id: 'opt-b',
      },
    ]
    mocks.createEvent.mockResolvedValue('event-1')
    mocks.linkEvent.mockResolvedValue(undefined)
    renderSection()

    const card = screen.getByRole('article', { name: /Svampetur/ })
    expect(within(card).queryAllByRole('group')).toHaveLength(0)
    fireEvent.click(
      within(card).getByRole('button', {
        name: 'Opret begivenhed i kalenderen',
      }),
    )

    const form = screen.getByRole('dialog', { name: 'Ny begivenhed' })
    expect(
      (within(form).getByLabelText('Titel') as HTMLInputElement).value,
    ).toBe('Svampetur')
    fireEvent.submit(within(form).getByLabelText('Titel').closest('form')!)

    await waitFor(() =>
      expect(mocks.linkEvent).toHaveBeenCalledWith({
        pollId: 'poll-1',
        eventId: 'event-1',
      }),
    )
    expect(mocks.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Svampetur',
        description: 'Hvornår kan I?',
        start_at: OPEN_POLL.options[1]!.starts_at,
      }),
    )
  })

  it('linker til begivenheden, når den er oprettet', () => {
    mocks.polls = [
      {
        ...OPEN_POLL,
        closed_at: '2026-11-02T10:00:00Z',
        chosen_option_id: 'opt-b',
        event_id: 'event-1',
      },
    ]
    renderSection()

    expect(
      screen
        .getByRole('link', { name: 'Se begivenheden i kalenderen' })
        .getAttribute('href'),
    ).toBe('/kalender/event-1')
  })
})
