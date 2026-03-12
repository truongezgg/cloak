import { CLOAK_MARKER } from '../constants.js';
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
export function firstLineMatchesMarker(text) {
    const firstLine = text.split('\n', 1)[0]?.replace(/\r$/, '') ?? '';
    return firstLine === CLOAK_MARKER;
}
export function decodeUtf8Text(buffer) {
    return utf8Decoder.decode(buffer);
}
export function isLikelyTextBuffer(buffer) {
    return !buffer.includes(0);
}
