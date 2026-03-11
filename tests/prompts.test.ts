import { stdin } from 'node:process'
import { beforeEach, expect, it, vi } from 'vitest'

vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn(),
  password: vi.fn(),
  select: vi.fn(),
}))

import { password } from '@inquirer/prompts'
import { createPromptPort } from '../src/ui/prompts.js'

beforeEach(() => {
  vi.mocked(password).mockReset()
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
