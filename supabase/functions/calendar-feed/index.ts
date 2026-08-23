// Edge Function: calendar-feed
//
// Offentligt iCal-abonnementsendpoint — returnerer alle kommende begivenheder
// i Naturklubben som en RFC 5545-kompatibel .ics-strøm.
//
// Kalender-apps (Google Kalender, Apple Kalender, Outlook m.fl.) kan
// abonnere på URL'en og henter automatisk et opdateret feed med jævne
// mellemrum. Endpointet kræver ingen autentificering, men læser kun
// begivenheder som er offentlige via RLS (anon-rollen).
//
// GET /functions/v1/calendar-feed  -> text/calendar

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors } from '../_shared/cors.ts'
import { generateIcal } from '../_shared/ical.ts'

const CALENDAR_REFRESH_INTERVAL = 'PT1H'

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const cors = handleCors(req, { methods: ['GET'] })
  if (cors.response) return cors.response
  const corsHeaders = cors.headers

  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: corsHeaders,
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const publishableKeysJson = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')
    if (!supabaseUrl || !publishableKeysJson) {
      console.error('calendar-feed: missing Supabase environment variables')
      return new Response('Internal Server Error', {
        status: 500,
        headers: corsHeaders,
      })
    }

    const publishableKeys = JSON.parse(publishableKeysJson) as Record<
      string,
      unknown
    >
    const publishableKey = publishableKeys.default
    if (typeof publishableKey !== 'string' || !publishableKey) {
      console.error('calendar-feed: missing default Supabase publishable key')
      return new Response('Internal Server Error', {
        status: 500,
        headers: corsHeaders,
      })
    }

    // The publishable key assumes the anon role. That role can only read the
    // deliberately data-minimized view, not the member-only events table.
    const supabase = createClient(supabaseUrl, publishableKey)

    const startOfToday = new Date()
    startOfToday.setUTCHours(0, 0, 0, 0)

    const { data, error } = await supabase
      .from('calendar_feed_events')
      .select('id, title, location, start_at, end_at')
      .gte('start_at', startOfToday.toISOString())
      .order('start_at', { ascending: true })

    if (error) {
      console.error('calendar-feed: db error', error)
      return new Response('Internal Server Error', {
        status: 500,
        headers: corsHeaders,
      })
    }

    const ics = generateIcal(data ?? [], 'Naturklubben', {
      refreshInterval: CALENDAR_REFRESH_INTERVAL,
    })

    return new Response(ics, {
      status: 200,
      headers: new Headers({
        ...Object.fromEntries(corsHeaders),
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="naturklubben.ics"',
        // Brug samme TTL som REFRESH-INTERVAL ovenfor
        'Cache-Control': 'public, max-age=3600',
      }),
    })
  } catch (err) {
    console.error('calendar-feed: unexpected error', err)
    return new Response('Internal Server Error', {
      status: 500,
      headers: corsHeaders,
    })
  }
})
