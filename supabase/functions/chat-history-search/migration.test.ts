// @vitest-environment node

import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const migrationUrl = new URL(
  '../../migrations/20260823201000_chat_history_search.sql',
  import.meta.url,
)

describe('chat history search migration contract', () => {
  it('never returns soft-deleted messages from search or context', async () => {
    const sql = await readFile(migrationUrl, 'utf8')

    expect(sql).toMatch(
      /create or replace function public[.]search_chat_messages[\s\S]+where nullif[\s\S]+and message[.]deleted_at is null/,
    )
    expect(sql).toMatch(
      /create or replace function public[.]get_chat_message_context[\s\S]+where message[.]id = target_message_id\s+and message[.]deleted_at is null/,
    )
    expect(sql).toMatch(
      /context_messages[\s\S]+where \(message[.]created_at, message[.]id\)[\s\S]+and message[.]deleted_at is null[\s\S]+union[\s\S]+where \(message[.]created_at, message[.]id\)[\s\S]+and message[.]deleted_at is null/,
    )
  })
})
