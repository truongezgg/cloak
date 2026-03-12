import { stdin } from 'node:process'
import { beforeEach, expect, it, vi } from 'vitest'

vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn(),
  password: vi.fn(),
  select: vi.fn(),
}))

import { password } from '@inquirer/prompts'
import { actionMessage, createPromptPort, outsideRootMessage, overwriteWarningMessage } from '../src/ui/prompts.js'

beforeEach(() => {
  vi.mocked(password).mockReset()
})

it('formats the encode confirmation with source and output', () => {
  expect(actionMessage('encode', '.env', '.env.cloak')).toContain('Encode this file?')
  expect(actionMessage('encode', '.env', '.env.cloak')).toContain('Source: .env')
  expect(actionMessage('encode', '.env', '.env.cloak')).toContain('Output: .env.cloak')
})

it('formats the decode overwrite warning', () => {
  expect(overwriteWarningMessage('.env')).toContain('WARNING: destination file already exists')
  expect(overwriteWarningMessage('.env')).toContain('Target: .env')
})

it('formats the outside-root warning', () => {
  expect(outsideRootMessage('/tmp/.env')).toContain('outside the current directory')
})

it('cancels password prompt when q is pressed', async () => {
  vi.mocked(password).mockImplementation(
    (_config, context?: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        context?.signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true })
      }),
  )

  const prompts = createPromptPort()
  const pending = prompts.askPassword()

  stdin.emit('keypress', 'q', { name: 'q', ctrl: false, meta: false })

  await expect(pending).rejects.toThrow('User cancelled')
  expect(vi.mocked(password)).toHaveBeenCalledWith({ message: 'Enter password (Esc/q to exit)' }, expect.any(Object))
})

it('cancels password prompt when Escape is pressed', async () => {
  vi.mocked(password).mockImplementation(
    (_config, context?: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        context?.signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true })
      }),
  )

  const prompts = createPromptPort()
  const pending = prompts.askPassword()

  stdin.emit('keypress', '\u001B', { name: 'escape' })

  await expect(pending).rejects.toThrow('User cancelled')
})
