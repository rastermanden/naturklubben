import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { audioErrorMessage } from '../features/audio/audioErrors'
import {
  MAX_AUDIO_TITLE_LENGTH,
  defaultTitleFromFilename,
  formatAudioDate,
  formatFileSize,
  uploadMimeForFile,
  validateAudioFile,
  validateAudioTitle,
} from '../features/audio/audioValidation'

export default function AudioPage() {
  const clips = useQuery(api.audio.list, {})
  const generateUploadUrl = useMutation(api.audio.generateUploadUrl)
  const createClip = useMutation(api.audio.createClip)
  const deleteClip = useMutation(api.audio.deleteClip)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [lastAutoTitle, setLastAutoTitle] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadNotice, setUploadNotice] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<Id<'audioClips'> | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setUploadError(null)
    setUploadNotice(null)
    const file = event.target.files?.[0] ?? null
    if (file === null) {
      setSelectedFile(null)
      return
    }

    const validationError = validateAudioFile(file)
    if (validationError !== null) {
      setSelectedFile(null)
      setUploadError(validationError)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }

    setSelectedFile(file)
    const suggested = defaultTitleFromFilename(file.name)
    if (title.trim() === '' || title === lastAutoTitle) {
      setTitle(suggested)
      setLastAutoTitle(suggested)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setUploadError(null)
    setUploadNotice(null)

    if (selectedFile === null) {
      setUploadError('Vælg en mp3-fil først.')
      return
    }

    const fileError = validateAudioFile(selectedFile)
    if (fileError !== null) {
      setUploadError(fileError)
      return
    }

    const resolvedTitle =
      title.trim() || defaultTitleFromFilename(selectedFile.name)
    const titleError = validateAudioTitle(resolvedTitle)
    if (titleError !== null) {
      setUploadError(titleError)
      return
    }

    setUploading(true)
    try {
      const { uploadUrl } = await generateUploadUrl({})
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': uploadMimeForFile(selectedFile) },
        body: selectedFile,
      })
      if (!response.ok) {
        throw new Error('AUDIO_UPLOAD_NOT_FOUND')
      }
      const payload = (await response.json()) as {
        storageId?: Id<'_storage'>
      }
      if (!payload.storageId) {
        throw new Error('AUDIO_UPLOAD_NOT_FOUND')
      }

      const result = await createClip({
        storageId: payload.storageId,
        title: resolvedTitle,
      })
      if (!result.ok) {
        setUploadError(
          audioErrorMessage(
            result.error,
            'Lydfilen kunne ikke lægges op. Prøv igen.',
          ),
        )
        return
      }

      setSelectedFile(null)
      setTitle('')
      setLastAutoTitle('')
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      setUploadNotice('Lydfilen er lagt op.')
    } catch (cause) {
      setUploadError(
        audioErrorMessage(cause, 'Lydfilen kunne ikke lægges op. Prøv igen.'),
      )
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(clipId: Id<'audioClips'>, clipTitle: string) {
    if (!window.confirm(`Vil du slette "${clipTitle}"?`)) {
      return
    }
    setDeleteError(null)
    setDeletingId(clipId)
    try {
      await deleteClip({ clipId })
    } catch (cause) {
      setDeleteError(
        audioErrorMessage(cause, 'Lydfilen kunne ikke slettes. Prøv igen.'),
      )
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink-body">Lyd</h1>
        <p className="mt-1 text-ink-subtle">
          Del og afspil mp3-filer i klubben.
        </p>
      </header>

      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="flex flex-col gap-4 rounded-xl border border-line-soft bg-surface p-4 shadow-sm sm:p-5"
      >
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="audio-file-input"
            className="text-sm font-medium text-ink-body"
          >
            Vælg mp3-fil
          </label>
          <input
            ref={fileInputRef}
            id="audio-file-input"
            type="file"
            accept=".mp3,audio/mpeg,audio/mp3"
            onChange={handleFileChange}
            disabled={uploading}
            className="min-h-11 w-full rounded-lg border border-line-strong px-3 py-2 text-base text-ink file:mr-3 file:rounded file:border-0 file:bg-surface-raised file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink-body"
          />
          <p className="text-xs text-ink-subtle">
            {selectedFile !== null
              ? `${selectedFile.name} (${formatFileSize(selectedFile.size)})`
              : 'Kun mp3-filer op til 15 MB.'}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="audio-title-input"
            className="text-sm font-medium text-ink-body"
          >
            Titel
          </label>
          <input
            id="audio-title-input"
            type="text"
            value={title}
            maxLength={MAX_AUDIO_TITLE_LENGTH}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Navn på lydfilen"
            disabled={uploading}
            className="min-h-11 w-full rounded-lg border border-line-strong px-3 py-2 text-base text-ink"
          />
        </div>

        {uploadError !== null && (
          <p role="alert" className="text-sm text-danger">
            {uploadError}
          </p>
        )}

        {uploadNotice !== null && (
          <p role="status" className="text-sm text-ink-muted">
            {uploadNotice}
          </p>
        )}

        <div>
          <button
            type="submit"
            disabled={uploading || selectedFile === null}
            className="min-h-11 w-full rounded-lg bg-accent-soft px-4 py-2 font-medium text-white disabled:opacity-60 sm:w-auto"
          >
            {uploading ? 'Lægger op…' : 'Læg op'}
          </button>
        </div>
      </form>

      {deleteError !== null && (
        <p role="alert" className="text-sm text-danger">
          {deleteError}
        </p>
      )}

      {clips === undefined && (
        <p className="text-ink-subtle">Henter lydfiler…</p>
      )}

      {clips !== undefined && clips.length === 0 && (
        <div className="rounded-xl border border-line-soft bg-surface px-4 py-12 text-center text-ink-subtle">
          Ingen lydfiler endnu. Læg den første mp3-fil op ovenfor.
        </div>
      )}

      {clips !== undefined && clips.length > 0 && (
        <ul aria-label="Lydfiler" className="flex flex-col gap-3">
          {clips.map((clip) => (
            <li
              key={clip.id}
              className="flex min-w-0 flex-col gap-3 rounded-xl border border-line-soft bg-surface p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="break-words text-base font-semibold text-ink">
                    {clip.title}
                  </h2>
                  <p className="mt-0.5 text-sm text-ink-subtle">
                    {clip.uploaderName}
                    {' · '}
                    <time dateTime={new Date(clip.createdAt).toISOString()}>
                      {formatAudioDate(clip.createdAt)}
                    </time>
                    {' · '}
                    {formatFileSize(clip.sizeBytes)}
                  </p>
                </div>

                {clip.canDelete && (
                  <button
                    type="button"
                    onClick={() => void handleDelete(clip.id, clip.title)}
                    disabled={deletingId === clip.id}
                    className="min-h-11 shrink-0 rounded-lg border border-danger-line px-3 text-sm text-danger-strong disabled:opacity-60"
                  >
                    {deletingId === clip.id ? 'Sletter…' : 'Slet'}
                  </button>
                )}
              </div>

              {clip.audioUrl !== null ? (
                <audio
                  controls
                  preload="metadata"
                  src={clip.audioUrl}
                  aria-label={`Afspil ${clip.title}`}
                  className="w-full max-w-full"
                />
              ) : (
                <p className="text-sm text-ink-subtle">
                  Lydfilen kan ikke hentes lige nu.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
