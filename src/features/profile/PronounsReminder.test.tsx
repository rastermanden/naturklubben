import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProfileSummary } from '../chat/useProfilesMap'
import { PRONOUNS_UNDISCLOSED } from './pronouns'
import { PronounsReminder } from './PronounsReminder'
import { pronounsReminderStorageKey } from './pronounsReminderStorage'

const profilesMock = vi.hoisted(() => ({
  data: undefined as Record<string, ProfileSummary> | undefined,
}))

vi.mock('../chat/useProfilesMap', () => ({
  useProfilesMap: () => ({ data: profilesMock.data }),
}))

function profile(pronouns: string | null): ProfileSummary {
  return {
    full_name: 'Ida',
    pronouns,
    causes: [],
    avatar_url: null,
    chat_color: null,
  }
}

function renderReminder(path = '/kalender') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PronounsReminder userId="member-id" />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  profilesMock.data = undefined
})

afterEach(cleanup)

describe('PronounsReminder', () => {
  it('minder et medlem uden pronominer om at udfylde dem', () => {
    profilesMock.data = { 'member-id': profile(null) }
    renderReminder()

    expect(
      screen.getByRole('heading', { name: 'Hvad er dine pronominer?' }),
    ).toBeTruthy()
    expect(
      screen
        .getByRole('link', { name: 'Udfyld på min profil' })
        .getAttribute('href'),
    ).toBe('/profil')
  })

  it('siger intet, før profilen er hentet', () => {
    profilesMock.data = undefined
    renderReminder()
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('siger intet, når der er svaret -- også med "vil ikke oplyse"', () => {
    profilesMock.data = { 'member-id': profile('hen/hen') }
    const { unmount } = renderReminder()
    expect(screen.queryByRole('heading')).toBeNull()
    unmount()

    profilesMock.data = { 'member-id': profile(PRONOUNS_UNDISCLOSED) }
    renderReminder()
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('står ikke på profilsiden, hvor feltet selv står', () => {
    profilesMock.data = { 'member-id': profile(null) }
    renderReminder('/profil')
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('kan udskydes, og udskydelsen huskes på enheden', () => {
    profilesMock.data = { 'member-id': profile(null) }
    const { unmount } = renderReminder()

    fireEvent.click(screen.getByRole('button', { name: 'Ikke nu' }))
    expect(screen.queryByRole('heading')).toBeNull()

    const stored = window.localStorage.getItem(
      pronounsReminderStorageKey('member-id'),
    )
    expect(Number(stored)).toBeGreaterThan(Date.now())

    unmount()
    renderReminder()
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('kommer tilbage, når udskydelsen er udløbet', () => {
    profilesMock.data = { 'member-id': profile(null) }
    window.localStorage.setItem(
      pronounsReminderStorageKey('member-id'),
      String(Date.now() - 1),
    )
    renderReminder()
    expect(
      screen.getByRole('heading', { name: 'Hvad er dine pronominer?' }),
    ).toBeTruthy()
  })
})
