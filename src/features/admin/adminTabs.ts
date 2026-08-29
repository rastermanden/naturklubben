/**
 * Fanerne i admin-panelet.
 *
 * Panelet var én lang side med fem sektioner i vilkårlig rækkefølge, hvor
 * "Inviter en e-mail" lå tre sektioner væk fra den liste, den skriver til.
 * Fanerne grupperer i stedet efter opgave, så man kan orientere sig uden at
 * skulle scrolle hele panelet igennem.
 */

export const ADMIN_TAB_PARAM = 'sektion'

export const ADMIN_TABS = [
  {
    id: 'ansoegninger',
    label: 'Ansøgninger',
  },
  { id: 'medlemmer', label: 'Medlemmer' },
  // Badge-kataloget, de åbne nomineringer og produktionen af de fysiske
  // badges. Nomineringer hedder netop ikke "indstillinger" i UI'et --
  // panelet har allerede en fane med det navn i betydningen *settings*.
  { id: 'badges', label: 'Badges' },
  // Indholdet på de offentlige sider. Aktiviteterne kunne før kun ændres
  // med en migration.
  { id: 'aktiviteter', label: 'Aktiviteter' },
  { id: 'adgang', label: 'Adgang' },
  {
    id: 'indstillinger',
    label: 'Indstillinger',
  },
] as const

export type AdminTabId = (typeof ADMIN_TABS)[number]['id']

export const DEFAULT_ADMIN_TAB: AdminTabId = 'ansoegninger'

/**
 * Oversætter `?sektion=`-værdien til en fane. Ukendte og manglende værdier
 * falder tilbage til standardfanen, så et gammelt eller håndredigeret link
 * aldrig efterlader panelet tomt.
 */
export function parseAdminTab(value: string | null): AdminTabId {
  return ADMIN_TABS.some((tab) => tab.id === value)
    ? (value as AdminTabId)
    : DEFAULT_ADMIN_TAB
}

/** DOM-id'er, der binder fane og panel sammen via aria-controls/-labelledby. */
export function adminTabElementId(tabId: AdminTabId) {
  return `admin-tab-${tabId}`
}

export function adminTabPanelId(tabId: AdminTabId) {
  return `admin-panel-${tabId}`
}
