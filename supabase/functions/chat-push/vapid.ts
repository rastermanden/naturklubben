// Hvor VAPID-nøgleparret kommer fra.
//
// To kilder, i den rækkefølge:
//
//   1. Function-secrets (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`). Sættes af
//      .github/workflows/deploy-functions.yml, hvis de findes som repo-secrets.
//   2. Tabellen `push_vapid_keys`. Er den tom, genererer functionen selv et
//      nøglepar med WebCrypto og gemmer det der.
//
// Nummer 2 findes, fordi nummer 1 kræver, at et menneske opretter et repo-secret
// i GitHubs dashboard -- og projektets kerneprincip er, at alt ud over
// engangsopsætningen i #2/#3 skal kunne ske ved at skrive kode og pushe (se
// CLAUDE.md). Uden nøgler svarede functionen 503, og der var ingen vej frem fra
// selve appen. Nu konfigurerer serveren sig selv første gang, nogen slår
// notifikationer til.
//
// Nøgleparret er klubbens afsenderidentitet over for browsernes push-tjenester,
// ikke en hemmelighed per bruger. Den private del bliver i Edge Function-miljøet
// og i en tabel, hvor kun service-role kan læse (RLS uden policies + revoke).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { bytesToBase64Url, type VapidDetails } from './webpush.ts'

// RFC 8292 kræver et kontaktpunkt, så push-tjenesten kan række ud, hvis vi
// opfører os skidt. mailto: er det eneste, alle tjenester accepterer.
const DEFAULT_SUBJECT = 'mailto:naturklubben@example.com'

const TABLE = 'push_vapid_keys'

// Nøgleparret ændrer sig ikke i en instans' levetid, og en Edge Function-instans
// betjener mange requests. Cachen sparer et databasekald per push.
let cached: VapidDetails | null = null

function subject() {
  return Deno.env.get('VAPID_SUBJECT') ?? DEFAULT_SUBJECT
}

function fromEnv(): VapidDetails | null {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!publicKey || !privateKey) return null
  return { publicKey, privateKey, subject: subject() }
}

/**
 * Genererer et nyt P-256-nøglepar i det format, `webpush.ts` forventer:
 * den offentlige nøgle rå (0x04 || x || y) og den private som JWK'ens
 * `d`-komponent -- begge base64url.
 */
async function generateKeyPair() {
  const keys = (await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair

  const publicKey = bytesToBase64Url(
    new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey)),
  )
  const jwk = await crypto.subtle.exportKey('jwk', keys.privateKey)
  if (!jwk.d) throw new Error('Den genererede nøgle mangler d-komponenten')

  return { publicKey, privateKey: jwk.d }
}

async function readStored(
  supabase: SupabaseClient,
): Promise<VapidDetails | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('public_key, private_key')
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    publicKey: data.public_key,
    privateKey: data.private_key,
    subject: subject(),
  }
}

/**
 * Nøgleparret til denne installation -- hentet, eller genereret og gemt.
 *
 * Kaster, hvis databasen ikke kan svare (fx hvis migrationen ikke er deployet
 * endnu). Kalderen oversætter det til en 503.
 */
export async function getVapidDetails(
  supabase: SupabaseClient,
): Promise<VapidDetails> {
  const env = fromEnv()
  if (env) return env

  if (cached) return cached

  const stored = await readStored(supabase)
  if (stored) {
    cached = stored
    return stored
  }

  const generated = await generateKeyPair()
  const { error } = await supabase.from(TABLE).insert({
    id: true,
    public_key: generated.publicKey,
    private_key: generated.privateKey,
  })

  if (error) {
    // Et samtidigt kald nåede at gemme sit eget nøglepar først (unique
    // violation på singleton-rækken). Deres vandt -- læs det og brug det, så de
    // to instanser ikke udleverer hver sin offentlige nøgle.
    const raced = await readStored(supabase)
    if (!raced) throw error
    cached = raced
    return raced
  }

  console.log('Genererede et nyt VAPID-nøglepar og gemte det i', TABLE)
  cached = { ...generated, subject: subject() }
  return cached
}
