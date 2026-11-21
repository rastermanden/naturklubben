import type { Id } from '../../../convex/_generated/dataModel'

export type BadgePrintStatus = 'pending' | 'rendering' | 'ready' | 'failed'

export type BadgeImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp'

/** De felter, en rund badge-visning har brug for. */
export interface BadgeArtwork {
  name: string
  imageUrl: string | null
  imageWidth: number
  imageHeight: number
  cropX: number
  cropY: number
  cropSize: number
}

export interface CatalogBadge extends BadgeArtwork {
  _id: Id<'badges'>
  slug: string
  description?: string
  imageStorageId: Id<'_storage'>
  imageMimeType: BadgeImageMimeType
  diameterMm: number
  bleedMm: number
  printStatus: BadgePrintStatus
  printAttempts: number
  isActive: boolean
  createdAt: number
  updatedAt: number
  awardedCount: number
}

export interface AdminBadge extends CatalogBadge {
  printStorageId?: Id<'_storage'>
  printUrl: string | null
  printError?: string
  printStartedAt?: number
  printCompletedAt?: number
}

export interface AwardedMemberBadge {
  _id: Id<'memberBadges'>
  badgeId: Id<'badges'>
  badgeName: string
  badgeSlug: string
  badgeDescription?: string
  profileId: Id<'profiles'>
  profileName: string
  nominationId?: Id<'badgeNominations'>
  nominatedById?: Id<'profiles'>
  nominatedByName?: string
  reason?: string
  awardedAt: number
  imageUrl: string | null
  imageWidth: number
  imageHeight: number
  cropX: number
  cropY: number
  cropSize: number
}
