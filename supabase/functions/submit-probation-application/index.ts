import { createClient } from 'npm:@supabase/supabase-js@2.112.3'
import {
  createSubmissionHandler,
  type SubmissionRpcArguments,
  type SubmissionRpcResult,
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

const handler = createSubmissionHandler({
  secret,
  submit: async (arguments_: SubmissionRpcArguments) => {
    const { data, error } = await supabase
      .rpc('submit_probation_application_limited', arguments_)
      .single<SubmissionRpcResult>()
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
