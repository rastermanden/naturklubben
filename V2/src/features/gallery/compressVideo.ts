import {
  ALLOWED_VIDEO_MIME_TYPES,
  MAX_VIDEO_BYTES,
  normalizeMime,
} from './galleryMedia'

/**
 * Mål-størrelse for komprimerede videoer: 42 MB giver plads til muxer-overhead
 * og VBR-udsving, så det færdige resultat sikkert holder sig under 50 MB.
 */
export const TARGET_OUTPUT_BYTES = 42 * 1024 * 1024
export const MAX_VIDEO_BITRATE = 2_500_000
export const MIN_VIDEO_BITRATE = 150_000
export const FALLBACK_VIDEO_BITRATE = 1_500_000

const DEFAULT_METADATA_TIMEOUT_MS = 15_000
const AUDIO_RESUME_TIMEOUT_MS = 300
const RECORDER_TIMESLICE_MS = 1000

export type VideoCompressionErrorCode =
  | 'UNSUPPORTED_BROWSER'
  | 'CANCELLED'
  | 'DECODE_FAILED'
  | 'TOO_LONG'
  | 'STILL_TOO_LARGE'
  | 'ENCODE_FAILED'

export class VideoCompressionError extends Error {
  readonly code: VideoCompressionErrorCode

  constructor(code: VideoCompressionErrorCode, message: string) {
    super(message)
    this.name = 'VideoCompressionError'
    this.code = code
  }
}

export interface VideoCompressionProgress {
  phase: 'preparing' | 'compressing'
  progress: number | null
}

export interface CompressionPlan {
  width: number
  height: number
  fps: number
  videoBitsPerSecond: number
  audioBitsPerSecond: number
}

interface CompressionPlanInput {
  srcWidth: number
  srcHeight: number
  durationSeconds: number | null
  hasAudio: boolean
  targetBytes?: number
}

type WindowWithWebkitAudio = typeof globalThis & {
  webkitAudioContext?: typeof AudioContext
}

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    callback: (now: number, metadata: unknown) => void,
  ) => number
  cancelVideoFrameCallback?: (handle: number) => void
}

function compressionError(
  code: VideoCompressionErrorCode,
  fileName: string,
): VideoCompressionError {
  switch (code) {
    case 'UNSUPPORTED_BROWSER':
      return new VideoCompressionError(
        code,
        `${fileName} er over 50 MB, og din browser kan ikke komprimere videoer. Vælg en video på højst 50 MB.`,
      )
    case 'CANCELLED':
      return new VideoCompressionError(
        code,
        `Komprimeringen af ${fileName} blev annulleret. Videoen blev ikke lagt op.`,
      )
    case 'DECODE_FAILED':
      return new VideoCompressionError(
        code,
        `${fileName} kunne ikke læses af browseren og blev ikke lagt op. Prøv en anden video eller optag som mp4.`,
      )
    case 'TOO_LONG':
      return new VideoCompressionError(
        code,
        `${fileName} er for lang til at komme under 50 MB og blev ikke lagt op. Prøv et kortere klip.`,
      )
    case 'STILL_TOO_LARGE':
      return new VideoCompressionError(
        code,
        `${fileName} var stadig over 50 MB efter komprimering og blev ikke lagt op. Prøv et kortere klip.`,
      )
    case 'ENCODE_FAILED':
      return new VideoCompressionError(
        code,
        `${fileName} kunne ikke komprimeres og blev ikke lagt op. Prøv igen eller vælg en kortere video.`,
      )
  }
}

/**
 * Beregner mål-dimensioner der bevarer billedformat for både stående og
 * liggende videoer, aldrig opskalerer og altid runder ned til lige tal (>= 2),
 * da H.264/VP8/VP9-encodere kræver lige bredde og højde.
 */
