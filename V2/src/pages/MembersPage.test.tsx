import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Id } from '../../convex/_generated/dataModel'
import type { AwardedMemberBadge, CatalogBadge } from '../features/badges/types'
import type { Member } from '../features/members/useMembers'

const mocks = vi.hoisted(() => ({
  nominate: vi.fn(),
  currentProfileId: 'profile-self' as Id<'profiles'>,
  members: [] as Member[],
  catalog: [] as CatalogBadge[],
  awarded: [] as AwardedMemberBadge[],
}))

vi.mock('../features/auth/useCurrentProfile', () => ({
  useCurrentProfile: () => ({
    isLoading: false,
    profile: {
      _id: mocks.currentProfileId,
      fullName: 'Mig Selv',
      isAdmin: false,
      chatColor: '#16a34a',
      causes: [],
    },
  }),
}))

vi.mock('../features/members/useMembers', () => ({
  useMembers: () => ({
    members: mocks.members,
    isLoading: false,
  }),
}))

vi.mock('../features/badges/useBadges', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../features/badges/useBadges')>()
  return {
    ...actual,
    useAllMemberBadges: () => mocks.awarded,
    useBadgeCatalog: () => mocks.catalog,
    useBadgeActions: () => ({
      nominate: mocks.nominate,
      vote: vi.fn(),
      claimProduction: vi.fn(),
      completeProduction: vi.fn(),
    }),
  }
})

import MembersPage from './MembersPage'

const selfMember: Member = {
  _id: 'profile-self' as Id<'profiles'>,
  fullName: 'Mig Selv',
  causes: [],
  chatColor: '#16a34a',
  isAdmin: false,
  createdAt: 1000,
}

const otherMember: Member = {
  _id: 'profile-other' as Id<'profiles'>,
  fullName: 'Andet Medlem',
  causes: [],
  chatColor: '#2563eb',
  isAdmin: false,
  createdAt: 2000,
}

const catalogBadge: CatalogBadge = {
  _id: 'badge-1' as Id<'badges'>,
  slug: 'skovmaerke',
  name: 'Skovmærke',
  description: 'Til den, der hjælper på ture.',
  imageStorageId: 'storage-1' as Id<'_storage'>,
  imageUrl: 'https://example.test/skovmaerke.png',
  imageWidth: 1200,
  imageHeight: 1200,
  imageMimeType: 'image/png',
  cropX: 0,
  cropY: 0,
  cropSize: 1200,
  diameterMm: 58,
  bleedMm: 5,
  printStatus: 'ready',
  printAttempts: 1,
  isActive: true,
  createdAt: 1000,
  updatedAt: 1000,
  awardedCount: 1,
}

const awardedBadge: AwardedMemberBadge = {
  _id: 'mb-1' as Id<'memberBadges'>,
  badgeId: catalogBadge._id,
  badgeName: catalogBadge.name,
  badgeSlug: catalogBadge.slug,
  badgeDescription: catalogBadge.description,
  profileId: otherMember._id,
  profileName: 'Andet Medlem',
  nominatedById: selfMember._id,
  nominatedByName: 'Mig Selv',
  reason: 'Bar brændet hele vejen.',
  awardedAt: new Date('2026-09-01T12:00:00.000Z').getTime(),
  imageUrl: catalogBadge.imageUrl,
  imageWidth: 1200,
  imageHeight: 1200,
  cropX: 0,
  cropY: 0,
  cropSize: 1200,
}

beforeEach(() => {
  mocks.members = [selfMember, otherMember]
  mocks.catalog = [catalogBadge]
  mocks.awarded = [awardedBadge]
  mocks.nominate.mockReset()
  mocks.nominate.mockResolvedValue('nom-1')
})

afterEach(cleanup)

describe('MembersPage badges og indstilling', () => {
  it('viser tildelte badges og kun «Indstil til en badge» på andre medlemmers kort', () => {
    render(<MembersPage />)

    const items = screen.getAllByRole('listitem')
    const selfCard = items.find((item) =>
      item.textContent?.includes('Mig Selv'),
    )!
    const otherCard = items.find((item) =>
      item.textContent?.includes('Andet Medlem'),
    )!

    expect(
      within(selfCard).queryByRole('button', { name: 'Indstil til en badge' }),
    ).toBeNull()
    expect(
      within(otherCard).getByRole('button', { name: 'Indstil til en badge' }),
    ).toBeTruthy()
    expect(
      within(otherCard).getByRole('button', {
        name: 'Se detaljer om Skovmærke',
      }),
    ).toBeTruthy()
  })

  it('åbner indstillingsdialogen, sender indstilling og viser kvittering', async () => {
    render(<MembersPage />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Indstil til en badge' }),
    )

    const dialog = screen.getByRole('dialog', {
      name: 'Indstil Andet Medlem til en badge',
    })
    expect(dialog).toBeTruthy()

    fireEvent.change(within(dialog).getByLabelText('Begrundelse'), {
      target: { value: 'Lavede varm suppe til hele holdet.' },
    })
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Send indstilling' }),
    )

    expect(mocks.nominate).toHaveBeenCalledWith({
      badgeId: catalogBadge._id,
      nomineeId: otherMember._id,
      reason: 'Lavede varm suppe til hele holdet.',
    })
    expect((await screen.findByRole('status')).textContent).toBe(
      'Indstillingen til Skovmærke er sendt. To administratorer skal godkende den.',
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('lukker dialogen ved «Annullér» uden at sende en indstilling', () => {
    render(<MembersPage />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Indstil til en badge' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Annullér' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mocks.nominate).not.toHaveBeenCalled()
  })

  it('deaktiverer indsendelse når der ingen aktive badges er', () => {
    mocks.catalog = []
    render(<MembersPage />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Indstil til en badge' }),
    )

    expect(
      screen.getByText('Der er ingen aktive badges at indstille til lige nu.'),
    ).toBeTruthy()
    const submit = screen.getByRole('button', {
      name: 'Send indstilling',
    }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
  })
})
