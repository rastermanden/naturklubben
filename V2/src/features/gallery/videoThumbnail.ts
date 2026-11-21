import { photoOutputSize, THUMB_MAX_EDGE } from './resizePhoto'

export interface VideoThumbnail {
  blob: Blob
  width: number
  height: number
}

const DEFAULT_THUMB_TIMEOUT_MS = 8000

function encodeCanvasJpeg(
  video: HTMLVideoElement,
  width: number,
  height: number,
): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (context === null) return Promise.resolve(null)
  try {
    context.drawImage(video, 0, 0, width, height)
  } catch {
    return Promise.resolve(null)
  }
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.82)
  })
}

/**
 * Fanger et stillbillede fra en videofil i browseren og skalerer det til
 * en JPEG-miniature. Returnerer `null`, hvis browseren ikke kan dekode videoen.
 */
export async function captureVideoThumbnail(
  file: Blob,
  options?: { maxEdge?: number; timeoutMs?: number },
): Promise<VideoThumbnail | null> {
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return null
  }

  const maxEdge = options?.maxEdge ?? THUMB_MAX_EDGE
  const timeoutMs = options?.timeoutMs ?? DEFAULT_THUMB_TIMEOUT_MS
  const objectUrl = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'

  try {
    const ready = await new Promise<boolean>((resolve) => {
      let settled = false
      let seekAttempted = false

      const finish = (ok: boolean) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        video.removeEventListener('loadedmetadata', onLoadedMetadata)
        video.removeEventListener('loadeddata', onFrameReady)
        video.removeEventListener('seeked', onFrameReady)
        video.removeEventListener('error', onError)
        resolve(ok)
      }

      const timer = setTimeout(() => finish(false), timeoutMs)
      const onError = () => finish(false)

      const onFrameReady = () => {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          finish(true)
        }
      }

      const onLoadedMetadata = () => {
        if (video.videoWidth <= 0 || video.videoHeight <= 0) {
          finish(false)
          return
        }
        if (video.readyState >= 2) {
          finish(true)
          return
        }
        if (!seekAttempted) {
          seekAttempted = true
          const duration = Number.isFinite(video.duration) ? video.duration : 0
          if (duration > 0) {
            try {
              video.currentTime = Math.min(0.1, duration / 4)
            } catch {
              // Nogle browsere tillader først seek efter loadeddata.
            }
          }
        }
      }

      video.addEventListener('loadedmetadata', onLoadedMetadata)
      video.addEventListener('loadeddata', onFrameReady)
      video.addEventListener('seeked', onFrameReady)
      video.addEventListener('error', onError)
      video.src = objectUrl
      try {
        video.load?.()
      } catch {
        // Ignorér i miljøer uden fuld medieimplementering.
      }
    })

    if (!ready || video.videoWidth <= 0 || video.videoHeight <= 0) {
      return null
    }

    const size = photoOutputSize(video.videoWidth, video.videoHeight, maxEdge)
    const blob = await encodeCanvasJpeg(video, size.width, size.height)
    if (blob === null) return null

    return { blob, width: size.width, height: size.height }
  } catch {
    return null
  } finally {
    video.removeAttribute('src')
    try {
      video.load?.()
    } catch {
      // Ignorér i miljøer uden fuld medieimplementering.
    }
    URL.revokeObjectURL(objectUrl)
  }
}
