import { act, cleanup, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { membersQueryKey } from '../members/useMembers'
import { adminRoleChangesQueryKey, useAdminRoles } from './useAdminRoles'
import { isAdminQueryKey } from './useIsAdmin'

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('../../lib/supabaseClient', () => ({
  supabase: supabaseMocks,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('useAdminRoles', () => {
  it('calls the exact role RPC and invalidates all self-demotion queries', async () => {
    const queryBuilder = {
      select: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
    }
    queryBuilder.select.mockReturnValue(queryBuilder)
    queryBuilder.order.mockReturnValue(queryBuilder)
    queryBuilder.limit.mockResolvedValue({ data: [], error: null })
    supabaseMocks.from.mockReturnValue(queryBuilder)
    supabaseMocks.rpc.mockResolvedValue({ data: null, error: null })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const invalidateQueries = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue()

    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      )
    }

    const { result } = renderHook(() => useAdminRoles('admin-id'), {
      wrapper: Wrapper,
    })

    await act(async () => {
      await result.current.setAdminRole.mutateAsync({
        targetUserId: 'admin-id',
        makeAdmin: false,
      })
    })

    expect(supabaseMocks.rpc).toHaveBeenCalledWith('set_admin_role', {
      target_user_id: 'admin-id',
      make_admin: false,
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: membersQueryKey,
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: adminRoleChangesQueryKey,
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: isAdminQueryKey('admin-id'),
    })

    queryClient.clear()
  })
})
