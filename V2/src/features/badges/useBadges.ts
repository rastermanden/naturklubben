import { useCallback, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { errorCode } from '../auth/authErrors'
import { BadgeUserFacingError } from './badgeErrors'
import { renderBadgePrintFile } from './renderBadgePrint'
import type {
  AdminBadge,
  AwardedMemberBadge,
  BadgeImageMimeType,
  CatalogBadge,
} from './types'

export { BadgeUserFacingError }

export const MAX_BADGE_IMAGE_SIZE = 10 * 1024 * 1024

export const BADGE_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const

export interface BadgeImageUpload {
  file: File
  width: number
  height: number
}

export interface BadgeFormValues {
  name: string
  slug: string
  description: string
  cropX: number
  cropY: number
  cropSize: number
  diameterMm: number
  bleedMm: number
  isActive: boolean
}

export interface SaveBadgeInput {
  badgeId?: Id<'badges'>
  values: BadgeFormValues
  image?: BadgeImageUpload
}

export interface PrintRenderResult {
  status: 'ready' | 'rendering' | 'superseded'
  printUrl: string | null
}

/**
 * Badges i klienten. Al autorisation og domæneregler ligger i
 * `convex/badges.ts`; her hentes og sendes bare.
 */
export function useBadgeCatalog(): CatalogBadge[] | undefined {
  return useQuery(api.badges.catalog) as CatalogBadge[] | undefined
}

export function useAdminBadgeCatalog(): AdminBadge[] | undefined {
  return useQuery(api.badges.adminCatalog) as AdminBadge[] | undefined
}

export function useMyBadges(): AwardedMemberBadge[] | undefined {
  return useQuery(api.badges.myBadges) as AwardedMemberBadge[] | undefined
}

export function useAllMemberBadges(): AwardedMemberBadge[] | undefined {
  return useQuery(api.badges.allMemberBadges) as
    AwardedMemberBadge[] | undefined
}

/** En andens badgevitrine. */
export function useBadgesFor(
  profileId: Id<'profiles'>,
): AwardedMemberBadge[] | undefined {
  return useQuery(api.badges.memberBadgesFor, { profileId }) as
    AwardedMemberBadge[] | undefined
}

/** Grupperer tildelingerne pr. medlem, nyeste først. */
export function groupBadgesByMember(
  badges: AwardedMemberBadge[] | undefined,
): Map<Id<'profiles'>, AwardedMemberBadge[]> {
  const byMember = new Map<Id<'profiles'>, AwardedMemberBadge[]>()
  for (const badge of badges ?? []) {
    const existing = byMember.get(badge.profileId)
    if (existing) existing.push(badge)
    else byMember.set(badge.profileId, [badge])
  }
  return byMember
}

export function useMyNominations() {
  return useQuery(api.badges.myNominations)
}

export function usePendingNominations() {
  return useQuery(api.badges.pendingNominations)
}

export function useOpenProductions() {
  return useQuery(api.badges.openProductions)
}

export function useNomineeCandidates() {
  return useQuery(api.badges.nomineeCandidates)
}

export function useBadgeActions() {
  const nominate = useMutation(api.badges.nominate)
  const vote = useMutation(api.badges.vote)
  const claimProduction = useMutation(api.badges.claimProduction)
  const completeProduction = useMutation(api.badges.completeProduction)
  return { nominate, vote, claimProduction, completeProduction }
}

async function uploadBlobToStorage(
  uploadUrl: string,
  blob: Blob,
  contentType: string,
  errorMessage: string,
): Promise<Id<'_storage'>> {
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: blob,
  })
  if (!response.ok) {
    throw new BadgeUserFacingError(errorMessage)
  }
  const payload = (await response.json()) as { storageId?: unknown }
  if (typeof payload.storageId !== 'string' || payload.storageId.length === 0) {
    throw new BadgeUserFacingError(errorMessage)
  }
  return payload.storageId as Id<'_storage'>
}

