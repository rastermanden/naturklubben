import type { ReactNode } from 'react'
import type { ActivityIconId } from './activityIcons'

const leafPaths = (
  <>
    <path d="M12 22V10" />
    <path d="M12 13C7 13 4 10 4 5c5 0 8 3 8 8Z" />
    <path d="M12 17c0-4 3-7 8-7 0 5-3 7-8 7Z" />
  </>
)

// Typen kommer fra ACTIVITY_ICONS: tilføjer nogen et ikon til listen uden at
// tegne det, fejler oversættelsen her i stedet for at vise et tomt felt.
const iconPaths: Record<ActivityIconId, ReactNode> = {
  leaf: leafPaths,
  footprints: (
    <>
      <path d="M4 16.5c1.3-1.8 3.1-2.8 4.7-2.1 1.7.7 2.1 3 1.1 5.2-.8 1.8-2.8 2.8-4.4 2.1-1.7-.7-2.4-3.2-1.4-5.2Z" />
      <path d="M14.2 4.4c1-2.2 3.1-3.2 4.8-2.4 1.6.7 2.2 3.1 1.3 5.2-1 2.2-3.1 3.2-4.8 2.4-1.6-.7-2.2-3.1-1.3-5.2Z" />
      <path d="M12.5 11.5c1.3 1.1 2.2 2.5 2.7 4.3" />
      <path d="M11.5 9.5c-.5-.8-1.2-1.6-2-2.3" />
    </>
  ),
  binoculars: (
    <>
      <path d="m7 7-2 9" />
      <path d="m17 7 2 9" />
      <path d="M5 16h14" />
      <path d="M8 7h8l1 9H7L8 7Z" />
      <circle cx="5" cy="17" r="3" />
      <circle cx="19" cy="17" r="3" />
      <path d="m9 7 1-3h4l1 3" />
    </>
  ),
  'trash-2': (
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="m19 6-1 15H6L5 6" />
      <path d="M10 11v5M14 11v5" />
    </>
  ),
}

export function ActivityIcon({
  name,
  size = 'md',
}: {
  name: string | null
  /** `sm` bruges i admin-listen, hvor ikonet står ved siden af en titel. */
  size?: 'sm' | 'md'
}) {
  const paths = (name && iconPaths[name as ActivityIconId]) || leafPaths
  const box = size === 'sm' ? 'h-9 w-9' : 'h-12 w-12'
  const glyph = size === 'sm' ? 20 : 26

  return (
    <span
      className={`flex ${box} shrink-0 items-center justify-center rounded-full bg-green-100 text-green-800`}
    >
      <svg
        viewBox="0 0 24 24"
        width={glyph}
        height={glyph}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {paths}
      </svg>
    </span>
  )
}
