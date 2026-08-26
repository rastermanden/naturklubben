import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import {
  ADMIN_TABS,
  adminTabElementId,
  adminTabPanelId,
  type AdminTabId,
} from './adminTabs'

/**
 * Fanevælgeren i admin-panelet, bygget efter WAI-ARIA's tabs-mønster:
 * kun den valgte fane er i tabulatorrækkefølgen, og piletasterne flytter
 * mellem fanerne. Uden det ville et tastatur skulle igennem hver enkelt fane
 * for at nå ned til indholdet.
 */
export function AdminTabs({
  activeTab,
  onSelect,
  badges,
}: {
  activeTab: AdminTabId
  onSelect: (tab: AdminTabId) => void
  /** Antal ting, der venter på en admin, pr. fane. Nul vises ikke. */
  badges?: Partial<Record<AdminTabId, number>>
}) {
  const tabRefs = useRef(new Map<AdminTabId, HTMLButtonElement>())

  function focusTab(tab: AdminTabId) {
    onSelect(tab)
    tabRefs.current.get(tab)?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const index = ADMIN_TABS.findIndex((tab) => tab.id === activeTab)
    if (index === -1) return

    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault()
        focusTab(ADMIN_TABS[(index + 1) % ADMIN_TABS.length].id)
        break
      case 'ArrowLeft':
        event.preventDefault()
        focusTab(
          ADMIN_TABS[(index - 1 + ADMIN_TABS.length) % ADMIN_TABS.length].id,
        )
        break
      case 'Home':
        event.preventDefault()
        focusTab(ADMIN_TABS[0].id)
        break
      case 'End':
        event.preventDefault()
        focusTab(ADMIN_TABS[ADMIN_TABS.length - 1].id)
        break
    }
  }

  return (
    <div
      role="tablist"
      aria-label="Admin-sektioner"
      className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0"
    >
      {ADMIN_TABS.map((tab) => {
        const selected = tab.id === activeTab
        const badge = badges?.[tab.id] ?? 0

        return (
          <button
            key={tab.id}
            ref={(element) => {
              if (element) tabRefs.current.set(tab.id, element)
              else tabRefs.current.delete(tab.id)
            }}
            type="button"
            role="tab"
            id={adminTabElementId(tab.id)}
            aria-selected={selected}
            aria-controls={adminTabPanelId(tab.id)}
            // Tallet i mærkatet læses ellers bare op som "3" efter fanenavnet.
            aria-label={badge > 0 ? `${tab.label}, ${badge} venter` : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            onKeyDown={handleKeyDown}
            className={
              selected
                ? 'flex min-h-11 shrink-0 items-center gap-2 rounded-t-lg border-b-2 border-green-800 px-4 py-2 font-medium text-green-900'
                : 'flex min-h-11 shrink-0 items-center gap-2 rounded-t-lg border-b-2 border-transparent px-4 py-2 text-green-700 hover:text-green-900'
            }
          >
            {tab.label}
            {badge > 0 && (
              <span
                aria-hidden="true"
                className={
                  selected
                    ? 'rounded-full bg-green-800 px-2 py-0.5 text-xs text-white'
                    : 'rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-900'
                }
              >
                {badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function AdminTabPanel({
  tab,
  activeTab,
  children,
}: {
  tab: AdminTabId
  activeTab: AdminTabId
  children: ReactNode
}) {
  if (tab !== activeTab) return null

  return (
    <div
      role="tabpanel"
      id={adminTabPanelId(tab)}
      aria-labelledby={adminTabElementId(tab)}
      tabIndex={0}
      className="flex flex-col gap-6"
    >
      {children}
    </div>
  )
}
