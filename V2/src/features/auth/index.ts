/**
 * Auth-domænets offentlige overflade.
 *
 * De andre feature-mapper skal kunne skrive `from '../auth'` uden at kende
 * filnavnene herinde, og uden at en flytning af en fil brækker deres imports.
 * Hold listen kort: kun det, andre domæner faktisk har brug for.
 */
export { AdminRoute } from './AdminRoute'
export { ProtectedRoute } from './ProtectedRoute'
export { useCurrentProfile } from './useCurrentProfile'
export { errorCode, toFriendlyAuthError, toFriendlyMemberError } from './authErrors'
