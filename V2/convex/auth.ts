import { Password } from '@convex-dev/auth/providers/Password'
import { convexAuth } from '@convex-dev/auth/server'

/**
 * Convex Auth med adgangskode.
 *
 * Forskellen fra Supabase Auth, som skal besluttes bevidst: Supabase gemte en
 * bcrypt-hash i `auth.users`, som ikke kan læses gennem API'et. Convex Auth
 * gemmer sin egen hash i `authAccounts`. Der er derfor ingen måde at flytte
 * adgangskoderne med over -- medlemmerne skal sætte en ny adgangskode, eller
 * der skal bygges en engangs-import (se V2/README.md, "Adgangskoder").
 *
 * Adgangskontrollen (hvem der overhovedet må oprette sig) ligger ikke her: den
 * ligger i `members.claimProfile`, som afviser en e-mail, der ikke står i
 * `allowedEmails`. Det er et bevidst valg, fordi en afvisning skal kunne siges
 * højt i UI'et med en forklaring, ikke ende som en kryptisk auth-fejl.
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
})
