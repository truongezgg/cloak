import { randomBytes, timingSafeEqual as nodeTimingSafeEqual } from 'node:crypto'
import { argon2id } from 'hash-wasm'
import type { PasswordRecord } from '../app/types.js'

const KDF = {
  name: 'argon2id' as const,
  memoryCost: 64 * 1024,
  timeCost: 3,
  parallelism: 1,
  hashLength: 32,
  saltLength: 16,
}

type SafeEqualFn = (a: Buffer, b: Buffer) => boolean

const defaultSafeEqual: SafeEqualFn = (a, b) => nodeTimingSafeEqual(a, b)
let safeEqualImpl: SafeEqualFn = defaultSafeEqual

export function safeEqual(a: Buffer, b: Buffer): boolean {
  return safeEqualImpl(a, b)
}

export function setSafeEqual(fn: SafeEqualFn): void {
  safeEqualImpl = fn
}

export function resetSafeEqual(): void {
  safeEqualImpl = defaultSafeEqual
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

function fromBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'))
}

export async function createPasswordRecord(password: string): Promise<PasswordRecord> {
  const salt = randomBytes(KDF.saltLength)
  const hashHex = await argon2id({
    password,
    salt,
    parallelism: KDF.parallelism,
    iterations: KDF.timeCost,
    memorySize: KDF.memoryCost,
    hashLength: KDF.hashLength,
    outputType: 'hex',
  })

  return {
    passwordHash: Buffer.from(hashHex, 'hex').toString('base64'),
    salt: toBase64(salt),
    kdf: KDF,
  }
}

export async function verifyPassword(password: string, record: PasswordRecord): Promise<boolean> {
  const hashHex = await argon2id({
    password,
    salt: fromBase64(record.salt),
    parallelism: record.kdf.parallelism,
    iterations: record.kdf.timeCost,
    memorySize: record.kdf.memoryCost,
    hashLength: record.kdf.hashLength,
    outputType: 'hex',
  })

  const actual = Buffer.from(hashHex, 'hex')
  const expected = Buffer.from(record.passwordHash, 'base64')
  const targetLength = Math.max(actual.length, expected.length)
  const paddedActual = Buffer.alloc(targetLength)
  const paddedExpected = Buffer.alloc(targetLength)
  actual.copy(paddedActual)
  expected.copy(paddedExpected)

  const equalContent = safeEqual(paddedActual, paddedExpected)
  const equalLength = actual.length === expected.length
  return equalContent && equalLength
}
