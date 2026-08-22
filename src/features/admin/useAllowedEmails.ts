import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'

export interface AllowedEmail {
  email: string
  note: string | null
  created_at: string
}

export interface AllowedEmailInput {
  email: string
  note: string | null
}

const queryKey = ['allowed_emails']

async function fetchAllowedEmails(): Promise<AllowedEmail[]> {
  const { data, error } = await supabase
    .from('allowed_emails')
    .select('email, note, created_at')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

/** Oversætter Postgres-fejl fra allowlisten til danske beskeder. */
export function toFriendlyAllowedEmailError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : ''

  if (code === '23505') return 'Den e-mail står allerede på listen.'
  // Ingen række ramt/oprettet = RLS afviste handlingen.
  if (code === '42501')
    return 'Du har ikke rettigheder til at ændre listen. Prøv at logge ind igen.'
  if (error instanceof Error) return error.message
  return 'Der skete en fejl. Prøv igen om lidt.'
}

export function useAllowedEmails(userId: string) {
  const queryClient = useQueryClient()

  const allowedEmailsQuery = useQuery({ queryKey, queryFn: fetchAllowedEmails })

  const addEmail = useMutation({
    mutationFn: async ({ email, note }: AllowedEmailInput) => {
      const { error } = await supabase.from('allowed_emails').insert({
        email: email.trim().toLowerCase(),
        note: note?.trim() || null,
        invited_by: userId,
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  const removeEmail = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase
        .from('allowed_emails')
        .delete()
        .eq('email', email)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  return { allowedEmailsQuery, addEmail, removeEmail }
}
