import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import type { BrowserPushSubscription } from '../notifications/usePushNotifications'

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

export interface SubmittedApplication {
  applicationId: number
  notificationToken: string
  notification: NotificationDelivery
}

interface SubmittedApplicationRow {
  application_id: number
  notification_token: string
}

const queryKey = ['probation_applications', 'pending']
const notificationFunction = 'probation-notifications'

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

function isSubmittedApplicationRow(
  value: unknown,
): value is SubmittedApplicationRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    'application_id' in value &&
    typeof value.application_id === 'number' &&
    'notification_token' in value &&
    typeof value.notification_token === 'string'
  )
}

export function toFriendlyProbationApplicationError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : ''
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : ''

  if (code === '23505' && message === 'Email already allowed')
    return 'Den e-mail kan allerede oprette en bruger.'
  if (code === '23505')
    return 'Der ligger allerede en åben ansøgning på den e-mail.'
  if (code === '42501')
    return 'Du har ikke rettigheder til at behandle ansøgningen.'
  if (code === 'P0002')
    return 'Ansøgningen blev ikke fundet. Opdater siden og prøv igen.'
  if (code === '22023')
    return 'Alle felter og tilladelse til notifikationer er påkrævet.'
  if (code === '22001')
    return 'Et eller flere felter er for lange. Forkort teksten og prøv igen.'
  // PGRST205 (nyere PostgREST) og 42P01 (Postgres) betyder begge, at tabellen
  // ikke findes -- i praksis at migrationen ikke er deployet endnu.
  if (code === 'PGRST205' || code === '42P01')
    return 'Ansøgninger er ikke slået til i databasen endnu. Kontakt den, der passer appen.'
  // supabase-js kaster PostgrestError: et almindeligt objekt, ikke en Error.
  // Uden det her faldt enhver ukendt fejl igennem til den intetsigende tekst
  // nedenfor, så en reel fejlbesked aldrig nåede skærmen.
  if (message) return message
  if (error instanceof Error) return error.message
  return 'Der skete en fejl. Prøv igen om lidt.'
}

export function useSubmitProbationApplication() {
  return useMutation({
    mutationFn: async ({
      fullName,
      email,
      motivation,
      subscription,
    }: ProbationApplicationInput) => {
      const { data, error } = await supabase
        .rpc('submit_probation_application', {
          applicant_full_name: fullName.trim(),
          applicant_email: email.trim().toLowerCase(),
          applicant_motivation: motivation.trim(),
          push_endpoint: subscription.endpoint,
          push_p256dh: subscription.p256dh,
          push_auth: subscription.auth,
        })
        .single()

      if (error) throw error
      if (!isSubmittedApplicationRow(data)) {
        throw new Error('Serveren svarede uden ansøgnings-id.')
      }

      let notification: NotificationDelivery
      try {
        notification = await deliverNotification(
          data.application_id,
          'admin',
          data.notification_token,
        )
      } catch (notificationError) {
        console.error(
          'Ansøgningen blev gemt, men admin-notifikationen fejlede',
          notificationError,
        )
        notification = failedDelivery()
      }

      return {
        applicationId: data.application_id,
        notificationToken: data.notification_token,
        notification,
      } satisfies SubmittedApplication
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

export function retryProbationNotification(
  applicationId: number,
  kind: 'admin' | 'decision',
  notificationToken?: string,
) {
  return deliverNotification(applicationId, kind, notificationToken)
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