export function computeCompressedDimensions(
  srcWidth: number,
  srcHeight: number,
  maxLongEdge: number,
  maxShortEdge: number,
): { width: number; height: number } {
  if (
    srcWidth <= 0 ||
    srcHeight <= 0 ||
    maxLongEdge <= 0 ||
    maxShortEdge <= 0
  ) {
    throw new Error('VIDEO_DIMENSIONS')
  }
  const isPortrait = srcHeight > srcWidth
  const longEdge = isPortrait ? srcHeight : srcWidth
  const shortEdge = isPortrait ? srcWidth : srcHeight
  const scale = Math.min(1, maxLongEdge / longEdge, maxShortEdge / shortEdge)
  return {
    width: Math.max(2, Math.floor((srcWidth * scale) / 2) * 2),
    height: Math.max(2, Math.floor((srcHeight * scale) / 2) * 2),
  }
}

/**
 * Beregner opløsning, billedhastighed og bitrate ud fra videolængde så
 * slutresultatet holder sig under 50 MB. Returnerer `null`, hvis klippet er
 * for langt til at ramme en brugbar bitrate inden for loftet.
 */
export function computeCompressionPlan({
  srcWidth,
  srcHeight,
  durationSeconds,
  hasAudio,
  targetBytes = TARGET_OUTPUT_BYTES,
}: CompressionPlanInput): CompressionPlan | null {
  let videoBitsPerSecond: number
  let audioBitsPerSecond: number

  if (
    durationSeconds !== null &&
    Number.isFinite(durationSeconds) &&
    durationSeconds > 0
  ) {
    const totalBps = Math.floor((targetBytes * 8) / durationSeconds)
    audioBitsPerSecond = !hasAudio
      ? 0
      : totalBps >= 1_500_000
        ? 128_000
        : totalBps >= 600_000
          ? 96_000
          : 64_000
    const rawVideoBps = totalBps - audioBitsPerSecond
    if (rawVideoBps < MIN_VIDEO_BITRATE) {
      return null
    }
    videoBitsPerSecond = Math.min(MAX_VIDEO_BITRATE, rawVideoBps)
  } else {
    audioBitsPerSecond = hasAudio ? 96_000 : 0
    videoBitsPerSecond = FALLBACK_VIDEO_BITRATE
  }

  let maxLongEdge = 640
  let maxShortEdge = 360
  let fps = 24
  if (videoBitsPerSecond >= 700_000) {
    maxLongEdge = 1280
    maxShortEdge = 720
    fps = 30
  } else if (videoBitsPerSecond >= 350_000) {
    maxLongEdge = 854
    maxShortEdge = 480
    fps = 24
  }

  const { width, height } = computeCompressedDimensions(
    srcWidth,
    srcHeight,
    maxLongEdge,
    maxShortEdge,
  )

  return {
    width,
    height,
    fps,
    videoBitsPerSecond,
    audioBitsPerSecond,
  }
}

const RECORDER_MIME_WITH_AUDIO = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
] as const

const RECORDER_MIME_VIDEO_ONLY = [
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
] as const

export function selectRecorderMimeType(
  hasAudio: boolean,
  isTypeSupported?: (mime: string) => boolean,
): string | null {
  const check =
    isTypeSupported ??
    (typeof MediaRecorder !== 'undefined' &&
    typeof MediaRecorder.isTypeSupported === 'function'
      ? (mime: string) => MediaRecorder.isTypeSupported(mime)
      : () => false)

  const candidates = hasAudio
    ? RECORDER_MIME_WITH_AUDIO
    : RECORDER_MIME_VIDEO_ONLY

  for (const candidate of candidates) {
    if (!ALLOWED_VIDEO_MIME_TYPES.has(normalizeMime(candidate))) continue
    try {
      if (check(candidate)) return candidate
    } catch {
      // Ignorér platformfejl fra isTypeSupported og prøv næste kandidat.
    }
  }
  return null
}

