import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

/**
 * Rækkerne i medlemslisten. Felterne er de samme, som
 * `members.listMembers` returnerer -- bevidst ikke hele `profiles`-dokumentet,
 * så `userId` og en eventuel sletningsreservation ikke bliver en del af
 * klientens billede af de andre medlemmer.
 */
export interface Member {
  _id: Id<'profiles'>
  fullName?: string
  pronouns?: string
  causes: string[]
  avatarUrl?: string
  chatColor: string
  isAdmin: boolean
  createdAt: number
}

/**
 * Medlemslisten. Convex-abonnementet er selve opslaget: der er ingen
 * query-nøgle at invalidere og ingen `refetch` at kalde -- ændrer en profil
 * sig, tegnes listen om af sig selv.
 */
export function useMembers(): { members: Member[]; isLoading: boolean } {
  const members = useQuery(api.members.listMembers)
  return { members: members ?? [], isLoading: members === undefined }
}
