export type VideoCompressionErrorCode =
  | 'UNSUPPORTED_BROWSER'
  | 'CANCELLED'
  | 'DECODE_FAILED'
  | 'TOO_LONG'
  | 'STILL_TOO_LARGE'
  | 'ENCODE_FAILED'
  | 'INTERRUPTED_HIDDEN'

export class VideoCompressionError extends Error {
  readonly code: VideoCompressionErrorCode

  constructor(code: VideoCompressionErrorCode, message: string) {
    super(message)
    this.name = 'VideoCompressionError'
    this.code = code
  }
}

export function isVideoCompressionError(
  value: unknown,
): value is VideoCompressionError {
  return (
    value instanceof VideoCompressionError ||
    (value instanceof Error &&
      value.name === 'VideoCompressionError' &&
      typeof (value as { code?: unknown }).code === 'string')
  )
}

export function createCompressionError(
  code: VideoCompressionErrorCode,
  fileName: string,
): VideoCompressionError {
  switch (code) {
    case 'UNSUPPORTED_BROWSER':
      return new VideoCompressionError(
        code,
        `${fileName} er over 95 MB, og din browser kan ikke komprimere videoer. Vælg en video på højst 95 MB.`,
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
        `${fileName} er for lang til at komme under 95 MB og blev ikke lagt op. Prøv et kortere klip.`,
      )
    case 'STILL_TOO_LARGE':
      return new VideoCompressionError(
        code,
        `${fileName} var stadig over 95 MB efter komprimering og blev ikke lagt op. Prøv et kortere klip.`,
      )
    case 'ENCODE_FAILED':
      return new VideoCompressionError(
        code,
        `${fileName} kunne ikke komprimeres og blev ikke lagt op. Prøv igen eller vælg en kortere video.`,
      )
    case 'INTERRUPTED_HIDDEN':
      return new VideoCompressionError(
        code,
        'Komprimeringen stoppede, fordi skærmen slukkede eller appen blev lukket. Prøv igen og hold skærmen tændt.',
      )
  }
}