export function compressedFileName(
  originalName: string,
  outputMime: string,
): string {
  const baseMime = normalizeMime(outputMime)
  const ext = baseMime === 'video/webm' ? '.webm' : '.mp4'
  const trimmed = originalName.trim() || 'video'
  const stem = trimmed.replace(/\.[^/.]+$/, '') || 'video'
  return `${stem}${ext}`
}

export function canCompressVideoInBrowser(): boolean {
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function' ||
    typeof URL.revokeObjectURL !== 'function' ||
    typeof MediaRecorder === 'undefined' ||
    typeof MediaRecorder.isTypeSupported !== 'function' ||
    typeof HTMLCanvasElement === 'undefined' ||
    typeof HTMLCanvasElement.prototype.captureStream !== 'function'
  ) {
    return false
  }
  return selectRecorderMimeType(false) !== null
}

function createMediaRecorder(
  stream: MediaStream,
  mimeType: string,
  videoBitsPerSecond: number,
  audioBitsPerSecond: number,
): MediaRecorder {
  const attempts: MediaRecorderOptions[] = [
    {
      mimeType,
      videoBitsPerSecond,
      ...(audioBitsPerSecond > 0 ? { audioBitsPerSecond } : {}),
    },
    {
      mimeType,
      bitsPerSecond: videoBitsPerSecond + audioBitsPerSecond,
    },
    { mimeType },
  ]

  let lastError: unknown
  for (const options of attempts) {
    try {
      return new MediaRecorder(stream, options)
    } catch (caught) {
      lastError = caught
    }
  }
  throw lastError instanceof Error ? lastError : new Error('RECORDER_INIT')
}

async function waitForVideoMetadata(
  video: HTMLVideoElement,
  objectUrl: string,
  timeoutMs: number,
  fileName: string,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) {
    throw compressionError('CANCELLED', fileName)
  }

  return await new Promise<void>((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const cleanup = () => {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      video.removeEventListener('loadedmetadata', onMetadata)
      video.removeEventListener('loadeddata', onFrameReady)
      video.removeEventListener('canplay', onFrameReady)
      video.removeEventListener('error', onError)
      signal?.removeEventListener('abort', onAbort)
    }

    const finishResolve = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }

    const finishReject = (code: VideoCompressionErrorCode) => {
      if (settled) return
      settled = true
      cleanup()
      reject(compressionError(code, fileName))
    }

    const onAbort = () => finishReject('CANCELLED')
    const onError = () => finishReject('DECODE_FAILED')

    const onFrameReady = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        finishResolve()
      } else {
        finishReject('DECODE_FAILED')
      }
    }

    const onMetadata = () => {
      if (video.readyState >= 2) {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          finishResolve()
        } else {
          finishReject('DECODE_FAILED')
        }
      }
    }

    timer = setTimeout(() => finishReject('DECODE_FAILED'), timeoutMs)
    signal?.addEventListener('abort', onAbort, { once: true })
    video.addEventListener('loadedmetadata', onMetadata)
    video.addEventListener('loadeddata', onFrameReady)
    video.addEventListener('canplay', onFrameReady)
    video.addEventListener('error', onError)

    video.src = objectUrl
    try {
      video.load?.()
    } catch {
      // Ignorér i miljøer uden fuld medieimplementering.
    }
  })
}

