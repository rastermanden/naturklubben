import { httpRouter } from 'convex/server'
import { registerCalendarFeedRoutes } from './calendarFeed'
import { servePhoto, serveVideo } from './gallery'
import { serveAudio } from './audio'
import { probationHttpRoutes } from './probation'
import { previewMemberHttpRoutes } from './previewMemberAuth'

/**
 * HTTP-ruter uden for Convex's eget funktions-API.
 *
 * Den offentlige iCal-feed, medier og gæsternes tilmeldingsformular ligger her
 * som `http.route(...)`, fordi de skal kunne nås uden et Convex-login.
 */
const http = httpRouter()

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
