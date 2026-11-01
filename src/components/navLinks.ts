export interface NavLink {
  to: string
  label: string
  requiresAuth: boolean
  /** Vises kun for brugere med profiles.is_admin. */
  requiresAdmin?: boolean
  /**
   * Andre sider, der hører under punktet og derfor også markerer det som
   * aktivt -- fx Naturlog og Spil, der ligger under Aktiviteter.
   */
  alsoActiveFor?: string[]
}

export const navLinks: NavLink[] = [
  { to: '/', label: 'Forside', requiresAuth: false },
  // Naturlog og Spil har ikke egne menupunkter, men ligger som kort på
  // Aktiviteter -- menuen var for lang til en telefon (#283, #285).
  {
    to: '/aktiviteter',
    label: 'Aktiviteter',
    requiresAuth: false,
    alsoActiveFor: ['/naturlog', '/spil'],
  },
  { to: '/kalender', label: 'Kalender', requiresAuth: true },
  { to: '/billeder', label: 'Billeder', requiresAuth: true },
  { to: '/chat', label: 'Chat', requiresAuth: true },
  { to: '/medlemmer', label: 'Medlemmer', requiresAuth: true },
  { to: '/nyheder', label: 'Nyheder', requiresAuth: true },
  { to: '/profil', label: 'Profil', requiresAuth: true },
  { to: '/admin', label: 'Admin', requiresAuth: true, requiresAdmin: true },
  {
    to: '/admin/chat',
    label: 'Admin-chat',
    requiresAuth: true,
    requiresAdmin: true,
  },
]

/**
 * Om punktet skal vises som aktivt: React Routers egen vurdering (siden selv
 * og dens undersider), eller en af siderne i `alsoActiveFor` med undersider.
 */
export function isNavLinkActive(
  link: NavLink,
  pathname: string,
  routerIsActive: boolean,
): boolean {
  if (routerIsActive) return true
  return (link.alsoActiveFor ?? []).some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  )
}