async function setupSilentAudioCapture(video: HTMLVideoElement): Promise<{
  audioCtx: AudioContext | null
  audioSource: MediaElementAudioSourceNode | null
  audioDestination: MediaStreamAudioDestinationNode | null
  audioTracks: MediaStreamTrack[]
}> {
  const AudioCtx =
    typeof AudioContext !== 'undefined'
      ? AudioContext
      : (globalThis as WindowWithWebkitAudio).webkitAudioContext
  if (!AudioCtx) {
    return {
      audioCtx: null,
      audioSource: null,
      audioDestination: null,
      audioTracks: [],
    }
  }

  let audioCtx: AudioContext | null = null
  try {
    audioCtx = new AudioCtx()
    if (
      audioCtx.state === 'suspended' &&
      typeof audioCtx.resume === 'function'
    ) {
      await Promise.race([
        audioCtx.resume(),
        new Promise<void>((resolve) =>
          setTimeout(resolve, AUDIO_RESUME_TIMEOUT_MS),
        ),
      ])
    }
    if (audioCtx.state !== 'running') {
      void audioCtx.close().catch(() => undefined)
      return {
        audioCtx: null,
        audioSource: null,
        audioDestination: null,
        audioTracks: [],
      }
    }

    const audioSource = audioCtx.createMediaElementSource(video)
    const audioDestination = audioCtx.createMediaStreamDestination()
    // Forbind kun til MediaStreamDestination (aldrig audioCtx.destination),
    // så telefonen ikke afspiller videoens lyd højt under komprimering.
    audioSource.connect(audioDestination)
    const audioTracks = audioDestination.stream.getAudioTracks()
    if (audioTracks.length === 0) {
      audioSource.disconnect()
      void audioCtx.close().catch(() => undefined)
      return {
        audioCtx: null,
        audioSource: null,
        audioDestination: null,
        audioTracks: [],
      }
    }
    return { audioCtx, audioSource, audioDestination, audioTracks }
  } catch {
    if (audioCtx) {
      void audioCtx.close().catch(() => undefined)
    }
    return {
      audioCtx: null,
      audioSource: null,
      audioDestination: null,
      audioTracks: [],
    }
  }
}

function stopTracksFromStreams(
  streams: Array<MediaStream | null | undefined>,
): void {
  for (const stream of streams) {
    if (!stream) continue
    for (const track of stream.getTracks()) {
      try {
        track.stop()
      } catch {
        // Ignorér fejl ved oprydning af spor.
      }
    }
  }
}

/**
 * Komprimerer en videofil i browseren via `<video>` + `<canvas>` +
 * `MediaRecorder`. Læser inputtet strømmende via `URL.createObjectURL` og
 * indlæser aldrig hele kildefilen i hukommelsen.
 */
