import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameScore } from './types'

const leaderboardQuery = vi.hoisted(() => ({
  data: undefined as GameScore[] | undefined,
  isPending: false,
  isError: false,
  isSuccess: true,
  refetch: vi.fn(),
}))

const deleteScore = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  isError: false,
  variables: undefined as string | undefined,
}))

const auth = vi.hoisted(() => ({ userId: 'alice' as string | undefined }))
const admin = vi.hoisted(() => ({ isAdmin: false }))

vi.mock('./useGameScores', () => ({
  useLeaderboard: () => leaderboardQuery,
  useDeleteScore: () => deleteScore,
}))
vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    session: auth.userId ? { user: { id: auth.userId } } : null,
  }),
}))
vi.mock('../admin/useIsAdmin', () => ({
  useIsAdmin: () => admin,
}))

import { Leaderboard } from './Leaderboard'

function score(
  playerId: string,
  name: string,
  points: number,
  id = `${playerId}-${points}`,
): GameScore {
  return {
    id,
    game: 'tetris',
    player_id: playerId,
    score: points,
    lines: 20,
    level: 3,
    duration_seconds: 195,
    created_at: '2026-09-06T10:00:00.000Z',
    player: { id: playerId, full_name: name, avatar_url: null },
  }
}

afterEach(() => {
  cleanup()
  leaderboardQuery.data = undefined
  auth.userId = 'alice'
  admin.isAdmin = false
  deleteScore.mutate.mockReset()
})

describe('Leaderboard', () => {
  it('viser hvert medlem én gang med deres bedste resultat', () => {
    leaderboardQuery.data = [
      score('bob', 'Bob Bak', 9000),
      score('alice', 'Alice Ask', 5000),
      score('alice', 'Alice Ask', 2000),
    ]

    render(<Leaderboard game="tetris" />)

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('Bob Bak')
    expect(rows[0].textContent).toContain('9.000')
    expect(rows[1].textContent).toContain('Alice Ask')
    expect(rows[1].textContent).not.toContain('2.000')
  })

  it('siger til, når ingen har spillet endnu', () => {
    leaderboardQuery.data = []

    render(<Leaderboard game="tetris" />)

    expect(screen.getByText(/Ingen har spillet endnu/)).toBeTruthy()
  })

  it('lader kun spilleren selv og en admin slette et resultat', () => {
    leaderboardQuery.data = [score('bob', 'Bob Bak', 9000)]

    const { unmount } = render(<Leaderboard game="tetris" />)
    expect(screen.queryByRole('button', { name: /Slet resultatet/ })).toBeNull()
    unmount()

    admin.isAdmin = true
    render(<Leaderboard game="tetris" />)

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: /Slet resultatet/ }))

    expect(deleteScore.mutate).toHaveBeenCalledWith('bob-9000')
    confirm.mockRestore()
  })

  it('sletter ikke, når spørgsmålet besvares med nej', () => {
    leaderboardQuery.data = [score('alice', 'Alice Ask', 4000)]

    render(<Leaderboard game="tetris" />)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(screen.getByRole('button', { name: /Slet resultatet/ }))

    expect(deleteScore.mutate).not.toHaveBeenCalled()
    confirm.mockRestore()
  })
})
