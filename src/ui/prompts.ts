import { emitKeypressEvents } from 'node:readline'
import { stdin } from 'node:process'
import { confirm, password, select } from '@inquirer/prompts'
import type { ActionKind, PromptPort } from '../app/types.js'

type PromptRunner<T> = (context: { signal: AbortSignal }) => Promise<T>

function actionMessage(action: ActionKind): string {
  return action === 'encode'
    ? 'This file is plain text. Encode it?'
    : 'This file is protected by Cloak. Decode it?'
}

function isExitKey(sequence: string, key?: { name?: string; ctrl?: boolean; meta?: boolean }): boolean {
  if (key?.name === 'escape') {
    return true
  }

  return sequence === 'q' && !key?.ctrl && !key?.meta
}

async function runWithExitKeys<T>(runner: PromptRunner<T>): Promise<T> {
  const controller = new AbortController()
  const onKeypress = (sequence: string, key?: { name?: string; ctrl?: boolean; meta?: boolean }) => {
    if (isExitKey(sequence, key)) {
      controller.abort()
    }
  }

  emitKeypressEvents(stdin)
  stdin.on('keypress', onKeypress)

  try {
    return await runner({ signal: controller.signal })
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('User cancelled')
    }
    throw error
  } finally {
    stdin.off('keypress', onKeypress)
  }
}

export function createPromptPort(): PromptPort {
  return {
    askNewPassword: () =>
      runWithExitKeys((context) => password({ message: 'Set a new password (Esc/q to exit)' }, context)),
    askConfirmPassword: () =>
      runWithExitKeys((context) => password({ message: 'Confirm password (Esc/q to exit)' }, context)),
    askPassword: () =>
      runWithExitKeys((context) => password({ message: 'Enter password (Esc/q to exit)' }, context)),
    selectFile: (files) =>
      runWithExitKeys((context) =>
        select(
          {
            message: 'Choose a file (Esc/q to exit)',
            choices: files.map((file) => ({ name: file.name, value: file.path })),
          },
          context,
        ),
      ),
    confirmAction: (action) =>
      runWithExitKeys((context) => confirm({ message: `${actionMessage(action)} (Esc/q to exit)` }, context)),
    showMessage: async (message) => {
      console.log(message)
    },
  }
}
