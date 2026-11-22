import { httpRouter } from 'convex/server'
import { auth } from './auth'
import { registerCalendarFeedRoutes } from './calendarFeed'
import { servePhoto, serveVideo } from './gallery'
import { serveAudio } from './audio'
import { probationHttpRoutes } from './probation'
import { previewMemberHttpRoutes } from './previewMemberAuth'

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
http.route({ path: '/photo', method: 'GET', handler: servePhoto })
http.route({ path: '/video', method: 'GET', handler: serveVideo })
http.route({ path: '/audio', method: 'GET', handler: serveAudio })

// Prøvemedlemskabets ansøgningsformular. Ruterne ejes af `probation.ts`, som
// også har validering, HMAC og rate limiting; her bindes de blot til routeren.
for (const route of probationHttpRoutes) {
  http.route({ path: route.path, method: route.method, handler: route.handler })
}

for (const route of previewMemberHttpRoutes) {
  http.route({ path: route.path, method: route.method, handler: route.handler })
}

export default http
