import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { OnlineMembers } from './OnlineMembers'

const profiles = {
  ada: { full_name: 'Ada', avatar_url: null, chat_color: '#15803d' },
  bo: { full_name: 'Bo', avatar_url: null, chat_color: '#15803d' },
}

afterEach(cleanup)

describe('OnlineMembers', () => {
  it('renders nothing when nobody is online', () => {
    const { container } = render(
      <OnlineMembers members={[]} profiles={profiles} currentUserId="bo" />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('counts everyone online and names the current user', () => {
    render(
      <OnlineMembers
        members={[
          { userId: 'ada', isAway: false, awayMessage: null },
          { userId: 'bo', isAway: false, awayMessage: null },
        ]}
        profiles={profiles}
        currentUserId="bo"
      />,
    )

    expect(screen.getByText('2 online')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Ada' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Bo (dig)' })).toBeTruthy()
  })

  it('shows who is away and why', () => {
    render(
      <OnlineMembers
        members={[
          { userId: 'ada', isAway: true, awayMessage: 'til frokost' },
          { userId: 'bo', isAway: false, awayMessage: null },
        ]}
        profiles={profiles}
        currentUserId="bo"
      />,
    )

    expect(screen.getByText('2 online · 1 væk')).toBeTruthy()
    expect(
      screen.getByRole('img', { name: 'Ada (væk: til frokost)' }),
    ).toBeTruthy()
  })

  it('marks an away member without a reason', () => {
    render(
      <OnlineMembers
        members={[{ userId: 'ada', isAway: true, awayMessage: null }]}
        profiles={profiles}
        currentUserId="bo"
      />,
    )

    expect(screen.getByRole('img', { name: 'Ada (væk)' })).toBeTruthy()
  })
})
