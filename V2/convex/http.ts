import { httpRouter } from 'convex/server'
import { auth } from './auth'
import { registerCalendarFeedRoutes } from './calendarFeed'
import { probationHttpRoutes } from './probation'

/**
 * HTTP-ruter uden for Convex's eget funktions-API.
 *
 * Convex Auth lægger sine egne ruter her (login, callback, session). Alt andet,
 * der skal kunne kaldes af noget, der ikke er appen -- den offentlige iCal-feed
 * og gæsternes tilmeldingsformular -- kommer også til at ligge her som
 * `http.route(...)`, fordi de skal kunne nås uden et Convex-login.
 */
const http = httpRouter()

auth.addHttpRoutes(http)
registerCalendarFeedRoutes(http)

// Prøvemedlemskabets ansøgningsformular. Ruterne ejes af `probation.ts`, som
// også har validering, HMAC og rate limiting; her bindes de blot til routeren.
for (const route of probationHttpRoutes) {
  http.route({ path: route.path, method: route.method, handler: route.handler })
}

export default http
