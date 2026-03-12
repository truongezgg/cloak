import { access, readFile, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { loadConfig, saveConfig } from '../config/config.js'
import { decodeTextFile, encodeTextFile } from '../crypto/fileCipher.js'
import { createPasswordRecord, verifyPassword } from '../crypto/password.js'
import { decodeUtf8Text, firstLineMatchesMarker, isLikelyTextBuffer } from '../files/readFileState.js'
import { listSelectableFiles } from '../files/listFiles.js'
import { resolveTarget } from '../files/resolveTarget.js'
import { writeOutput as writeOutputFile } from '../files/writeOutput.js'
import { createPromptPort } from '../ui/prompts.js'
import type { RunCloakOptions } from './types.js'

function isUserCancel(error: unknown): boolean {
  return error instanceof Error && error.message === 'User cancelled'
}

async function withUserCancelExit<T>(operation: () => Promise<T>): Promise<T | undefined> {
  try {
    return await operation()
  } catch (error) {
    if (isUserCancel(error)) {
      return undefined
    }
    throw error
  }
}

export async function runCloak(options: RunCloakOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd()
  const configDir = options.configDir ?? join(homedir(), '.config', 'cloak')
  const prompts = options.prompts ?? createPromptPort()
  const resolveTargetPath = options.resolveTargetPath ?? resolveTarget
  const writeOutput = options.writeOutput ?? writeOutputFile
  const rootDir = await realpath(cwd)

  let config = await loadConfig(configDir)
  let sessionPassword = ''

  if (!config) {
    while (true) {
      const nextPassword = await withUserCancelExit(() => prompts.askNewPassword())
      if (nextPassword === undefined) {
        return
      }

      const confirmation = await withUserCancelExit(() => prompts.askConfirmPassword())
      if (confirmation === undefined) {
        return
      }

      if (nextPassword !== confirmation) {
        await prompts.showMessage('Passwords do not match')
        continue
      }

      config = await createPasswordRecord(nextPassword)
      await saveConfig(configDir, config)
      sessionPassword = nextPassword
      break
    }
  } else {
    let authenticated = false

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const passwordAttempt = await withUserCancelExit(() => prompts.askPassword())
      if (passwordAttempt === undefined) {
        return
      }

      sessionPassword = passwordAttempt
      authenticated = await verifyPassword(sessionPassword, config)

      if (authenticated) {
        break
      }

      await prompts.showMessage('Wrong password')
    }

    if (!authenticated) {
      throw new Error('Too many failed attempts')
    }
  }

  let selectedPath: string

  if (options.directPath) {
    selectedPath = options.directPath
  } else {
    const files = await listSelectableFiles(rootDir)

    try {
      selectedPath = await prompts.selectFile(files)
    } catch (error) {
      if (isUserCancel(error)) {
        return
      }
      await prompts.showMessage('Cannot read file')
      throw new Error('Cannot read file')
    }
  }

  let target
  try {
    target = await resolveTargetPath(rootDir, selectedPath)
  } catch {
    await prompts.showMessage('Cannot read file')
    throw new Error('Cannot read file')
  }

  let currentText: string
  try {
    const fileBytes = await readFile(target.sourcePath)
    if (!isLikelyTextBuffer(fileBytes)) {
      throw new Error('Not text')
    }
    currentText = decodeUtf8Text(fileBytes)
  } catch {
    await prompts.showMessage('Cannot read file')
    throw new Error('Cannot read file')
  }

  if (target.outsideRoot) {
    let outsideConfirmed: boolean

    try {
      outsideConfirmed = await prompts.confirmOutsideRoot(target.sourcePath)
    } catch (error) {
      if (isUserCancel(error)) {
        return
      }
      throw error
    }

    if (!outsideConfirmed) {
      return
    }
  }

  const action = target.action

  if (action === 'decode' && !firstLineMatchesMarker(currentText)) {
    throw new Error('File is not protected by Cloak')
  }

  let overwrite = false
  try {
    await access(target.outputPath)
    overwrite = true
  } catch {
    overwrite = false
  }

  let confirmed: boolean
  try {
    confirmed = await prompts.confirmAction(action, target.sourcePath, target.outputPath, overwrite)
  } catch (error) {
    if (isUserCancel(error)) {
      return
    }
    throw error
  }

  if (!confirmed) {
    return
  }

  const nextText =
    action === 'encode'
      ? await encodeTextFile(currentText, sessionPassword)
      : await decodeTextFile(currentText, sessionPassword)

  if (target.outputPath === target.sourcePath) {
    await prompts.showMessage('Cannot write file')
    throw new Error('Cannot write file')
  }

  try {
    await writeOutput(target.outputPath, nextText)
  } catch {
    await prompts.showMessage('Cannot write file')
    throw new Error('Cannot write file')
  }

  await prompts.showMessage(action === 'encode' ? 'File encoded successfully' : 'File decoded successfully')
}
