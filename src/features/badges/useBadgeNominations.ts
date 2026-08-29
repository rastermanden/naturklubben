import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { memberBadgesQueryKey } from './useMemberBadges'
import type { BadgeNomination, NominationVote } from './types'

export const badgeNominationsQueryKey = [
  'badge_nominations',
  'pending',
] as const
export const badgeProductionsQueryKey = ['badge_productions'] as const

const SELECT =
  'id, badge_id, nominee_id, nominated_by, reason, status, created_at, resolved_at, badges(id, slug, name, description, image_path, image_width, image_height, image_mime_type, crop_x, crop_y, crop_size, diameter_mm, bleed_mm, print_path, print_status, print_error, print_started_at, is_active, created_at, updated_at), badge_nomination_approvals(id, admin_id, vote, comment, created_at)'

async function fetchPendingNominations(): Promise<BadgeNomination[]> {
  const { data, error } = await supabase
    .from('badge_nominations')
    .select(SELECT)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as unknown as BadgeNomination[]
}

/**
 * De åbne indstillinger. RLS afgør selv, hvad der kommer med: admins ser alle,
 * et almindeligt medlem ser kun sine egne indstillinger.
 */
export function useBadgeNominations() {
  return useQuery({
    queryKey: badgeNominationsQueryKey,
    queryFn: fetchPendingNominations,
  })
}

/**
 * Notifikationen er bevidst adskilt fra selve handlingen: en indstilling, der
 * er gemt, må ikke rulles tilbage, fordi en telefon ikke kunne nås.
 */
async function notify(
  kind: 'nominated' | 'awarded',
  ids: { nominationId?: string; memberBadgeId?: string },
) {
  try {
    await supabase.functions.invoke('badge-notifications', {
      body: { kind, ...ids },
    })
  } catch (notificationError) {
    console.error('Badge-notifikationen kunne ikke sendes', notificationError)
  }
}

export function useNominateMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      badgeId,
      nomineeId,
      reason,
    }: {
      badgeId: string
      nomineeId: string
      reason: string
    }) => {
      const { data, error } = await supabase.rpc('nominate_member_for_badge', {
        p_badge_id: badgeId,
        p_nominee_id: nomineeId,
        p_reason: reason,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: async (nominationId) => {
      await queryClient.invalidateQueries({
        queryKey: badgeNominationsQueryKey,
      })
      await notify('nominated', { nominationId })
    },
  })
}

export interface VoteResult {
  nomination_status: 'pending' | 'approved' | 'rejected'
  approvals: number
  member_badge_id: string | null
}

export function useVoteOnNomination() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      nominationId,
      vote,
      comment,
    }: {
      nominationId: string
      vote: NominationVote
      comment?: string
    }) => {
      const { data, error } = await supabase.rpc('vote_on_badge_nomination', {
        p_nomination_id: nominationId,
        p_vote: vote,
        p_comment: comment?.trim() || null,
      })
      if (error) throw error
      const result = (data as VoteResult[] | null)?.[0]
      if (!result) throw new Error('Stemmen blev ikke registreret.')
      return result
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: badgeNominationsQueryKey }),
        queryClient.invalidateQueries({ queryKey: memberBadgesQueryKey }),
        queryClient.invalidateQueries({ queryKey: badgeProductionsQueryKey }),
      ])
      if (result.member_badge_id) {
        await notify('awarded', { memberBadgeId: result.member_badge_id })
      }
    },
  })
}

/** Antallet af godkendelser -- to kræves, og de skal komme fra to forskellige admins. */
export function approvalCount(nomination: BadgeNomination) {
  return nomination.badge_nomination_approvals.filter(
    (approval) => approval.vote === 'approve',
  ).length
}

export function hasVoted(nomination: BadgeNomination, adminId: string) {
  return nomination.badge_nomination_approvals.some(
    (approval) => approval.admin_id === adminId,
  )
}
