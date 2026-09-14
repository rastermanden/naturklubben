import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PhotoComment } from './usePhotoComments'

const mocks = vi.hoisted(() => ({
  userId: 'member-id',
  isAdmin: false,
  commentsQuery: {
    data: [] as PhotoComment[],
    isLoading: false,
    isError: false,
    isSuccess: true,
  },
  createComment: {
    mutate: vi.fn(),
    isPending: false,
  },
  deleteComment: {
    mutate: vi.fn(),
    isPending: false,
    variables: undefined as { commentId: string; photoId: string } | undefined,
  },
}))

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ session: { user: { id: mocks.userId } } }),
}))
vi.mock('../admin/useIsAdmin', () => ({
  useIsAdmin: () => ({ isAdmin: mocks.isAdmin, loading: false }),
}))
vi.mock('./usePhotoComments', () => ({
  usePhotoComments: () => mocks.commentsQuery,
  useCreatePhotoComment: () => mocks.createComment,
  useDeletePhotoComment: () => mocks.deleteComment,
}))

import { PhotoComments } from './PhotoComments'

function comment(overrides: Partial<PhotoComment> = {}): PhotoComment {
  return {
    id: 'comment-1',
    photo_id: 'photo-1',
    user_id: 'member-id',
    body: 'Flot billede!',
    created_at: '2026-08-23T12:00:00.000Z',
    author: { full_name: 'Alice' },
    ...overrides,
  }
}

beforeEach(() => {
  mocks.userId = 'member-id'
  mocks.isAdmin = false
  mocks.commentsQuery.data = []
  mocks.commentsQuery.isLoading = false
  mocks.commentsQuery.isError = false
  mocks.commentsQuery.isSuccess = true
  mocks.createComment.mutate.mockReset()
  mocks.createComment.isPending = false
  mocks.deleteComment.mutate.mockReset()
  mocks.deleteComment.isPending = false
  mocks.deleteComment.variables = undefined
})

afterEach(cleanup)

describe('PhotoComments', () => {
  it('shows an empty state when there are no comments yet', () => {
    render(<PhotoComments photoId="photo-1" />)

    expect(screen.getByText('Ingen kommentarer endnu.')).toBeTruthy()
  })

  it('lists comments with the author name', () => {
    mocks.commentsQuery.data = [comment()]
    render(<PhotoComments photoId="photo-1" />)

    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Flot billede!')).toBeTruthy()
  })

  it('falls back to "Medlem" for a comment without an author name', () => {
    mocks.userId = 'someone-else'
    mocks.commentsQuery.data = [comment({ author: null })]
    render(<PhotoComments photoId="photo-1" />)

    expect(screen.getByText('Medlem')).toBeTruthy()
  })

  it('submits a new comment and clears the field on success', () => {
    mocks.createComment.mutate.mockImplementation((_vars, options) => {
      options?.onSuccess?.()
    })
    render(<PhotoComments photoId="photo-1" />)

    const textarea = screen.getByLabelText('Skriv en kommentar')
    fireEvent.change(textarea, { target: { value: 'Flot!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(mocks.createComment.mutate).toHaveBeenCalledWith(
      { photoId: 'photo-1', body: 'Flot!' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    expect((textarea as HTMLTextAreaElement).value).toBe('')
  })

  it('disables the send button while the field is empty', () => {
    render(<PhotoComments photoId="photo-1" />)

    expect(
      screen.getByRole('button', { name: 'Send' }).hasAttribute('disabled'),
    ).toBe(true)
  })

  it('reports an error when the comment could not be saved', () => {
    mocks.createComment.mutate.mockImplementation((_vars, options) => {
      options?.onError?.()
    })
    render(<PhotoComments photoId="photo-1" />)

    fireEvent.change(screen.getByLabelText('Skriv en kommentar'), {
      target: { value: 'Flot!' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(
      screen.getByText('Kommentaren kunne ikke gemmes. Prøv igen.'),
    ).toBeTruthy()
  })

  it('allows the author to delete their own comment', () => {
    mocks.commentsQuery.data = [comment()]
    render(<PhotoComments photoId="photo-1" />)

    const deleteButton = screen.getByRole('button', {
      name: 'Slet kommentar fra Alice',
    })
    fireEvent.click(deleteButton)

    expect(mocks.deleteComment.mutate).toHaveBeenCalledWith(
      { commentId: 'comment-1', photoId: 'photo-1' },
      expect.objectContaining({ onError: expect.any(Function) }),
    )
  })

  it('hides the delete button from members who neither wrote it nor are admin', () => {
    mocks.userId = 'someone-else'
    mocks.commentsQuery.data = [comment()]
    render(<PhotoComments photoId="photo-1" />)

    expect(
      screen.queryByRole('button', { name: 'Slet kommentar fra Alice' }),
    ).toBeNull()
  })

  it("allows an admin to delete someone else's comment", () => {
    mocks.userId = 'someone-else'
    mocks.isAdmin = true
    mocks.commentsQuery.data = [comment()]
    render(<PhotoComments photoId="photo-1" />)

    expect(
      screen.getByRole('button', { name: 'Slet kommentar fra Alice' }),
    ).toBeTruthy()
  })

  it('reports an error when a deletion fails', () => {
    mocks.commentsQuery.data = [comment()]
    mocks.deleteComment.mutate.mockImplementation((_vars, options) => {
      options?.onError?.()
    })
    render(<PhotoComments photoId="photo-1" />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Slet kommentar fra Alice' }),
    )

    expect(
      screen.getByText('Kommentaren kunne ikke slettes. Prøv igen.'),
    ).toBeTruthy()
  })
})
