import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Mangler VITE_SUPABASE_URL og/eller VITE_SUPABASE_PUBLISHABLE_KEY. Se .env.example.',
  )
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey)
