import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto'

const CLOAK_MARKER = '# CLOAK: ENCRYPTED'
const PAYLOAD_VERSION = 1

type EncryptedPayload = {
  version: 1
  alg: 'aes-256-gcm'
  kdf: 'scrypt'
  salt: string
  iv: string
  tag: string
  ciphertext: string
}

function ensureString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid Cloak payload: ${field}`)
  }

  return value
}

function parsePayload(encodedText: string): EncryptedPayload {
  const [marker, jsonLine = ''] = encodedText.split(/\r?\n/, 2)

  if (marker !== CLOAK_MARKER) {
    throw new Error('File is not protected by Cloak')
  }

  let payload: unknown
  try {
    payload = JSON.parse(jsonLine)
  } catch {
    throw new Error('Invalid Cloak payload')
  }

  if (typeof payload !== 'object' || payload === null) {
    throw new Error('Invalid Cloak payload')
  }

  const raw = payload as Record<string, unknown>

  if (raw.version !== PAYLOAD_VERSION || raw.alg !== 'aes-256-gcm' || raw.kdf !== 'scrypt') {
    throw new Error('Invalid Cloak payload')
  }

  return {
    version: 1,
    alg: 'aes-256-gcm',
    kdf: 'scrypt',
    salt: ensureString(raw.salt, 'salt'),
    iv: ensureString(raw.iv, 'iv'),
    tag: ensureString(raw.tag, 'tag'),
    ciphertext: ensureString(raw.ciphertext, 'ciphertext'),
  }
}

function deriveFileKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, 32)
}

function encodeTextFile(plainText: string, password: string): string {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = deriveFileKey(password, salt)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  const payload: EncryptedPayload = {
    version: PAYLOAD_VERSION,
    alg: 'aes-256-gcm',
    kdf: 'scrypt',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }

  return `${CLOAK_MARKER}\n${JSON.stringify(payload)}`
}

function decodeTextFile(encodedText: string, password: string): string {
  const payload = parsePayload(encodedText)
  const key = deriveFileKey(password, Buffer.from(payload.salt, 'base64'))
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'))

  try {
    const plain = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, 'base64')),
      decipher.final(),
    ])
    return plain.toString('utf8')
  } catch {
    throw new Error('Wrong password')
  }
}

function main() {
  const password = 'demo123'
  const originalText = [
    'hello from cloak',
    'this example is fully self-contained',
    'it does not import from the cloak source tree',
  ].join('\n') + '\n'

  const encodedText = encodeTextFile(originalText, password)
  const decodedText = decodeTextFile(encodedText, password)

  console.log('--- original ---')
  console.log(originalText)

  console.log('--- encoded ---')
  console.log(encodedText)

  console.log('--- decoded ---')
  console.log(decodedText)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
