import {
  toFriendlyProbationApplicationError,
  type ProbationApplication,
} from '../probation/useProbationApplications'
import { AdminSection } from './AdminSection'
import { formatAdminDate } from './formatAdminDate'

/**
 * Ansøgninger om prøvemedlemskab — den eneste sektion, hvor nogen venter på et
 * svar. Den ligger derfor først i panelet og har antallet i fanen.
 */
export function ProbationApplicationsSection({
  applications,
  isPending,
  isError,
  isSuccess,
  error,
  handlingApplication,
  retryingNotification,
  onApprove,
  onReject,
  onRetryNotification,
}: {
  applications: ProbationApplication[]
  isPending: boolean
  isError: boolean
  isSuccess: boolean
  error: unknown
  handlingApplication: boolean
  retryingNotification: boolean
  onApprove: (applicationId: number, applicantEmail: string) => void
  onReject: (applicationId: number, applicantEmail: string) => void
  onRetryNotification: (
    applicationId: number,
    kind: 'admin' | 'decision',
  ) => void
}) {
  return (
    <AdminSection
      title="Ansøgninger om prøvemedlemskab"
      description="Godkender du en ansøgning, får ansøgeren besked og kan oprette en bruger."
      count={applications.length}
    >
      {isPending && (
        <p className="text-sm text-green-700">Henter ansøgninger…</p>
      )}

      {isError && (
        <p role="alert" className="text-sm text-red-700">
          Ansøgningerne kunne ikke hentes:{' '}
          {toFriendlyProbationApplicationError(error)}
        </p>
      )}

      {isSuccess && applications.length === 0 && (
        <p className="text-sm text-green-700">
          Der ligger ingen åbne ansøgninger lige nu.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {applications.map((application) => (
          <li
            key={application.id}
            className="flex flex-col gap-3 rounded-lg border border-green-200 px-4 py-3"
          >
            <div className="space-y-1">
              <p className="text-green-950">{application.full_name}</p>
              <p className="text-sm text-green-800">{application.email}</p>
              <p className="text-sm text-green-700">
                Ansøgt {formatAdminDate(application.created_at)}
              </p>
              <p className="text-sm whitespace-pre-wrap text-green-900">
                {application.motivation}
              </p>
              {application.status !== 'pending' && (
                <p className="text-sm font-medium text-green-800">
                  {application.status === 'approved'
                    ? 'Ansøgningen er godkendt.'
                    : 'Ansøgningen er afvist.'}
                </p>
              )}
            </div>
            {application.status === 'pending' && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onApprove(application.id, application.email)}
                  disabled={handlingApplication}
                  className="min-h-11 rounded-lg bg-green-800 px-4 py-2 text-white disabled:opacity-50"
                >
                  Godkend
                </button>
                <button
                  type="button"
                  onClick={() => onReject(application.id, application.email)}
                  disabled={handlingApplication}
                  className="min-h-11 rounded-lg border border-red-300 px-4 py-2 text-red-700 disabled:opacity-50"
                >
                  Afvis
                </button>
              </div>
            )}

            {application.status === 'pending' &&
              application.admin_notification_status === 'failed' && (
                <div className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  <p>
                    Admin-notifikationen er ikke leveret
                    {application.admin_notification_error
                      ? `: ${application.admin_notification_error}`
                      : '.'}
                  </p>
                  {application.notification_function_url && (
                    <button
                      type="button"
                      onClick={() =>
                        onRetryNotification(application.id, 'admin')
                      }
                      disabled={retryingNotification}
                      className="min-h-11 rounded border border-amber-500 px-3 py-2 disabled:opacity-50"
                    >
                      Prøv admin-notifikationen igen
                    </button>
                  )}
                </div>
              )}

            {application.status === 'pending' &&
              (application.admin_notification_status === 'pending' ||
                application.admin_notification_status === 'sending') && (
                <p className="text-sm text-amber-800">
                  Admin-notifikationen venter på levering…
                </p>
              )}

            {application.status !== 'pending' &&
              application.decision_notification_status === 'failed' && (
                <div className="space-y-2 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                  <p>
                    Beslutningen er gemt, men ansøgerens notifikation er ikke
                    leveret
                    {application.decision_notification_error
                      ? `: ${application.decision_notification_error}`
                      : '.'}
                  </p>
                  {application.notification_function_url && (
                    <button
                      type="button"
                      onClick={() =>
                        onRetryNotification(application.id, 'decision')
                      }
                      disabled={retryingNotification}
                      className="min-h-11 rounded border border-red-400 px-3 py-2 disabled:opacity-50"
                    >
                      Prøv ansøgernotifikationen igen
                    </button>
                  )}
                </div>
              )}

            {application.status !== 'pending' &&
              (application.decision_notification_status === 'pending' ||
                application.decision_notification_status === 'sending') && (
                <p className="text-sm text-green-700">
                  Ansøgerens notifikation venter på levering…
                </p>
              )}
          </li>
        ))}
      </ul>
    </AdminSection>
  )
}
