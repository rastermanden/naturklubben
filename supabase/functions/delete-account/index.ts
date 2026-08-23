// Edge Function: delete-account
//
// #86: selvbetjent, permanent kontosletning. Kaldes fra
// src/features/account/deleteAccount.ts, som lige forinden har kaldt
// signInWithPassword for at genbekræfte adgangskoden -- denne function
// tjekker selv, at det genlogin er frisk (se MAX_LOGIN_AGE_MS), i stedet for
// at stole på klientens ord for det. Adgangskoden selv sendes aldrig til
// denne function (kun bekræftelsesteksten) og logges derfor aldrig her.
//
// Standard gateway-JWT-verifikation er slået til (deploy-functions.yml
// deployer *uden* --no-verify-jwt) -- kun et gyldigt, ikke-udløbet
// access-token kan overhovedet nå frem til koden her. auth.getUser(token)
// oven i det slår tokenet op mod GoTrue og giver os den friskeste
// last_sign_in_at, uafhængigt af hvad der evt. står i selve JWT'et.
//
// Stadier, i rækkefølge -- bevidst ikke ombyttelige, og hvert stadie har en
// stabil fejlkode, hvis det er der, kaldet stopper:
//   1. validér input                -> invalid_confirmation
//   2. tjek frisk genlogin           -> recent_login_required
//   3. reservér sidste-admin-tjekket -> last_admin (se nedenfor)
//   4. ryd Storage                   -> storage_cleanup_failed
//   5. slet auth-brugeren            -> account_delete_failed
// Kun (5)'s succes returnerer { deleted: true }.
//
// Idempotens/genforsøg: Storage, Postgres og Auth kan ikke ændres atomisk på
// tværs af providernes grænser. Fejler (4), kan nogle filer allerede være
// slettet, men kontoen og metadata bevares, og et nyt kald genkører (3)-(5).
// removeAllUnderPrefix lister fra begyndelsen igen, og allerede fjernede
// objekter er per definition ikke en fejl. Fejler (5), er Storage allerede
// tom, så et nyt forsøg gentager reservationen og Auth-sletningen. Klienten
// får aldrig succes, før (5) er færdig. Se reserve_account_deletion i
// 20260823170000_account_deletion.sql for hvordan (3) samtidig er sikker mod
// to administratorer, der forsøger at slette sig selv på samme tid -- uden
// den reservation ville et rent "tæl admins nu"-tjek her i koden have et
// kapløbsvindue, fordi selve auth.admin.deleteUser-kaldet sker uden om
// Postgres og derfor ikke kan indgå i den samme transaktion som tjekket.
//
// Rest af skemaet (profiles, photos-metadata, push_subscriptions,
// event_attendance, allowed_emails, probation_applications) rydder sig selv
// via ON DELETE CASCADE/triggeren, når (5) lykkes -- se samme migration.

import { createClient } from 'npm:@supabase/supabase-js@2.112.3'
import { handleCors } from '../_shared/cors.ts'
import { removeAllUnderPrefix } from '../_shared/storageCleanup.ts'
import { isRecentLogin } from '../_shared/recentLogin.ts'

const CONFIRMATION_PHRASE = 'SLET MIN KONTO'
const MAX_LOGIN_AGE_MS = 5 * 60 * 1000

// SQLSTATE hævet af reserve_account_deletion, når sletningen ville efterlade
// klubben uden nogen administrator (check_violation -- en forretningsregel,
// ikke en databasefejl). Se 20260823170000_account_deletion.sql.
const LAST_ADMIN_SQLSTATE = '23514'

// Alle tre buckets bruger samme mappestruktur: `${userId}/${uuid}.${ext}`.
const STORAGE_BUCKETS = ['avatars', 'photos-original', 'photos-optimized']

type ErrorCode =
  | 'unauthorized'
  | 'invalid_confirmation'
  | 'recent_login_required'
  | 'last_admin'
  | 'storage_cleanup_failed'
  | 'account_delete_failed'

function jsonError(
  code: ErrorCode,
  status: number,
  message: string,
  corsHeaders: Headers,
) {
  const headers = new Headers(corsHeaders)
  headers.set('Content-Type', 'application/json')
  return new Response(JSON.stringify({ code, error: message }), {
    status,
    headers,
  })
}

function jsonOk(body: unknown, corsHeaders: Headers) {
  const headers = new Headers(corsHeaders)
  headers.set('Content-Type', 'application/json')
  return new Response(JSON.stringify(body), {
    status: 200,
    headers,
  })
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get('Authorization')
  return header?.startsWith('Bearer ') ? header.slice(7) : null
}

