export interface NavLink {
  to: string
  label: string
  requiresAuth: boolean
}

export const navLinks: NavLink[] = [
  { to: '/', label: 'Forside', requiresAuth: false },
  { to: '/aktiviteter', label: 'Aktiviteter', requiresAuth: false },
  { to: '/kalender', label: 'Kalender', requiresAuth: true },
  { to: '/billeder', label: 'Billeder', requiresAuth: true },
  { to: '/chat', label: 'Chat', requiresAuth: true },
  { to: '/profil', label: 'Profil', requiresAuth: true },
]
