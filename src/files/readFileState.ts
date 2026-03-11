import { CLOAK_MARKER } from '../constants.js'

const utf8Decoder = new TextDecoder('utf-8', { fatal: true })

export function firstLineMatchesMarker(text: string): boolean {
  const firstLine = text.split('\n', 1)[0]?.replace(/\r$/, '') ?? ''
  return firstLine === CLOAK_MARKER
}

export function decodeUtf8Text(buffer: Uint8Array): string {
  return utf8Decoder.decode(buffer)
}

export function isLikelyTextBuffer(buffer: Uint8Array): boolean {
  return !buffer.includes(0)
}
