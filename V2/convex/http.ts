import { httpRouter } from 'convex/server'
import { auth } from './auth'

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

export default http