/**
 * Starter eller gentager en trykrendering for et badge. Tegner PNG'en i
 * browseren ud fra den samme geometri som V1 og gemmer den i Convex storage.
 */
export function useRenderBadgePrint() {
  const startPrintRender = useMutation(api.badges.startPrintRender)
  const finishPrintRender = useMutation(api.badges.finishPrintRender)
  const [pendingCount, setPendingCount] = useState(0)

  const renderPrint = useCallback(
    async (
      badgeId: Id<'badges'>,
      sourceFile?: Blob,
    ): Promise<PrintRenderResult> => {
      setPendingCount((count) => count + 1)
      try {
        const claimed = await startPrintRender({ badgeId })
        if (claimed.status === 'rendering') {
          return { status: 'rendering', printUrl: claimed.printUrl }
        }
        if (claimed.status === 'failed') {
          throw new BadgeUserFacingError(claimed.error)
        }

        let reportedFailure = false
        try {
          let sourceBlob = sourceFile
          if (!sourceBlob) {
            const response = await fetch(claimed.imageUrl)
            if (!response.ok) {
              throw new BadgeUserFacingError(
                'Billedfilen mangler eller kunne ikke læses. Upload billedet igen.',
              )
            }
            sourceBlob = await response.blob()
          }

          const printBlob = await renderBadgePrintFile(sourceBlob, {
            cropX: claimed.cropX,
            cropY: claimed.cropY,
            cropSize: claimed.cropSize,
            diameterMm: claimed.diameterMm,
            bleedMm: claimed.bleedMm,
          })

          const printStorageId = await uploadBlobToStorage(
            claimed.uploadUrl,
            printBlob,
            'image/png',
            'Trykfilen kunne ikke gemmes. Prøv igen.',
          )

          const finished = await finishPrintRender({
            badgeId,
            expectedAttempt: claimed.attempt,
            succeeded: true,
            printStorageId,
          })
          if (finished.status === 'failed') {
            reportedFailure = true
            throw new BadgeUserFacingError(finished.error)
          }
          if (finished.status === 'superseded') {
            return { status: 'superseded', printUrl: null }
          }
          return { status: 'ready', printUrl: finished.printUrl }
        } catch (renderError) {
          if (!reportedFailure) {
            const publicMessage =
              renderError instanceof BadgeUserFacingError
                ? renderError.message
                : 'Trykfilen kunne ikke laves. Prøv igen.'
            await finishPrintRender({
              badgeId,
              expectedAttempt: claimed.attempt,
              succeeded: false,
              error: publicMessage,
            }).catch(() => undefined)
          }
          throw renderError
        }
      } finally {
        setPendingCount((count) => Math.max(0, count - 1))
      }
    },
    [finishPrintRender, startPrintRender],
  )

  return { renderPrint, isPending: pendingCount > 0 }
}

/**
 * Opretter eller retter en badge og starter generering af trykfilen i
 * baggrunden, præcis som V1.
 */
