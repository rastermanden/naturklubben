import { useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'
import {
  toFriendlyAllowedEmailError,
  useAllowedEmails,
} from '../features/admin/useAllowedEmails'
import {
  toFriendlyProbationApplicationError,
  type NotificationDelivery,
  useProbationApplications,
} from '../features/probation/useProbationApplications'
import { ChatNotificationPreference } from '../features/notifications/ChatNotificationPreference'
import { NotificationToggle } from '../features/notifications/NotificationToggle'
import { ActivitiesSection } from '../features/activities/ActivitiesSection'
import { AdminRolesSection } from '../features/admin/AdminRolesSection'
import { AdminSection } from '../features/admin/AdminSection'
import { AdminTabPanel, AdminTabs } from '../features/admin/AdminTabs'
import { AllowedEmailsSection } from '../features/admin/AllowedEmailsSection'
import { ProbationApplicationsSection } from '../features/admin/ProbationApplicationsSection'
import {
  ADMIN_TAB_PARAM,
  parseAdminTab,
  type AdminTabId,
} from '../features/admin/adminTabs'
import { BadgeCatalogSection } from '../features/badges/BadgeCatalogSection'
import { BadgeNominationsSection } from '../features/badges/BadgeNominationsSection'
import { BadgeProductionsSection } from '../features/badges/BadgeProductionsSection'
import { useBadgeNominations } from '../features/badges/useBadgeNominations'
import { useErrorFocus } from '../hooks/useErrorFocus'

function AdminPage() {
  const { session } = useAuth()
  const userId = session!.user.id
  const { allowedEmailsQuery, addEmail, removeEmail } = useAllowedEmails(userId)
  const {
    applicationsQuery,
    approveApplication,
    rejectApplication,
    retryNotification,
  } = useProbationApplications()
  // Kun til tallet på fanen. Sektionen bruger samme query-nøgle, så det
  // koster ikke et ekstra kald.
  const nominationsQuery = useBadgeNominations()

  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = parseAdminTab(searchParams.get(ADMIN_TAB_PARAM))

  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteEmailInvalid, setInviteEmailInvalid] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const focusInviteError = useErrorFocus(emailRef)

  // Fanen ligger i URL'en, så et genindlæst eller delt admin-link lander samme
  // sted. `replace` holder browserens tilbage-knap ude af fanevalget.
  function selectTab(tab: AdminTabId) {
    const next = new URLSearchParams(searchParams)
    next.set(ADMIN_TAB_PARAM, tab)
    setSearchParams(next, { replace: true })
  }

  function resetMessages() {
    setActionError(null)
    setInviteError(null)
    setInviteEmailInvalid(false)
    setSuccessMsg(null)
  }

  function showDeliveryFailure(
    delivery: NotificationDelivery,
    savedMessage: string,
  ) {
    setSuccessMsg(savedMessage)
    if (delivery.status === 'failed') {
      setActionError(
        delivery.error ??
          'Beslutningen er gemt, men notifikationen kunne ikke leveres. Prøv igen fra kortet.',
      )
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    resetMessages()

    const trimmed = email.trim().toLowerCase()
    if (!trimmed) return

    try {
      await addEmail.mutateAsync({ email: trimmed, note })
      setEmail('')
      setNote('')
      setSuccessMsg(`${trimmed} kan nu oprette en bruger.`)
    } catch (mutationError) {
      const duplicate =
        typeof mutationError === 'object' &&
        mutationError !== null &&
        'code' in mutationError &&
        String(mutationError.code) === '23505'
      setInviteError(toFriendlyAllowedEmailError(mutationError))
      setInviteEmailInvalid(duplicate)
      if (duplicate) focusInviteError()
    }
  }

  async function handleRemove(emailToRemove: string) {
    if (
      !window.confirm(
        `Fjern ${emailToRemove} fra listen?\n\nAdressen kan så ikke længere bruges til at oprette en ny bruger. En bruger, der allerede er oprettet, bliver ikke slettet.`,
      )
    ) {
      return
    }

    resetMessages()
    try {
      await removeEmail.mutateAsync(emailToRemove)
      setSuccessMsg(`${emailToRemove} er fjernet fra listen.`)
    } catch (mutationError) {
      setActionError(toFriendlyAllowedEmailError(mutationError))
    }
  }

  async function handleApprove(applicationId: number, applicantEmail: string) {
    resetMessages()

    try {
      const delivery = await approveApplication.mutateAsync(applicationId)
      showDeliveryFailure(
        delivery,
        `${applicantEmail} er godkendt og kan nu oprette en bruger.`,
      )
    } catch (mutationError) {
      setActionError(toFriendlyProbationApplicationError(mutationError))
    }
  }

  async function handleReject(applicationId: number, applicantEmail: string) {
    if (
      !window.confirm(
        `Afvis ansøgningen fra ${applicantEmail}?\n\nAnsøgningen fjernes fra admin-listen, men personen kan sende en ny ansøgning senere.`,
      )
    ) {
      return
    }

    resetMessages()

    try {
      const delivery = await rejectApplication.mutateAsync(applicationId)
      showDeliveryFailure(
        delivery,
        `Ansøgningen fra ${applicantEmail} er afvist.`,
      )
    } catch (mutationError) {
      setActionError(toFriendlyProbationApplicationError(mutationError))
    }
  }

  async function handleRetryNotification(
    applicationId: number,
    kind: 'admin' | 'decision',
  ) {
    resetMessages()
    try {
      const delivery = await retryNotification.mutateAsync({
        applicationId,
        kind,
      })
      if (delivery.status === 'sent') {
        setSuccessMsg('Notifikationen blev leveret.')
      } else {
        setActionError(
          delivery.error ?? 'Notifikationen kunne ikke leveres. Prøv igen.',
        )
      }
    } catch (mutationError) {
      setActionError(toFriendlyProbationApplicationError(mutationError))
    }
  }

  const emails = allowedEmailsQuery.data ?? []
  const applications = applicationsQuery.data ?? []
  const handlingApplication =
    approveApplication.isPending || rejectApplication.isPending
  const retryingNotification = retryNotification.isPending

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-green-900">Admin</h1>
        <p className="text-green-700">
          Her administrerer du medlemmer, adminroller, badges, ansøgninger,
          klubbens aktiviteter og hvem der må oprette en bruger i Naturklubben.
        </p>
      </div>

      <AdminTabs
        activeTab={activeTab}
        onSelect={selectTab}
        badges={{
          ansoegninger: applications.length,
          badges: nominationsQuery.data?.length ?? 0,
        }}
      />

      {/* Beskederne står uden for fanepanelerne, så en kvittering ikke
          forsvinder, hvis handlingen skifter fane. */}
      {successMsg && (
        <p role="status" className="text-sm text-green-700">
          {successMsg}
        </p>
      )}
      {actionError && (
        <p role="alert" className="text-sm text-red-700">
          {actionError}
        </p>
      )}

      <AdminTabPanel tab="ansoegninger" activeTab={activeTab}>
        <ProbationApplicationsSection
          applications={applications}
          isPending={applicationsQuery.isPending}
          isError={applicationsQuery.isError}
          isSuccess={applicationsQuery.isSuccess}
          error={applicationsQuery.error}
          handlingApplication={handlingApplication}
          retryingNotification={retryingNotification}
          onApprove={(id, applicantEmail) =>
            void handleApprove(id, applicantEmail)
          }
          onReject={(id, applicantEmail) =>
            void handleReject(id, applicantEmail)
          }
          onRetryNotification={(id, kind) =>
            void handleRetryNotification(id, kind)
          }
        />
      </AdminTabPanel>

      <AdminTabPanel tab="medlemmer" activeTab={activeTab}>
        <AdminRolesSection currentUserId={userId} />
      </AdminTabPanel>

      <AdminTabPanel tab="badges" activeTab={activeTab}>
        <BadgeNominationsSection adminId={userId} />
        <BadgeProductionsSection adminId={userId} />
        <BadgeCatalogSection />
      </AdminTabPanel>

      <AdminTabPanel tab="aktiviteter" activeTab={activeTab}>
        <ActivitiesSection />
      </AdminTabPanel>

      <AdminTabPanel tab="adgang" activeTab={activeTab}>
        <AllowedEmailsSection
          emails={emails}
          isPending={allowedEmailsQuery.isPending}
          isError={allowedEmailsQuery.isError}
          isSuccess={allowedEmailsQuery.isSuccess}
          error={allowedEmailsQuery.error}
          email={email}
          note={note}
          onEmailChange={setEmail}
          onNoteChange={setNote}
          onSubmit={(event) => void handleSubmit(event)}
          onRemove={(entry) => void handleRemove(entry)}
          adding={addEmail.isPending}
          removing={removeEmail.isPending}
          inviteError={inviteError}
          inviteEmailInvalid={inviteEmailInvalid}
          emailRef={emailRef}
        />
      </AdminTabPanel>

      <AdminTabPanel tab="indstillinger" activeTab={activeTab}>
        <AdminSection
          title="Admin-notifikationer"
          description="Slå dem til på mindst én administrators enhed for at få besked om nye ansøgninger."
        >
          <NotificationToggle userId={userId} />
        </AdminSection>
        <AdminSection
          title="Chatnotifikationer"
          description="Vælg hvor meget chatten må sende til dine enheder. Valget er dit eget og følger dig på tværs af telefon og computer."
        >
          <ChatNotificationPreference userId={userId} />
        </AdminSection>
      </AdminTabPanel>
    </main>
  )
}

export default AdminPage
