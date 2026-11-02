import { useMutation, useQuery } from 'convex/react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { ActivitiesSection } from '../features/activities/ActivitiesSection'
import { AllowedEmailsSection } from '../features/admin/AllowedEmailsSection'
import { DatePollsSection } from '../features/datePolls/DatePollsSection'
import { AdminTabPanel, AdminTabs } from '../features/admin/AdminTabs'
import {
  adminTabPath,
  parseAdminTab,
  type AdminTabId,
} from '../features/admin/adminTabs'
import { BadgeAdminSection } from '../features/badges/BadgeAdminSection'
import { useCurrentProfile } from '../features/auth/useCurrentProfile'
import { AdminSection } from '../features/members/AdminSection'
import { AdminRolesSection } from '../features/members/AdminRolesSection'
import { NotificationToggle } from '../features/notifications/NotificationToggle'
import { NotificationTypePreferences } from '../features/notifications/NotificationTypePreferences'

function formatAdminDate(timestamp: number) {
  return new Intl.DateTimeFormat('da-DK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(timestamp))
}

function ApplicationsSection() {
  const applications = useQuery(api.probation.list, { status: 'pending' })
  const approve = useMutation(api.probation.approve)
  const reject = useMutation(api.probation.reject)

  return (
    <AdminSection
      title="Ansøgninger om prøvemedlemskab"
      description="Godkender du en ansøgning, får ansøgeren besked og kan oprette en bruger."
      count={applications?.length}
    >
      {applications === undefined && (
        <p className="text-sm text-ink-subtle">Henter ansøgninger…</p>
      )}
      {applications?.length === 0 && (
        <p className="text-sm text-ink-subtle">
          Der ligger ingen åbne ansøgninger lige nu.
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {(applications ?? []).map((application) => (
          <li
            key={application.id}
            className="flex flex-col gap-3 rounded-lg border border-line px-4 py-3"
          >
            <div className="space-y-1">
              <p className="text-ink">{application.fullName}</p>
              <p className="text-sm text-ink-muted">{application.email}</p>
              <p className="text-sm text-ink-subtle">
                Ansøgt {formatAdminDate(application.createdAt)}
              </p>
              <p className="text-sm whitespace-pre-wrap text-ink-body">
                {application.motivation}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  void approve({
                    applicationId:
                      application.id as Id<'probationApplications'>,
                  })
                }
                className="min-h-11 rounded-lg bg-accent px-4 py-2 text-white"
              >
                Godkend
              </button>
              <button
                type="button"
                onClick={() =>
                  void reject({
                    applicationId:
                      application.id as Id<'probationApplications'>,
                  })
                }
                className="min-h-11 rounded-lg border border-danger-line px-4 py-2 text-danger-strong"
              >
                Afvis
              </button>
            </div>
          </li>
        ))}
      </ul>
    </AdminSection>
  )
}

export default function AdminPage() {
  const { profile } = useCurrentProfile()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = parseAdminTab(searchParams.get('sektion'))

  function selectTab(tab: AdminTabId) {
    setSearchParams(new URLSearchParams(adminTabPath(tab).split('?')[1]))
  }

  if (!profile) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 sm:p-6">
        <h1 className="text-2xl font-semibold text-ink-body">Admin</h1>
        <p role="status" className="text-ink-subtle">
          Henter din profil…
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-body">Admin</h1>
        <p className="text-ink-subtle">
          Her administrerer du medlemmer, adminroller, badges, ansøgninger,
          klubbens aktiviteter, datoafstemninger og hvem der må oprette en
          bruger i Naturklubben.
        </p>
      </div>

      <AdminTabs activeTab={activeTab} onSelect={selectTab} />

      <AdminTabPanel tab="ansoegninger" activeTab={activeTab}>
        <ApplicationsSection />
      </AdminTabPanel>
      <AdminTabPanel tab="medlemmer" activeTab={activeTab}>
        <AdminRolesSection currentUserId={profile._id} />
      </AdminTabPanel>
      <AdminTabPanel tab="badges" activeTab={activeTab}>
        <BadgeAdminSection />
      </AdminTabPanel>
      <AdminTabPanel tab="aktiviteter" activeTab={activeTab}>
        <ActivitiesSection />
      </AdminTabPanel>
      <AdminTabPanel tab="datoer" activeTab={activeTab}>
        <DatePollsSection adminId={profile._id} />
      </AdminTabPanel>
      <AdminTabPanel tab="adgang" activeTab={activeTab}>
        <AllowedEmailsSection />
      </AdminTabPanel>
      <AdminTabPanel tab="indstillinger" activeTab={activeTab}>
        <AdminSection
          title="Admin-notifikationer"
          description="Slå dem til på mindst én administrators enhed for at få besked om nye ansøgninger."
        >
          <NotificationToggle />
        </AdminSection>
        <AdminSection
          title="Chatnotifikationer"
          description="Vælg hvor meget chatten må sende til dine enheder. Valget er dit eget og følger dig på tværs af telefon og computer."
        >
          <NotificationTypePreferences isAdmin={profile.isAdmin === true} />
        </AdminSection>
      </AdminTabPanel>
    </main>
  )
}