export function useSaveBadge() {
  const generateImageUploadUrl = useMutation(api.badges.generateImageUploadUrl)
  const createBadge = useMutation(api.badges.createBadge)
  const updateBadge = useMutation(api.badges.updateBadge)
  const { renderPrint } = useRenderBadgePrint()
  const [isPending, setIsPending] = useState(false)

  const saveBadge = useCallback(
    async ({ badgeId, values, image }: SaveBadgeInput) => {
      if (!badgeId && !image) {
        throw new Error('badge_image_required')
      }

      setIsPending(true)
      try {
        let uploaded:
          | {
              storageId: Id<'_storage'>
              width: number
              height: number
              mimeType: BadgeImageMimeType
            }
          | undefined

        if (image) {
          const { uploadUrl } = await generateImageUploadUrl({})
          const storageId = await uploadBlobToStorage(
            uploadUrl,
            image.file,
            image.file.type,
            'Billedet kunne ikke gemmes. Prøv igen.',
          )
          uploaded = {
            storageId,
            width: image.width,
            height: image.height,
            mimeType: image.file.type as BadgeImageMimeType,
          }
        }

        let savedId: Id<'badges'>
        if (badgeId) {
          await updateBadge({
            badgeId,
            slug: values.slug,
            name: values.name.trim(),
            description: values.description.trim(),
            ...(uploaded
              ? {
                  imageStorageId: uploaded.storageId,
                  imageWidth: uploaded.width,
                  imageHeight: uploaded.height,
                  imageMimeType: uploaded.mimeType,
                }
              : {}),
            cropX: values.cropX,
            cropY: values.cropY,
            cropSize: values.cropSize,
            diameterMm: values.diameterMm,
            bleedMm: values.bleedMm,
            isActive: values.isActive,
          })
          savedId = badgeId
        } else {
          savedId = await createBadge({
            slug: values.slug,
            name: values.name.trim(),
            description: values.description.trim() || undefined,
            imageStorageId: uploaded!.storageId,
            imageWidth: uploaded!.width,
            imageHeight: uploaded!.height,
            imageMimeType: uploaded!.mimeType,
            cropX: values.cropX,
            cropY: values.cropY,
            cropSize: values.cropSize,
            diameterMm: values.diameterMm,
            bleedMm: values.bleedMm,
            isActive: values.isActive,
          })
        }

        void renderPrint(savedId, image?.file).catch((renderError: unknown) => {
          console.error('Trykfilen kunne ikke genereres', renderError)
        })

        return { id: savedId, renderStarted: true }
      } finally {
        setIsPending(false)
      }
    },
    [createBadge, generateImageUploadUrl, renderPrint, updateBadge],
  )

  return { saveBadge, isPending }
}

/** Slår "Kan indstilles til" til eller fra på en badge. */
export function useSetBadgeActive() {
  const updateBadge = useMutation(api.badges.updateBadge)
  const [isPending, setIsPending] = useState(false)

  const setActive = useCallback(
    async ({
      badgeId,
      isActive,
    }: {
      badgeId: Id<'badges'>
      isActive: boolean
    }) => {
      setIsPending(true)
      try {
        await updateBadge({ badgeId, isActive })
      } finally {
        setIsPending(false)
      }
    },
    [updateBadge],
  )

  return { setActive, isPending }
}

/**
 * Fejlkoderne fra `convex/badges.ts` på dansk. Convex pakker serverfejlen ind
 * i `ConvexError.data` eller i tekst med kode og request-id, så der matches
 * på begge.
 */
