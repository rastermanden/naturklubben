import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'

export interface ProbationApplication {
  id: number
  full_name: string
  email: string
  motivation: string
  created_at: string
}

export interface ProbationApplicationInput {
  fullName: string
  email: string
  motivation: string
}

const queryKey = ['probation_applications', 'pending']

async function fetchPendingProbationApplications(): Promise<
  ProbationApplication[]
> {
  const { data, error } = await supabase
    .from('probation_applications')
    .select('id, full_name, email, motivation, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (error) throw error
  return data
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
  if (error instanceof Error) return error.message
  return 'Der skete en fejl. Prøv igen om lidt.'
}

export function useSubmitProbationApplication() {
  return useMutation({
    mutationFn: async ({
      fullName,
      email,
      motivation,
    }: ProbationApplicationInput) => {
      const { error } = await supabase.from('probation_applications').insert({
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        motivation: motivation.trim(),
      })

      if (error) throw error
    },
  })
}

export function useProbationApplications() {
  const queryClient = useQueryClient()

  const applicationsQuery = useQuery({
    queryKey,
    queryFn: fetchPendingProbationApplications,
  })

  const approveApplication = useMutation({
    mutationFn: async (applicationId: number) => {
      const { error } = await supabase.rpc('approve_probation_application', {
        application_id: applicationId,
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  const rejectApplication = useMutation({
    mutationFn: async (applicationId: number) => {
      const { error } = await supabase.rpc('reject_probation_application', {
        application_id: applicationId,
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  return { applicationsQuery, approveApplication, rejectApplication }
}
