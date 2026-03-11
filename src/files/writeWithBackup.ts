import { copyFile, rm, writeFile } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'

async function copyFileExclusive(source: string, destination: string): Promise<boolean> {
  try {
    await copyFile(source, destination, fsConstants.COPYFILE_EXCL)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return false
    }
    throw error
  }
}

async function createBackup(filePath: string): Promise<string> {
  const primary = `${filePath}.cloak.bak`

  if (await copyFileExclusive(filePath, primary)) {
    return primary
  }

  while (true) {
    const candidate = `${primary}.${Date.now()}`
    if (await copyFileExclusive(filePath, candidate)) {
      return candidate
    }
  }
}

export async function writeWithBackup(
  filePath: string,
  nextContent: string,
  writer: (path: string, content: string) => Promise<void> = (path, content) => writeFile(path, content, 'utf8'),
  cleanup: (path: string) => Promise<void> = rm,
): Promise<{ backupPath: string }> {
  const backupPath = await createBackup(filePath)

  try {
    await writer(filePath, nextContent)
  } catch (error) {
    throw Object.assign(new Error('Cannot write file'), { cause: error, backupPath })
  }

  try {
    await cleanup(backupPath)
  } catch (error) {
    throw Object.assign(new Error('Cannot remove backup'), { cause: error, backupPath })
  }

  return { backupPath }
}
