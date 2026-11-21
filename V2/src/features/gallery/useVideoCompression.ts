import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_VIDEO_BYTES, validateGalleryFile } from './galleryMedia'
import { loadVideoCompressor } from './videoCompressionLoader'

export type VideoCompressionJobStatus = 'queued' | 'preparing' | 'compressing'

export interface VideoCompressionJob {
  id: string
  file: File
  caption: string
  eventId: string | null
  status: VideoCompressionJobStatus
  progress: number | null
}

export interface CompressedVideoReady {
  file: File
  caption: string
  eventId: string | null
}

interface UseVideoCompressionOptions {
  onCompressed: (ready: CompressedVideoReady) => void
  onError: (message: string) => void
}

/**
 * Sekventiel kø til klient-komprimering af store videoer (> 50 MB).
 * Modulet med komprimering (`compressVideo.ts`) lazy-loades først, når der
 * faktisk lægges en for stor video i kø.
 */
export function useVideoCompression({
  onCompressed,
  onError,
}: UseVideoCompressionOptions) {
  const [jobs, setJobs] = useState<VideoCompressionJob[]>([])
  const pendingJobsRef = useRef<VideoCompressionJob[]>([])
  const runningRef = useRef(false)
  const unmountedRef = useRef(false)
  const controllersRef = useRef<Map<string, AbortController>>(new Map())
  const cancelledIdsRef = useRef<Set<string>>(new Set())
  const onCompressedRef = useRef(onCompressed)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onCompressedRef.current = onCompressed
    onErrorRef.current = onError
  }, [onCompressed, onError])

  useEffect(() => {
    unmountedRef.current = false
    const controllers = controllersRef.current
    const cancelledIds = cancelledIdsRef.current
    return () => {
      unmountedRef.current = true
      for (const controller of controllers.values()) {
        controller.abort()
      }
      controllers.clear()
      cancelledIds.clear()
      pendingJobsRef.current = []
    }
  }, [])

  const processQueue = useCallback(async () => {
    if (runningRef.current) return
    runningRef.current = true
    try {
      while (!unmountedRef.current) {
        const nextJob = pendingJobsRef.current.shift()
        if (!nextJob) break

        if (cancelledIdsRef.current.has(nextJob.id)) {
          cancelledIdsRef.current.delete(nextJob.id)
          continue
        }

        const controller = new AbortController()
        controllersRef.current.set(nextJob.id, controller)
        setJobs((current) =>
          current.map((job) =>
            job.id === nextJob.id
              ? { ...job, status: 'preparing', progress: null }
              : job,
          ),
        )

        try {
          const { compressVideoFile } = await loadVideoCompressor()
          if (
            unmountedRef.current ||
            cancelledIdsRef.current.has(nextJob.id) ||
            controller.signal.aborted
          ) {
            if (!unmountedRef.current) {
              onErrorRef.current(
                `Komprimeringen af ${nextJob.file.name} blev annulleret. Videoen blev ikke lagt op.`,
              )
            }
            continue
          }

          const compressed = await compressVideoFile(nextJob.file, {
            signal: controller.signal,
            onProgress: ({ phase, progress }) => {
              if (unmountedRef.current) return
              setJobs((current) =>
                current.map((job) =>
                  job.id === nextJob.id
                    ? { ...job, status: phase, progress }
                    : job,
                ),
              )
            },
          })

          if (unmountedRef.current || controller.signal.aborted) {
            if (!unmountedRef.current) {
              onErrorRef.current(
                `Komprimeringen af ${nextJob.file.name} blev annulleret. Videoen blev ikke lagt op.`,
              )
            }
            continue
          }

          if (compressed.size > MAX_VIDEO_BYTES) {
            onErrorRef.current(
              `${nextJob.file.name} var stadig over 50 MB efter komprimering og blev ikke lagt op. Prøv et kortere klip.`,
            )
            continue
          }

          const validationError = validateGalleryFile(compressed)
          if (validationError !== null) {
            onErrorRef.current(validationError)
            continue
          }

          onCompressedRef.current({
            file: compressed,
            caption: nextJob.caption,
            eventId: nextJob.eventId,
          })
        } catch (caught) {
          if (!unmountedRef.current) {
            const message =
              caught instanceof Error && caught.message.trim() !== ''
                ? caught.message
                : `${nextJob.file.name} kunne ikke komprimeres og blev ikke lagt op. Prøv igen eller vælg en kortere video.`
            onErrorRef.current(message)
          }
        } finally {
          controllersRef.current.delete(nextJob.id)
          cancelledIdsRef.current.delete(nextJob.id)
          if (!unmountedRef.current) {
            setJobs((current) => current.filter((job) => job.id !== nextJob.id))
          }
        }
      }
    } finally {
      runningRef.current = false
    }
  }, [])

  const enqueueVideos = useCallback(
    (input: { files: File[]; caption: string; eventId: string | null }) => {
      if (input.files.length === 0) return
      const newJobs: VideoCompressionJob[] = input.files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        caption: input.caption,
        eventId: input.eventId,
        status: 'queued',
        progress: null,
      }))
      pendingJobsRef.current.push(...newJobs)
      setJobs((current) => [...current, ...newJobs])
      void processQueue()
    },
    [processQueue],
  )

  const cancelJob = useCallback((id: string) => {
    cancelledIdsRef.current.add(id)
    const controller = controllersRef.current.get(id)
    if (controller) {
      controller.abort()
      return
    }
    const pendingIndex = pendingJobsRef.current.findIndex(
      (job) => job.id === id,
    )
    if (pendingIndex >= 0) {
      const [removed] = pendingJobsRef.current.splice(pendingIndex, 1)
      cancelledIdsRef.current.delete(id)
      setJobs((current) => current.filter((job) => job.id !== id))
      if (removed) {
        onErrorRef.current(
          `Komprimeringen af ${removed.file.name} blev annulleret. Videoen blev ikke lagt op.`,
        )
      }
    }
  }, [])

  return { jobs, enqueueVideos, cancelJob }
}
