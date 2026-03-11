import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PasswordRecord } from '../app/types.js'

type ParsedConfig = Partial<PasswordRecord>

type KdfShape = NonNullable<ParsedConfig['kdf']>

function isValidKdf(value: unknown): value is KdfShape {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const entry = value as KdfShape
  return (
    entry.name === 'argon2id' &&
    typeof entry.memoryCost === 'number' &&
    typeof entry.timeCost === 'number' &&
    typeof entry.parallelism === 'number' &&
    typeof entry.hashLength === 'number' &&
    typeof entry.saltLength === 'number'
  )
}

function validateConfig(parsed: ParsedConfig): parsed is PasswordRecord {
  return (
    typeof parsed.passwordHash === 'string' &&
    typeof parsed.salt === 'string' &&
    isValidKdf(parsed.kdf)
  )
}

export async function loadConfig(configDir: string): Promise<PasswordRecord | null> {
  const filePath = join(configDir, 'config.json')

  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw) as ParsedConfig

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('Invalid config.json: expected an object')
    }

    if (!Object.prototype.hasOwnProperty.call(parsed, 'passwordHash')) {
      return null
    }

    if (typeof parsed.passwordHash !== 'string' || parsed.passwordHash.length === 0) {
      throw new Error('Invalid config.json: passwordHash must be a non-empty string')
    }

    if (!validateConfig(parsed)) {
      throw new Error('Invalid config.json: missing required fields')
    }

    return parsed
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    if (error instanceof SyntaxError) {
      throw new Error('Invalid config.json: malformed JSON')
    }
    throw error
  }
}

export async function saveConfig(configDir: string, config: PasswordRecord): Promise<void> {
  await mkdir(configDir, { recursive: true })
  await writeFile(join(configDir, 'config.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8')
}
