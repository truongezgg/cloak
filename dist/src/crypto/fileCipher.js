import { createCipheriv, createDecipheriv, randomBytes, scryptSync, } from 'node:crypto';
import { CLOAK_MARKER, PAYLOAD_VERSION } from '../constants.js';
import { firstLineMatchesMarker } from '../files/readFileState.js';
const PAYLOAD_ERROR = new Error('Invalid Cloak payload');
function ensureString(value) {
    if (typeof value !== 'string') {
        throw PAYLOAD_ERROR;
    }
    return value;
}
function ensureBase64(value) {
    if (value.length === 0) {
        throw PAYLOAD_ERROR;
    }
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
        throw PAYLOAD_ERROR;
    }
    try {
        Buffer.from(value, 'base64');
        return value;
    }
    catch {
        throw PAYLOAD_ERROR;
    }
}
function validatePayload(payload) {
    if (payload == null) {
        throw PAYLOAD_ERROR;
    }
    const version = payload.version;
    const alg = payload.alg;
    const kdf = payload.kdf;
    if (version !== PAYLOAD_VERSION || alg !== 'aes-256-gcm' || kdf !== 'scrypt') {
        throw PAYLOAD_ERROR;
    }
    const salt = ensureBase64(ensureString(payload.salt));
    const iv = ensureBase64(ensureString(payload.iv));
    const tag = ensureBase64(ensureString(payload.tag));
    const ciphertext = ensureBase64(ensureString(payload.ciphertext));
    return { version, alg, kdf, salt, iv, tag, ciphertext };
}
export function detectEncodedText(text) {
    return firstLineMatchesMarker(text);
}
function deriveFileKey(password, salt) {
    return scryptSync(password, salt, 32);
}
export async function encodeTextFile(plainText, password) {
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = deriveFileKey(password, salt);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const payload = {
        version: PAYLOAD_VERSION,
        alg: 'aes-256-gcm',
        kdf: 'scrypt',
        salt: salt.toString('base64'),
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        ciphertext: ciphertext.toString('base64'),
    };
    return `${CLOAK_MARKER}\n${JSON.stringify(payload)}`;
}
function parsePayload(encodedText) {
    const [, jsonLine = ''] = encodedText.split(/\r?\n/, 2);
    try {
        const parsed = JSON.parse(jsonLine);
        return validatePayload(parsed);
    }
    catch (error) {
        if (error === PAYLOAD_ERROR) {
            throw error;
        }
        throw PAYLOAD_ERROR;
    }
}
export async function decodeTextFile(encodedText, password) {
    if (!firstLineMatchesMarker(encodedText)) {
        throw new Error('File is not protected by Cloak');
    }
    const payload = parsePayload(encodedText);
    const key = deriveFileKey(password, Buffer.from(payload.salt, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    try {
        const plain = Buffer.concat([
            decipher.update(Buffer.from(payload.ciphertext, 'base64')),
            decipher.final(),
        ]);
        return plain.toString('utf8');
    }
    catch {
        throw new Error('Wrong password');
    }
}
