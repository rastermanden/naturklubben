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
import { generateIcal } from '../_shared/ical.ts'

const CALENDAR_REFRESH_INTERVAL = 'PT1H'

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey',
      },
    })
  }

  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    // Brug anon-rollen — endpointet er offentligt, og RLS på events-tabellen
    // styrer, hvad der er synligt for ikke-autentificerede kaldere.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    )

    const startOfToday = new Date()
    startOfToday.setUTCHours(0, 0, 0, 0)

    const { data, error } = await supabase
      .from('events')
      .select('id, title, description, location, start_at, end_at')
      .gte('start_at', startOfToday.toISOString())
      .order('start_at', { ascending: true })

    if (error) {
      console.error('calendar-feed: db error', error)
      return new Response('Internal Server Error', { status: 500 })
    }

    const ics = generateIcal(data ?? [], 'Naturklubben', {
      refreshInterval: CALENDAR_REFRESH_INTERVAL,
    })

    return new Response(ics, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="naturklubben.ics"',
        // Brug samme TTL som REFRESH-INTERVAL ovenfor
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (err) {
    console.error('calendar-feed: unexpected error', err)
    return new Response('Internal Server Error', { status: 500 })
  }
})
