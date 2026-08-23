import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import type { BrowserPushSubscription } from '../notifications/usePushNotifications'
import { toProbationSubmissionError } from './probationErrors'

export { toFriendlyProbationApplicationError } from './probationErrors'

export type ApplicationStatus = 'pending' | 'approved' | 'rejected'
export type NotificationStatus = 'pending' | 'sending' | 'sent' | 'failed'

export interface ProbationApplication {
  id: number
  full_name: string
  email: string
  motivation: string
  created_at: string
  status: ApplicationStatus
  notification_function_url: string | null
  admin_notification_status: NotificationStatus
  admin_notification_error: string | null
  decision_notification_status: NotificationStatus | null
  decision_notification_error: string | null
}

export interface ProbationApplicationInput {
  fullName: string
  email: string
  motivation: string
  subscription: BrowserPushSubscription
}

export interface NotificationDelivery {
  status: NotificationStatus
  sent?: number
  failed?: number
  removed?: number
  skipped?: boolean
  error?: string
}

const queryKey = ['probation_applications', 'pending']
const notificationFunction = 'probation-notifications'
const submissionFunction = 'submit-probation-application'

async function fetchPendingProbationApplications(): Promise<
  ProbationApplication[]
> {
  const { data, error } = await supabase
    .from('probation_applications')
    .select(
      'id, full_name, email, motivation, created_at, status, notification_function_url, admin_notification_status, admin_notification_error, decision_notification_status, decision_notification_error',
    )
    .or(
      'status.eq.pending,decision_notification_status.in.(pending,sending,failed)',
    )
    .order('created_at', { ascending: true })

  if (error) throw error
  return data
}

async function deliverNotification(
  applicationId: number,
  kind: 'admin' | 'decision',
  notificationToken?: string,
): Promise<NotificationDelivery> {
  const { data, error } = await supabase.functions.invoke<NotificationDelivery>(
    notificationFunction,
    {
      body: {
        applicationId,
        kind,
        ...(notificationToken ? { notificationToken } : {}),
      },
    },
  )
  if (error) throw error
  if (!data?.status) throw new Error('Serveren svarede uden leveringsstatus.')
  return data
}

function failedDelivery(): NotificationDelivery {
  return {
    status: 'failed',
    error:
      'Ansøgningen er gemt, men notifikationen kunne ikke leveres. Prøv igen.',
  }
}

export function useSubmitProbationApplication() {
  return useMutation({
    mutationFn: async ({
      fullName,
      email,
      motivation,
      subscription,
    }: ProbationApplicationInput) => {
      const { data, error } = await supabase.functions.invoke<{
        accepted?: boolean
      }>(submissionFunction, {
        body: { fullName, email, motivation, subscription },
      })

      if (error) throw await toProbationSubmissionError(error)
      if (data?.accepted !== true) {
        throw new Error('Serveren svarede uden en kvittering.')
      }
    },
  })
}

async function decideApplication(
  applicationId: number,
  decision: 'approve' | 'reject',
) {
  const functionName =
    decision === 'approve'
      ? 'approve_probation_application'
      : 'reject_probation_application'
  const { error } = await supabase.rpc(functionName, {
    application_id: applicationId,
  })
  if (error) throw error

  try {
    return await deliverNotification(applicationId, 'decision')
  } catch (notificationError) {
    console.error(
      'Afgørelsen blev gemt, men ansøgernotifikationen fejlede',
      notificationError,
    )
    return failedDelivery()
  }
}

export function useProbationApplications() {
  const queryClient = useQueryClient()

  const applicationsQuery = useQuery({
    queryKey,
    queryFn: fetchPendingProbationApplications,
    refetchInterval: (query) =>
      query.state.data?.some(
        (application) =>
          application.admin_notification_status === 'pending' ||
          application.admin_notification_status === 'sending' ||
          application.decision_notification_status === 'pending' ||
          application.decision_notification_status === 'sending',
      )
        ? 3000
        : false,
  })

  const approveApplication = useMutation({
    mutationFn: (applicationId: number) =>
      decideApplication(applicationId, 'approve'),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })

  const rejectApplication = useMutation({
    mutationFn: (applicationId: number) =>
      decideApplication(applicationId, 'reject'),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })

  const retryNotification = useMutation({
    mutationFn: ({
      applicationId,
      kind,
    }: {
      applicationId: number
      kind: 'admin' | 'decision'
    }) => deliverNotification(applicationId, kind),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })

  return {
    applicationsQuery,
    approveApplication,
    rejectApplication,
    retryNotification,
  }
}