function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    (Deno.env.get('SUPABASE_SECRET_KEY') ??
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    { auth: { persistSession: false } },
  )
}

Deno.serve(async (req) => {
  const cors = handleCors(req, { methods: ['POST'] })
  if (cors.response) return cors.response
  const corsHeaders = cors.headers

  if (req.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: corsHeaders,
    })
  }

  const token = bearerToken(req)
  if (!token) {
    return jsonError('unauthorized', 401, 'Ikke autentificeret', corsHeaders)
  }

  const supabase = serviceClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token)
  if (userError || !user) {
    return jsonError('unauthorized', 401, 'Ikke autentificeret', corsHeaders)
  }

  let confirmation: unknown
  try {
    ;({ confirmation } = await req.json())
  } catch {
    return jsonError(
      'invalid_confirmation',
      400,
      'Ugyldig JSON i request-body',
      corsHeaders,
    )
  }
  if (confirmation !== CONFIRMATION_PHRASE) {
    return jsonError(
      'invalid_confirmation',
      400,
      `Bekræftelsen skal være "${CONFIRMATION_PHRASE}"`,
      corsHeaders,
    )
  }

  // Klienten kalder signInWithPassword umiddelbart før dette kald -- vi
  // tjekker selv, at logintidspunktet er frisk, i stedet for at stole på
  // klientens ord for det. En genbrugt, ældre session kan ikke bruges til at
  // slette kontoen. Adgangskoden selv når aldrig hertil -- den valideres af
  // Supabase Auth i signInWithPassword-kaldet på klienten, ikke i denne
  // function -- og logges derfor heller ikke her.
  if (!isRecentLogin(user.last_sign_in_at, Date.now(), MAX_LOGIN_AGE_MS)) {
    return jsonError(
      'recent_login_required',
      401,
      'Login skal bekræftes igen for at slette kontoen',
      corsHeaders,
    )
  }

  // Reservationen låser sidste-admin-tjekket og markeringen af "er ved at
  // blive slettet" sammen, atomisk, bag en Postgres advisory lock -- se
  // reserve_account_deletion i 20260823170000_account_deletion.sql for hvorfor
  // et separat "tæl admins"-RPC efterfulgt af auth.admin.deleteUser her i
  // koden ikke ville være sikkert mod to samtidige kontosletninger. Kaldet er
  // selv idempotent: et gentaget forsøg fra samme bruger (fx efter en
  // tidligere fejlet Storage-oprydning nedenfor) kører tjekket igen i stedet
  // for at fejle, fordi en reservation allerede findes.
  const { error: reservationError } = await supabase.rpc(
    'reserve_account_deletion',
    { target_user_id: user.id },
  )
  if (reservationError) {
    if (reservationError.code === LAST_ADMIN_SQLSTATE) {
      return jsonError(
        'last_admin',
        409,
        'Du er klubbens sidste administrator',
        corsHeaders,
      )
    }
    console.error('reserve_account_deletion fejlede', {
      userId: user.id,
      error: reservationError.message,
    })
    return jsonError(
      'account_delete_failed',
      500,
      'Kunne ikke tjekke administratorstatus',
      corsHeaders,
    )
  }

  try {
    for (const bucket of STORAGE_BUCKETS) {
      await removeAllUnderPrefix(supabase, bucket, user.id)
    }
  } catch (caught) {
    console.error('Storage-oprydning fejlede ved kontosletning', {
      userId: user.id,
      error: caught instanceof Error ? caught.message : String(caught),
    })
    return jsonError(
      'storage_cleanup_failed',
      500,
      'Filer kunne ikke slettes sikkert -- kontoen er bevaret',
      corsHeaders,
    )
  }

  // Kun efter vellykket Storage-oprydning slettes selve auth-brugeren.
  // `false` for soft-delete: kontoen skal forsvinde permanent, ikke bare
  // deaktiveres, og en efterladt "soft deleted" auth.users-række ville
  // stadig optage e-mailadressen.
  const { error: deleteUserError } = await supabase.auth.admin.deleteUser(
    user.id,
    false,
  )
  if (deleteUserError) {
    console.error('auth.admin.deleteUser fejlede', {
      userId: user.id,
      error: deleteUserError.message,
    })
    return jsonError(
      'account_delete_failed',
      500,
      'Kontoen kunne ikke slettes',
      corsHeaders,
    )
  }

  return jsonOk({ deleted: true }, corsHeaders)
})
