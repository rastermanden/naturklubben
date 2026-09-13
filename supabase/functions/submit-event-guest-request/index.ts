// Edge Function: submit-event-guest-request
//
// Eneste indgang for ikke-medlemmer, der vil søge om at deltage i en åben
// begivenhed (#224). Deployes uden gateway-JWT (offentlig formular); selve
// rate limit og oprettelse sker i den service-role-only RPC
// submit_event_guest_request_limited, som kun kan kaldes med den
// auto-injicerede Secret key.

import { createClient } from 'npm:@supabase/supabase-js@2.112.3'
import {
  createGuestRequestHandler,
  type GuestRequestRpcArguments,
  type GuestRequestRpcResult,
} from './handler.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const secret =
  Deno.env.get('SUPABASE_SECRET_KEY') ??
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!supabaseUrl || !secret) {
  throw new Error('Supabase server credentials are unavailable')
}

const supabase = createClient(supabaseUrl, secret, {
  auth: { persistSession: false },
})

const handler = createGuestRequestHandler({
  secret,
  submit: async (arguments_: GuestRequestRpcArguments) => {
    const { data, error } = await supabase
      .rpc('submit_event_guest_request_limited', arguments_)
      .single<GuestRequestRpcResult>()
    if (error) {
      throw new Error(`submission_rpc_${error.code || 'unknown'}`)
    }
    return data
  },
  reportError: (requestId, category) => {
    console.error(`[${requestId}] ${category}`)
  },
})

Deno.serve(handler)
