import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { membersQueryKey } from '../members/useMembers'
import { isAdminQueryKey } from './useIsAdmin'

export interface AdminRoleChange {
  id: number
  actor_id: string
  actor_name: string
  target_id: string
  target_name: string
  old_is_admin: boolean
  new_is_admin: boolean
  changed_at: string
}

interface SetAdminRoleInput {
  targetUserId: string
  makeAdmin: boolean
}

export const adminRoleChangesQueryKey = ['admin-role-changes'] as const

async function fetchAdminRoleChanges(): Promise<AdminRoleChange[]> {
  const { data, error } = await supabase
    .from('admin_role_changes')
    .select(
      'id, actor_id, actor_name, target_id, target_name, old_is_admin, new_is_admin, changed_at',
    )
    .order('changed_at', { ascending: false })
    .limit(20)

  if (error) throw error
  return data ?? []
}

export function useAdminRoles(currentUserId: string) {
  const queryClient = useQueryClient()

  const roleChangesQuery = useQuery({
    queryKey: adminRoleChangesQueryKey,
    queryFn: fetchAdminRoleChanges,
  })

  const setAdminRole = useMutation({
    mutationFn: async ({ targetUserId, makeAdmin }: SetAdminRoleInput) => {
      const { error } = await supabase.rpc('set_admin_role', {
        target_user_id: targetUserId,
        make_admin: makeAdmin,
      })
      if (error) throw error
    },
    onSuccess: (_data, { targetUserId }) => {
      const invalidations = [
        queryClient.invalidateQueries({ queryKey: membersQueryKey }),
        queryClient.invalidateQueries({ queryKey: adminRoleChangesQueryKey }),
      ]

      if (targetUserId === currentUserId) {
        invalidations.push(
          queryClient.invalidateQueries({
            queryKey: isAdminQueryKey(currentUserId),
          }),
        )
      }

      // Mutationen skal kunne vise selvnedgraderings-kvitteringen, før den
      // opdaterede admin-query får AdminRoute til at navigere væk.
      void Promise.all(invalidations)
    },
  })

  return { roleChangesQuery, setAdminRole }
}