const MESSAGES: [code: string, message: string][] = [
  ['NOT_A_MEMBER', 'Du er ikke medlem af klubben endnu.'],
  ['NOT_ADMIN', 'Du har ikke rettigheder til det her længere. Opdatér siden.'],
  [
    'ACCOUNT_DELETION_RESERVED',
    'Din konto er ved at blive slettet, så den kan ikke ændres.',
  ],
  ['BADGE_SELF_NOMINATION', 'Du kan ikke indstille dig selv til en badge.'],
  ['BADGE_REASON_REQUIRED', 'Skriv en kort begrundelse for indstillingen.'],
  ['BADGE_REASON_TOO_LONG', 'Begrundelsen er for lang (højst 2000 tegn).'],
  [
    'BADGE_ALREADY_PENDING',
    'Der ligger allerede en åben indstilling af medlemmet til den badge.',
  ],
  ['BADGE_ALREADY_AWARDED', 'Medlemmet har allerede den badge.'],
  ['BADGE_INACTIVE', 'Badgen kan ikke længere indstilles til.'],
  [
    'BADGE_NOT_FOUND',
    'Badgen eller medlemmet findes ikke længere. Opdatér siden.',
  ],
  [
    'BADGE_NOMINEE_NOT_FOUND',
    'Badgen eller medlemmet findes ikke længere. Opdatér siden.',
  ],
  [
    'BADGE_NOMINATE_RATE_LIMITED',
    'Du har indstillet mange på kort tid. Prøv igen om lidt.',
  ],
  [
    'BADGE_VOTE_NOMINATOR',
    'Du har selv lavet indstillingen og kan derfor ikke være en af de to godkendere.',
  ],
  ['BADGE_VOTE_ALREADY_VOTED', 'Du har allerede stemt om den indstilling.'],
  [
    'BADGE_VOTE_ALREADY_RESOLVED',
    'Indstillingen er allerede afgjort. Opdatér siden.',
  ],
  [
    'BADGE_NOMINATION_NOT_FOUND',
    'Indstillingen findes ikke længere. Opdatér siden.',
  ],
  ['BADGE_COMMENT_TOO_LONG', 'Kommentaren er for lang (højst 2000 tegn).'],
  [
    'BADGE_PRODUCTION_CLAIMED_BY_OTHER',
    'En anden administrator har allerede taget opgaven.',
  ],
  ['BADGE_PRODUCTION_ALREADY_DONE', 'Opgaven er allerede markeret som færdig.'],
  [
    'BADGE_PRODUCTION_NOT_FOUND',
    'Produktionsopgaven findes ikke længere. Opdatér siden.',
  ],
  [
    'BADGE_DELETE_AWARDED',
    'Badgen er tildelt mindst ét medlem og kan derfor ikke slettes. Deaktivér den i stedet.',
  ],
  [
    'BADGE_SLUG_TAKEN',
    'Der findes allerede en badge med det navn eller den slug.',
  ],
  ['BADGE_SLUG_INVALID', 'Slug må kun indeholde a-z, 0-9 og bindestreg.'],
  ['BADGE_NAME_REQUIRED', 'Badgen skal have et navn.'],
  ['BADGE_NAME_TOO_LONG', 'Navnet er for langt (højst 80 tegn).'],
  ['BADGE_DESCRIPTION_TOO_LONG', 'Beskrivelsen er for lang (højst 2000 tegn).'],
  [
    'BADGE_CROP_INVALID',
    'Værdierne kunne ikke gemmes. Tjek felterne og prøv igen.',
  ],
  [
    'BADGE_CROP_OUTSIDE_IMAGE',
    'Værdierne kunne ikke gemmes. Tjek felterne og prøv igen.',
  ],
  [
    'BADGE_IMAGE_SIZE_INVALID',
    'Værdierne kunne ikke gemmes. Tjek felterne og prøv igen.',
  ],
  [
    'BADGE_IMAGE_INCOMPLETE',
    'Værdierne kunne ikke gemmes. Tjek felterne og prøv igen.',
  ],
  ['BADGE_DIAMETER_INVALID', 'Diameteren skal være mellem 10 og 200 mm.'],
  ['BADGE_BLEED_INVALID', 'Beskæringsmarginen skal være mellem 0 og 20 mm.'],
  ['BADGE_IMAGE_NOT_FOUND', 'Billedet kunne ikke gemmes. Prøv igen.'],
  ['BADGE_IMAGE_TYPE_INVALID', 'Badgebilledet skal være PNG, JPEG eller WebP.'],
  ['BADGE_IMAGE_TOO_LARGE', 'Billedet er for stort (maks. 10 MB).'],
  [
    'badge_image_required',
    'Vælg et billede. En badge uden billede kan ikke produceres.',
  ],
]

export function badgeErrorMessage(error: unknown): string {
  if (error instanceof BadgeUserFacingError) return error.message

  const raw = errorCode(error) ?? ''
  const fallbackMessage = error instanceof Error ? error.message : ''
  const haystack = `${raw}\n${fallbackMessage}`

  for (const [code, text] of MESSAGES) {
    if (haystack.includes(code)) return text
  }
  return 'Handlingen kunne ikke gennemføres. Prøv igen om lidt.'
}
