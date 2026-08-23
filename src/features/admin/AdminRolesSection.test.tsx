import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useMembers, type Member } from '../members/useMembers'
import { AdminRolesSection } from './AdminRolesSection'
import { useAdminRoles } from './useAdminRoles'

vi.mock('../members/useMembers', () => ({ useMembers: vi.fn() }))

vi.mock('./useAdminRoles', () => ({ useAdminRoles: vi.fn() }))

const members: Member[] = [
  {
    id: 'admin-id',
    full_name: 'Martin',
    avatar_url: null,
    chat_color: '#16a34a',
    is_admin: true,
    created_at: '2026-08-20T10:00:00.000Z',
  },
  {
    id: 'member-id',
    full_name: 'Kasper',
    avatar_url: null,
    chat_color: '#2563eb',
    is_admin: false,
    created_at: '2026-08-21T10:00:00.000Z',
  },
]

const roleChanges = [
  {
    id: 1,
    actor_id: 'admin-id',
    actor_name: 'Martin',
    target_id: 'member-id',
    target_name: 'Kasper',
    old_is_admin: false,
    new_is_admin: true,
    changed_at: '2026-08-23T12:30:00.000Z',
  },
]

type MembersQuery = ReturnType<typeof useMembers>
type AdminRoles = ReturnType<typeof useAdminRoles>
type RoleChangesQuery = AdminRoles['roleChangesQuery']
type SetAdminRole = AdminRoles['setAdminRole']

const refetchMembers = vi.fn()
const mutateRole = vi.fn()

function mockQueries({
  roleMutation = mutateRole,
}: {
  roleMutation?: typeof mutateRole
} = {}) {
  vi.mocked(useMembers).mockReturnValue({
    data: members,
    isPending: false,
    isError: false,
    isSuccess: true,
    refetch: refetchMembers,
  } as unknown as MembersQuery)

  vi.mocked(useAdminRoles).mockReturnValue({
    roleChangesQuery: {
      data: roleChanges,
      isPending: false,
      isError: false,
      isSuccess: true,
    } as RoleChangesQuery,
    setAdminRole: {
      mutateAsync: roleMutation,
      isPending: false,
    } as unknown as SetAdminRole,
  })
}

function renderSection() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route
          path="/admin"
          element={<AdminRolesSection currentUserId="admin-id" />}
        />
        <Route path="/" element={<h1>Forside</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mutateRole.mockResolvedValue(undefined)
  mockQueries()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('AdminRolesSection', () => {
  it('shows member roles and the recent audit trail', () => {
    renderSection()

    expect(
      screen.getByRole('button', { name: 'Fjern adminrolle' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Gør til administrator' }),
    ).toBeTruthy()
    expect(screen.getByText('Seneste rolleændringer')).toBeTruthy()
    expect(screen.getByText(/Medlem → Administrator/)).toBeTruthy()
  })

  it('does not call the RPC when the confirmation is cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderSection()

    fireEvent.click(
      screen.getByRole('button', { name: 'Gør til administrator' }),
    )

    expect(mutateRole).not.toHaveBeenCalled()
  })

  it('promotes a member and shows a success message', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderSection()

    fireEvent.click(
      screen.getByRole('button', { name: 'Gør til administrator' }),
    )

    expect((await screen.findByRole('status')).textContent).toBe(
      'Kasper er nu administrator.',
    )
    expect(mutateRole).toHaveBeenCalledWith({
      targetUserId: 'member-id',
      makeAdmin: true,
    })
  })

  it('shows the server-side last-admin error', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mutateRole.mockRejectedValueOnce({
      code: '23514',
      message: 'admin_role_last_admin',
    })
    renderSection()

    fireEvent.click(screen.getByRole('button', { name: 'Fjern adminrolle' }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Den sidste administrator kan ikke få fjernet sin adminrolle.',
    )
  })

  it('confirms a self-demotion, reports success and leaves the admin page', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined)
    renderSection()

    fireEvent.click(screen.getByRole('button', { name: 'Fjern adminrolle' }))

    expect(await screen.findByRole('heading', { name: 'Forside' })).toBeTruthy()
    expect(alert).toHaveBeenCalledWith('Din adminrolle er fjernet.')
    expect(mutateRole).toHaveBeenCalledWith({
      targetUserId: 'admin-id',
      makeAdmin: false,
    })
  })
})
