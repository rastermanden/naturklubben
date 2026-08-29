export type BadgePrintStatus = 'pending' | 'rendering' | 'ready' | 'failed'
export type NominationStatus = 'pending' | 'approved' | 'rejected'
export type ProductionStatus = 'pending' | 'in_progress' | 'done'
export type NominationVote = 'approve' | 'reject'

export interface Badge {
  id: string
  slug: string
  name: string
  description: string | null
  image_path: string
  image_width: number
  image_height: number
  image_mime_type: string
  crop_x: number
  crop_y: number
  crop_size: number
  diameter_mm: number
  bleed_mm: number
  print_path: string | null
  print_status: BadgePrintStatus
  print_error: string | null
  /** Hvornår renderingen blev claimet -- se printStatus.ts. */
  print_started_at: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

/** De felter, en rund visning har brug for. */
export type BadgeArtwork = Pick<
  Badge,
  | 'image_path'
  | 'image_width'
  | 'image_height'
  | 'crop_x'
  | 'crop_y'
  | 'crop_size'
> & { name: string }

export interface MemberBadge {
  id: string
  badge_id: string
  profile_id: string
  nominated_by: string | null
  reason: string | null
  awarded_at: string
  badges: Badge
}

export interface NominationApproval {
  id: string
  admin_id: string
  vote: NominationVote
  comment: string | null
  created_at: string
}

export interface BadgeNomination {
  id: string
  badge_id: string
  nominee_id: string
  nominated_by: string
  reason: string
  status: NominationStatus
  created_at: string
  resolved_at: string | null
  badges: Badge
  badge_nomination_approvals: NominationApproval[]
}

export interface BadgeProduction {
  id: string
  member_badge_id: string
  due_at: string
  claimed_by: string | null
  claimed_at: string | null
  status: ProductionStatus
  completed_at: string | null
  created_at: string
  member_badges: {
    id: string
    profile_id: string
    awarded_at: string
    badges: Badge
  }
}
