import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const CLOAK_FILENAME = '.cloak'
const PASSWORD_PREFIX = 'PASSWORD='

export async function loadLocalPassword(rootDir: string): Promise<string | null> {
  const filePath = join(rootDir, CLOAK_FILENAME)

  try {
    const data = await readFile(filePath, 'utf8')
    const lines = data.split(/\r?\n/)

    for (const line of lines) {
      const trimmedStart = line.trimStart()
      if (!trimmedStart.startsWith(PASSWORD_PREFIX)) {
        continue
      }

      const value = trimmedStart.slice(PASSWORD_PREFIX.length)
      if (value === '') {
        continue
      }

      return value
    }

    return null
  } catch (error) {
    if (isEnoent(error)) {
      return null
    }
    throw error
  }
}

export async function saveLocalPassword(rootDir: string, password: string): Promise<void> {
  const filePath = join(rootDir, CLOAK_FILENAME)
  await writeFile(filePath, `PASSWORD=${password}\n`, 'utf8')
}

function isEnoent(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  )
}
