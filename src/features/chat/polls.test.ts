import { describe, expect, it } from 'vitest'
import {
  closePollLocally,
  groupPollsByMessage,
  setPollVote,
  summarizePoll,
  upsertPoll,
  type Poll,
} from './polls'

const basePoll: Poll = {
  id: 'poll-1',
  message_id: 'message-1',
  question: 'Hvor skal vi hen på lørdag?',
  created_by: 'ada',
  closed_at: null,
  closed_by: null,
  options: [
    { id: 'option-1', poll_id: 'poll-1', position: 0, label: 'Skoven' },
    { id: 'option-2', poll_id: 'poll-1', position: 1, label: 'Stranden' },
  ],
  votes: [],
}

describe('groupPollsByMessage', () => {
  it('keys each poll by its message id', () => {
    const other: Poll = { ...basePoll, id: 'poll-2', message_id: 'message-2' }
    const grouped = groupPollsByMessage([basePoll, other])

    expect(grouped.get('message-1')).toBe(basePoll)
    expect(grouped.get('message-2')).toBe(other)
  })

  it('is safe on an empty or missing list', () => {
    expect(groupPollsByMessage(undefined).size).toBe(0)
    expect(groupPollsByMessage([]).size).toBe(0)
  })
})

describe('summarizePoll', () => {
  it('shows 0% and no votes for a brand new poll', () => {
    const summary = summarizePoll(basePoll, 'ada')

    expect(summary.totalVotes).toBe(0)
    expect(summary.closed).toBe(false)
    expect(summary.ownVoteOptionId).toBeNull()
    expect(summary.options).toEqual([
      {
        id: 'option-1',
        label: 'Skoven',
        count: 0,
        percentage: 0,
        votedByMe: false,
      },
      {
        id: 'option-2',
        label: 'Stranden',
        count: 0,
        percentage: 0,
        votedByMe: false,
      },
    ])
  })

  it('tallies votes and rounds the percentage', () => {
    const poll: Poll = {
      ...basePoll,
      votes: [
        { poll_id: 'poll-1', user_id: 'ada', option_id: 'option-1' },
        { poll_id: 'poll-1', user_id: 'bo', option_id: 'option-1' },
        { poll_id: 'poll-1', user_id: 'carl', option_id: 'option-2' },
      ],
    }

    const summary = summarizePoll(poll, 'ada')

    expect(summary.totalVotes).toBe(3)
    expect(summary.options[0]).toMatchObject({
      count: 2,
      percentage: 67,
      votedByMe: true,
    })
    expect(summary.options[1]).toMatchObject({
      count: 1,
      percentage: 33,
      votedByMe: false,
    })
  })

  it('marks the poll closed once closed_at is set', () => {
    const poll: Poll = { ...basePoll, closed_at: '2026-09-14T09:00:00.000Z' }
    expect(summarizePoll(poll, 'ada').closed).toBe(true)
  })

  it('orders answers by position, not by vote count', () => {
    const poll: Poll = {
      ...basePoll,
      options: [
        { id: 'option-2', poll_id: 'poll-1', position: 1, label: 'Stranden' },
        { id: 'option-1', poll_id: 'poll-1', position: 0, label: 'Skoven' },
      ],
      votes: [{ poll_id: 'poll-1', user_id: 'bo', option_id: 'option-2' }],
    }

    const summary = summarizePoll(poll, 'ada')
    expect(summary.options.map((option) => option.label)).toEqual([
      'Skoven',
      'Stranden',
    ])
  })

  it('reflects only the current user’s own vote, not the last cast one', () => {
    const poll: Poll = {
      ...basePoll,
      votes: [
        { poll_id: 'poll-1', user_id: 'ada', option_id: 'option-2' },
        { poll_id: 'poll-1', user_id: 'bo', option_id: 'option-1' },
      ],
    }
    expect(summarizePoll(poll, 'ada').ownVoteOptionId).toBe('option-2')
    expect(summarizePoll(poll, 'bo').ownVoteOptionId).toBe('option-1')
    expect(summarizePoll(poll, 'carl').ownVoteOptionId).toBeNull()
  })
})

describe('upsertPoll', () => {
  it('adds a poll that is not in the cache yet', () => {
    expect(upsertPoll(undefined, basePoll)).toEqual([basePoll])
    expect(upsertPoll([], basePoll)).toEqual([basePoll])
  })

  it('replaces a poll with the same id instead of duplicating it', () => {
    const updated: Poll = { ...basePoll, question: 'Hvor skal vi hen i dag?' }
    expect(upsertPoll([basePoll], updated)).toEqual([updated])
  })
})

describe('setPollVote', () => {
  it('adds the first vote from a member', () => {
    const vote = { poll_id: 'poll-1', user_id: 'ada', option_id: 'option-1' }
    expect(setPollVote([basePoll], vote)[0].votes).toEqual([vote])
  })

  it('replaces an earlier vote from the same member instead of adding a second one', () => {
    const poll: Poll = {
      ...basePoll,
      votes: [{ poll_id: 'poll-1', user_id: 'ada', option_id: 'option-1' }],
    }
    const changedVote = {
      poll_id: 'poll-1',
      user_id: 'ada',
      option_id: 'option-2',
    }

    const updated = setPollVote([poll], changedVote)

    expect(updated[0].votes).toEqual([changedVote])
  })

  it('is safe on an empty cache', () => {
    expect(
      setPollVote(undefined, {
        poll_id: 'poll-1',
        user_id: 'ada',
        option_id: 'option-1',
      }),
    ).toEqual([])
  })
})

describe('closePollLocally', () => {
  it('sets closed_at and closed_by on the matching poll only', () => {
    const other: Poll = { ...basePoll, id: 'poll-2', message_id: 'message-2' }
    const updated = closePollLocally(
      [basePoll, other],
      'poll-1',
      'ada',
      '2026-09-14T09:00:00.000Z',
    )

    expect(updated[0]).toMatchObject({
      closed_at: '2026-09-14T09:00:00.000Z',
      closed_by: 'ada',
    })
    expect(updated[1]).toEqual(other)
  })

  it('is safe on an empty cache', () => {
    expect(closePollLocally(undefined, 'poll-1', 'ada', 'now')).toEqual([])
  })
})
