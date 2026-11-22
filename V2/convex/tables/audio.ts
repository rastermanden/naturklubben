import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * Lyddomænet: mp3-filer, som medlemmer lægger op og afspiller i appen.
 *
 * Hver række har sit eget uforudsigelige `playToken`. Afspilningen går gennem
 * `GET /audio?token=...` (`serveAudio` i `convex/audio.ts`), så klienten aldrig
 * får et råt `storageId` eller en permanent `ctx.storage.getUrl`-adresse.
 *
 * Convex har ingen fremmednøgler: når et medlem sletter sin konto, rydder
 * `convex/account.ts` både rækkerne her og filerne i fillageret.
 */
export const audioTables = {
  audioClips: defineTable({
    storageId: v.id('_storage'),
    playToken: v.string(),
    title: v.string(),
    sizeBytes: v.number(),
    contentType: v.string(),
    uploaderId: v.id('profiles'),
    createdAt: v.number(),
  })
    .index('by_created', ['createdAt'])
    .index('by_uploader', ['uploaderId', 'createdAt'])
    .index('by_play_token', ['playToken'])
    .index('by_storage_id', ['storageId']),
}