export async function compressVideoFile(
  file: File,
  options?: {
    signal?: AbortSignal
    onProgress?: (progress: VideoCompressionProgress) => void
    metadataTimeoutMs?: number
  },
): Promise<File> {
  const signal = options?.signal
  const onProgress = options?.onProgress

  if (signal?.aborted) {
    throw compressionError('CANCELLED', file.name)
  }
  if (!canCompressVideoInBrowser()) {
    throw compressionError('UNSUPPORTED_BROWSER', file.name)
  }

  onProgress?.({ phase: 'preparing', progress: null })

  const objectUrl = URL.createObjectURL(file)
  const video = document.createElement('video') as VideoWithFrameCallback
  video.playsInline = true
  video.setAttribute('playsinline', '')
  video.setAttribute('webkit-playsinline', '')
  video.preload = 'auto'
  video.muted = true
  video.style.position = 'fixed'
  video.style.left = '-9999px'
  video.style.top = '0'
  video.style.width = '1px'
  video.style.height = '1px'
  video.style.opacity = '0.001'
  video.style.pointerEvents = 'none'
  video.setAttribute('aria-hidden', 'true')
  document.body?.appendChild(video)

  let audioCtx: AudioContext | null = null
  let audioSource: MediaElementAudioSourceNode | null = null
  let audioDestination: MediaStreamAudioDestinationNode | null = null
  let audioTracks: MediaStreamTrack[] = []
  let canvasStream: MediaStream | null = null
  let combinedStream: MediaStream | null = null
  const encodingState: {
    activeRecorder: MediaRecorder | null
    stopPump: (() => void) | null
  } = {
    activeRecorder: null,
    stopPump: null,
  }

  const teardownAudio = () => {
    stopTracksFromStreams([audioDestination?.stream])
    audioTracks = []
    try {
      audioSource?.disconnect()
    } catch {
      // Ignorér.
    }
    audioSource = null
    audioDestination = null
    if (audioCtx) {
      try {
        void audioCtx.close()
      } catch {
        // Ignorér.
      }
      audioCtx = null
    }
  }

  try {
    await waitForVideoMetadata(
      video,
      objectUrl,
      options?.metadataTimeoutMs ?? DEFAULT_METADATA_TIMEOUT_MS,
      file.name,
      signal,
    )

    if (signal?.aborted) {
      throw compressionError('CANCELLED', file.name)
    }

    const durationSeconds =
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : null

    const audioCapture = await setupSilentAudioCapture(video)
    audioCtx = audioCapture.audioCtx
    audioSource = audioCapture.audioSource
    audioDestination = audioCapture.audioDestination
    audioTracks = audioCapture.audioTracks

    let hasAudio = audioTracks.length > 0
    video.muted = !hasAudio

    let plan = computeCompressionPlan({
      srcWidth: video.videoWidth,
      srcHeight: video.videoHeight,
      durationSeconds,
      hasAudio,
    })
    if (plan === null) {
      throw compressionError('TOO_LONG', file.name)
    }

    let chosenMime = selectRecorderMimeType(hasAudio)
    if (chosenMime === null && hasAudio) {
      teardownAudio()
      hasAudio = false
      video.muted = true
      plan = computeCompressionPlan({
        srcWidth: video.videoWidth,
        srcHeight: video.videoHeight,
        durationSeconds,
        hasAudio: false,
      })
      if (plan === null) {
        throw compressionError('TOO_LONG', file.name)
      }
      chosenMime = selectRecorderMimeType(false)
    }

    if (chosenMime === null) {
      throw compressionError('UNSUPPORTED_BROWSER', file.name)
    }

    const canvas = document.createElement('canvas')
    canvas.width = plan.width
    canvas.height = plan.height
    const context = canvas.getContext('2d')
    if (context === null) {
      throw compressionError('ENCODE_FAILED', file.name)
    }

    const drawFrame = () => {
      if (plan === null) return
      try {
        context.drawImage(video, 0, 0, plan.width, plan.height)
      } catch {
        // Ignorér midlertidige tegnefejl før første frame er klar.
      }
    }

    drawFrame()
    canvasStream = canvas.captureStream(plan.fps)

    const buildStreamForPass = (includeAudio: boolean): MediaStream => {
      if (
        includeAudio &&
        audioTracks.length > 0 &&
        typeof MediaStream !== 'undefined' &&
        canvasStream
      ) {
        return new MediaStream([
          ...canvasStream.getVideoTracks(),
          ...audioTracks,
        ])
      }
      return canvasStream!
    }

    const runEncodingPass = async (
      passPlan: CompressionPlan,
      passMime: string,
      includeAudio: boolean,
    ): Promise<File> => {
      combinedStream = buildStreamForPass(includeAudio)
      const recorder = createMediaRecorder(
        combinedStream,
        passMime,
        passPlan.videoBitsPerSecond,
        passPlan.audioBitsPerSecond,
      )
      encodingState.activeRecorder = recorder

      return await new Promise<File>((resolve, reject) => {
        const chunks: Blob[] = []
        let recordedBytes = 0
        let lastReportedPct = -1
        let settled = false
        let aborted = false
        let oversizeAborted = false
        let videoEnded = false
        let rafId: number | null = null
        let rvfcId: number | null = null

        const reportProgress = (ratio: number | null) => {
          if (ratio === null) {
            if (lastReportedPct === -1) {
              lastReportedPct = -2
              onProgress?.({ phase: 'compressing', progress: null })
            }
            return
          }
          const clamped = Math.max(0, Math.min(0.99, ratio))
          const pct = Math.floor(clamped * 100)
          if (pct > lastReportedPct) {
            lastReportedPct = pct
            onProgress?.({ phase: 'compressing', progress: pct / 100 })
          }
        }

        const updateProgressFromVideo = () => {
          if (durationSeconds !== null) {
            reportProgress(video.currentTime / durationSeconds)
          } else {
            reportProgress(null)
          }
        }

        const cancelFramePump = () => {
          if (rafId !== null && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(rafId)
            rafId = null
          }
          if (
            rvfcId !== null &&
            typeof video.cancelVideoFrameCallback === 'function'
          ) {
            try {
              video.cancelVideoFrameCallback(rvfcId)
            } catch {
              // Ignorér.
            }
            rvfcId = null
          }
        }
        encodingState.stopPump = cancelFramePump

        const pumpWithRaf = () => {
          if (settled || aborted || oversizeAborted) return
          drawFrame()
          updateProgressFromVideo()
          if (typeof requestAnimationFrame === 'function') {
            rafId = requestAnimationFrame(pumpWithRaf)
          }
        }

        const pumpWithRvfc = () => {
          if (settled || aborted || oversizeAborted) return
          drawFrame()
          updateProgressFromVideo()
          if (typeof video.requestVideoFrameCallback === 'function') {
            rvfcId = video.requestVideoFrameCallback(() => pumpWithRvfc())
          }
        }

        const cleanupListeners = () => {
          cancelFramePump()
          video.removeEventListener('ended', onEnded)
          video.removeEventListener('timeupdate', onTimeUpdate)
          video.removeEventListener('error', onVideoError)
          signal?.removeEventListener('abort', onAbort)
        }

        const settleReject = (err: Error) => {
          if (settled) return
          settled = true
          cleanupListeners()
          reject(err)
        }

        const settleResolve = (result: File) => {
          if (settled) return
          settled = true
          cleanupListeners()
          resolve(result)
        }

        const stopRecorderSafely = () => {
          try {
            if (recorder.state !== 'inactive') {
              recorder.stop()
            }
          } catch {
            // Ignorér hvis optageren allerede er stoppet.
          }
        }

        const onAbort = () => {
          aborted = true
          cancelFramePump()
          try {
            video.pause()
          } catch {
            // Ignorér.
          }
          stopRecorderSafely()
          settleReject(compressionError('CANCELLED', file.name))
        }

        const onVideoError = () => {
          cancelFramePump()
          stopRecorderSafely()
          settleReject(compressionError('DECODE_FAILED', file.name))
        }

        const onTimeUpdate = () => {
          if (settled || aborted || oversizeAborted) return
          drawFrame()
          updateProgressFromVideo()
        }

        const onEnded = () => {
          videoEnded = true
          cancelFramePump()
          drawFrame()
          stopRecorderSafely()
        }

        recorder.ondataavailable = (event: BlobEvent) => {
          if (settled || aborted || oversizeAborted) return
          if (!event.data || event.data.size <= 0) return
          recordedBytes += event.data.size
          if (recordedBytes > MAX_VIDEO_BYTES) {
            oversizeAborted = true
            cancelFramePump()
            try {
              video.pause()
            } catch {
              // Ignorér.
            }
            stopRecorderSafely()
            settleReject(compressionError('STILL_TOO_LARGE', file.name))
            return
          }
          chunks.push(event.data)
        }

        recorder.onerror = () => {
          cancelFramePump()
          try {
            video.pause()
          } catch {
            // Ignorér.
          }
          settleReject(compressionError('ENCODE_FAILED', file.name))
        }

        recorder.onstop = () => {
          if (settled) return
          if (aborted) {
            settleReject(compressionError('CANCELLED', file.name))
            return
          }
          if (oversizeAborted) {
            settleReject(compressionError('STILL_TOO_LARGE', file.name))
            return
          }
          if (!videoEnded && !video.ended) {
            settleReject(compressionError('ENCODE_FAILED', file.name))
            return
          }

          const rawMime = recorder.mimeType || passMime
          const normalizedMime = normalizeMime(rawMime)
          const outputMime = ALLOWED_VIDEO_MIME_TYPES.has(normalizedMime)
            ? normalizedMime
            : normalizeMime(passMime)

          if (!ALLOWED_VIDEO_MIME_TYPES.has(outputMime)) {
            settleReject(compressionError('ENCODE_FAILED', file.name))
            return
          }

          const outputBlob = new Blob(chunks, { type: outputMime })
          if (outputBlob.size <= 0) {
            settleReject(compressionError('ENCODE_FAILED', file.name))
            return
          }
          if (outputBlob.size > MAX_VIDEO_BYTES) {
            settleReject(compressionError('STILL_TOO_LARGE', file.name))
            return
          }

          onProgress?.({ phase: 'compressing', progress: 1 })
          const compressedFile = new File(
            [outputBlob],
            compressedFileName(file.name, outputMime),
            {
              type: outputMime,
              lastModified: file.lastModified,
            },
          )
          settleResolve(compressedFile)
        }

        video.addEventListener('ended', onEnded)
        video.addEventListener('timeupdate', onTimeUpdate)
        video.addEventListener('error', onVideoError)
        signal?.addEventListener('abort', onAbort, { once: true })

        if (signal?.aborted) {
          onAbort()
          return
        }

        try {
          recorder.start(RECORDER_TIMESLICE_MS)
        } catch {
          settleReject(compressionError('ENCODE_FAILED', file.name))
          return
        }

        updateProgressFromVideo()
        if (typeof video.requestVideoFrameCallback === 'function') {
          pumpWithRvfc()
        } else {
          pumpWithRaf()
        }

        void Promise.resolve(video.play()).catch((playError: unknown) => {
          cancelFramePump()
          try {
            recorder.ondataavailable = null
            recorder.onstop = null
            recorder.onerror = null
            if (recorder.state !== 'inactive') recorder.stop()
          } catch {
            // Ignorér.
          }
          settleReject(
            playError instanceof Error
              ? playError
              : compressionError('DECODE_FAILED', file.name),
          )
        })
      })
    }

    try {
      return await runEncodingPass(plan, chosenMime, hasAudio)
    } catch (caught) {
      if (caught instanceof VideoCompressionError) {
        throw caught
      }
      if (!hasAudio || signal?.aborted) {
        throw compressionError('DECODE_FAILED', file.name)
      }
      // Hvis browseren blokerer afspilning med lyd, falder vi tilbage til video uden lyd.
      teardownAudio()
      video.muted = true
      try {
        video.currentTime = 0
      } catch {
        // Ignorér hvis currentTime ikke kan nulstilles.
      }
      const fallbackPlan = computeCompressionPlan({
        srcWidth: video.videoWidth,
        srcHeight: video.videoHeight,
        durationSeconds,
        hasAudio: false,
      })
      if (fallbackPlan === null) {
        throw compressionError('TOO_LONG', file.name)
      }
      const fallbackMime = selectRecorderMimeType(false)
      if (fallbackMime === null) {
        throw compressionError('UNSUPPORTED_BROWSER', file.name)
      }
      try {
        return await runEncodingPass(fallbackPlan, fallbackMime, false)
      } catch (retryError) {
        if (retryError instanceof VideoCompressionError) {
          throw retryError
        }
        throw compressionError('DECODE_FAILED', file.name)
      }
    }
  } finally {
    encodingState.stopPump?.()
    const rec = encodingState.activeRecorder
    if (rec) {
      try {
        if (rec.state !== 'inactive') {
          rec.ondataavailable = null
          rec.onstop = null
          rec.onerror = null
          rec.stop()
        }
      } catch {
        // Ignorér oprydningsfejl.
      }
    }
    stopTracksFromStreams([combinedStream, canvasStream])
    teardownAudio()
    try {
      video.pause()
    } catch {
      // Ignorér.
    }
    video.removeAttribute('src')
    try {
      video.load?.()
    } catch {
      // Ignorér.
    }
    video.remove()
    URL.revokeObjectURL(objectUrl)
  }
}
