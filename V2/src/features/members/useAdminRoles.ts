import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

/** Én række i revisionssporet, som adminpanelet viser de seneste 20 af. */
export interface AdminRoleChange {
  _id: Id<'adminRoleChanges'>
  actorId: Id<'profiles'>
  actorName: string
  targetId: Id<'profiles'>
  targetName: string
  oldIsAdmin: boolean
  newIsAdmin: boolean
  changedAt: number
}

/**
 * Adminrollerne: historikken og den ene mutation, der må flytte et flag.
 *
 * `useMutation` har ikke en `isPending` som React Query, så den holdes i
 * lokal state. Det er nok her: panelet er det eneste sted, rollen ændres, og
 * knapperne skal bare være spærret, mens kaldet løber.
 */
export function useAdminRoles() {
  const roleChanges = useQuery(api.members.listAdminRoleChanges)
  const setAdmin = useMutation(api.members.setAdmin)
  const [isPending, setIsPending] = useState(false)

  async function setAdminRole(args: {
    targetId: Id<'profiles'>
    makeAdmin: boolean
  }) {
    setIsPending(true)
    try {
      await setAdmin(args)
    } finally {
      setIsPending(false)
    }
  }

  return {
    roleChanges: roleChanges ?? [],
    isLoading: roleChanges === undefined,
    setAdminRole,
    isPending,
  }
}
