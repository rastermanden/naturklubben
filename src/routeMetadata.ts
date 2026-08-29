export interface RouteMetadata {
  path: string
  documentTitle: string
  announcement: string
}

export const routeMetadata = [
  {
    path: '/',
    documentTitle: 'Naturklubben',
    announcement: 'Forside indlæst',
  },
  {
    path: '/aktiviteter',
    documentTitle: 'Aktiviteter | Naturklubben',
    announcement: 'Aktiviteter indlæst',
  },
  {
    path: '/datapolitik',
    documentTitle: 'Datapolitik | Naturklubben',
    announcement: 'Datapolitik indlæst',
  },
  {
    path: '/konto-slettet',
    documentTitle: 'Konto slettet | Naturklubben',
    announcement: 'Konto slettet indlæst',
  },
  {
    path: '/login',
    documentTitle: 'Log ind | Naturklubben',
    announcement: 'Log ind indlæst',
  },
  {
    path: '/proevemedlemskab',
    documentTitle: 'Prøvemedlemskab | Naturklubben',
    announcement: 'Prøvemedlemskab indlæst',
  },
  {
    path: '/opret',
    documentTitle: 'Opret bruger | Naturklubben',
    announcement: 'Opret bruger indlæst',
  },
  {
    path: '/glemt-adgangskode',
    documentTitle: 'Glemt adgangskode | Naturklubben',
    announcement: 'Glemt adgangskode indlæst',
  },
  {
    path: '/velkommen',
    documentTitle: 'Velkommen | Naturklubben',
    announcement: 'Velkommen indlæst',
  },
  {
    path: '/ny-adgangskode',
    documentTitle: 'Ny adgangskode | Naturklubben',
    announcement: 'Ny adgangskode indlæst',
  },
  {
    path: '/kalender',
    documentTitle: 'Kalender | Naturklubben',
    announcement: 'Kalender indlæst',
  },
  {
    path: '/billeder',
    documentTitle: 'Billeder | Naturklubben',
    announcement: 'Billeder indlæst',
  },
  {
    path: '/chat',
    documentTitle: 'Chat | Naturklubben',
    announcement: 'Chat indlæst',
  },
  {
    path: '/medlemmer',
    documentTitle: 'Medlemmer | Naturklubben',
    announcement: 'Medlemmer indlæst',
  },
  {
    path: '/nyheder',
    documentTitle: 'Nyheder | Naturklubben',
    announcement: 'Nyheder indlæst',
  },
  {
    path: '/admin',
    documentTitle: 'Admin | Naturklubben',
    announcement: 'Admin indlæst',
  },
  {
    path: '/profil',
    documentTitle: 'Min profil | Naturklubben',
    announcement: 'Min profil indlæst',
  },
] as const satisfies readonly RouteMetadata[]

export type AppRoutePath = (typeof routeMetadata)[number]['path']
