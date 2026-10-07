// Delt mellem appen og service workeren (#219).
//
// Filen har ingen imports og rører ingen browser-API'er, fordi den læses fra to
// programmer med hver sit lib-sæt: app-bundlen (DOM) og service workeren
// (WebWorker, se tsconfig.worker.json). Tag'et skal være det samme i de to, så
// det er skrevet ét sted.

/**
 * Navnet på Background Sync-opgaven, klienten beder browseren om at vække
 * service workeren med, når der igen er forbindelse.
 */
export const CHAT_QUEUE_SYNC_TAG = 'naturklubben-chat-queue'

/**
 * Beskeden, service workeren sender til de åbne faner, når browseren vækker
 * den. Fanen har Supabase-sessionen og kan derfor sende; service workeren kan
 * ikke (se sw.ts).
 */
export const CHAT_QUEUE_FLUSH_MESSAGE = 'flush-chat-queue'
