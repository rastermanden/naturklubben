import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * Kobling fra Supabase-id til Convex-id, så importen kan køres igen
 * uden at lægge dubletter ind. Selve medlemsdata ligger i de rigtige tabeller.
 */
export const migrateTables = {
  legacyRefs: defineTable({
    source: v.string(),
    sourceId: v.string(),
    targetId: v.string(),
  }).index('by_source', ['source', 'sourceId']),
}
