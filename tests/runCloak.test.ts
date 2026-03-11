import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { runCloak } from '../src/app/runCloak.js'
import { createPasswordRecord } from '../src/crypto/password.js'
import { encodeTextFile } from '../src/crypto/fileCipher.js'

it('sets the password on first run, skips second login, and encodes the selected file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-app-'))
  const configDir = join(root, '.config')
  const filePath = join(root, '.env')
  await writeFile(filePath, 'HELLO=world\n', 'utf8')

  const prompts = {
    askNewPassword: vi.fn().mockResolvedValue('secret123'),
    askConfirmPassword: vi.fn().mockResolvedValue('secret123'),
    askPassword: vi.fn(),
    selectFile: vi.fn().mockResolvedValue(filePath),
    confirmAction: vi.fn().mockResolvedValue(true),
    showMessage: vi.fn().mockResolvedValue(undefined),
  }

  await runCloak({ cwd: root, configDir, prompts })

  const nextContents = await readFile(filePath, 'utf8')
  expect(nextContents.startsWith('# CLOAK: ENCRYPTED\n')).toBe(true)
  expect(prompts.askPassword).not.toHaveBeenCalled()
  expect(prompts.confirmAction).toHaveBeenCalledWith('encode')
  expect(prompts.showMessage).toHaveBeenCalledWith('File encoded successfully')
})

it('exits cleanly when file selection is cancelled', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-app-'))
  const configDir = join(root, '.config')
  const filePath = join(root, '.env')
  await mkdir(configDir, { recursive: true })
  await writeFile(filePath, 'HELLO=world\n', 'utf8')
  await writeFile(join(configDir, 'config.json'), JSON.stringify(await createPasswordRecord('secret123')), 'utf8')

  const before = await readFile(filePath, 'utf8')

  const prompts = {
    askNewPassword: vi.fn(),
    askConfirmPassword: vi.fn(),
    askPassword: vi.fn().mockResolvedValue('secret123'),
    selectFile: vi.fn().mockRejectedValue(new Error('User cancelled')),
    confirmAction: vi.fn(),
    showMessage: vi.fn().mockResolvedValue(undefined),
  }

  await expect(runCloak({ cwd: root, configDir, prompts })).resolves.toBeUndefined()
  expect(prompts.confirmAction).not.toHaveBeenCalled()
  await expect(readFile(filePath, 'utf8')).resolves.toBe(before)
})

it('exits cleanly when password entry is cancelled on existing config', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-app-'))
  const configDir = join(root, '.config')
  const filePath = join(root, '.env')
  await mkdir(configDir, { recursive: true })
  await writeFile(join(configDir, 'config.json'), JSON.stringify(await createPasswordRecord('secret123')), 'utf8')
  await writeFile(filePath, 'HELLO=world\n', 'utf8')

  const prompts = {
    askNewPassword: vi.fn(),
    askConfirmPassword: vi.fn(),
    askPassword: vi.fn().mockRejectedValue(new Error('User cancelled')),
    selectFile: vi.fn(),
    confirmAction: vi.fn(),
    showMessage: vi.fn().mockResolvedValue(undefined),
  }

  const before = await readFile(filePath, 'utf8')
  await expect(runCloak({ cwd: root, configDir, prompts })).resolves.toBeUndefined()
  await expect(readFile(filePath, 'utf8')).resolves.toBe(before)
  expect(prompts.selectFile).not.toHaveBeenCalled()
})

it('rejects a selected path outside the startup directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-app-'))
  const outsideDir = await mkdtemp(join(tmpdir(), 'cloak-outside-'))
  const configDir = join(root, '.config')
  await mkdir(configDir, { recursive: true })
  await writeFile(join(root, '.env'), 'HELLO=world\n', 'utf8')

  const outsidePath = join(outsideDir, 'secret.txt')
  await writeFile(outsidePath, 'SECRET=1\n', 'utf8')
  await writeFile(join(configDir, 'config.json'), JSON.stringify(await createPasswordRecord('secret123')), 'utf8')

  const prompts = {
    askNewPassword: vi.fn(),
    askConfirmPassword: vi.fn(),
    askPassword: vi.fn().mockResolvedValue('secret123'),
    selectFile: vi.fn().mockResolvedValue(outsidePath),
    confirmAction: vi.fn(),
    showMessage: vi.fn().mockResolvedValue(undefined),
  }

  await expect(runCloak({ cwd: root, configDir, prompts })).rejects.toThrow('Cannot read file')
  expect(prompts.showMessage).toHaveBeenCalledWith('Cannot read file')
})

it('exits after three wrong password attempts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-app-'))
  const configDir = join(root, '.config')
  await mkdir(configDir, { recursive: true })
  await writeFile(join(root, '.env'), 'HELLO=world\n', 'utf8')
  await writeFile(join(configDir, 'config.json'), JSON.stringify(await createPasswordRecord('secret123')), 'utf8')

  const prompts = {
    askNewPassword: vi.fn(),
    askConfirmPassword: vi.fn(),
    askPassword: vi.fn().mockResolvedValueOnce('wrong-1').mockResolvedValueOnce('wrong-2').mockResolvedValueOnce('wrong-3'),
    selectFile: vi.fn(),
    confirmAction: vi.fn(),
    showMessage: vi.fn().mockResolvedValue(undefined),
  }

  await expect(runCloak({ cwd: root, configDir, prompts })).rejects.toThrow('Too many failed attempts')
  expect(prompts.showMessage).toHaveBeenCalledTimes(3)
  expect(prompts.showMessage).toHaveBeenNthCalledWith(1, 'Wrong password')
  expect(prompts.showMessage).toHaveBeenNthCalledWith(2, 'Wrong password')
  expect(prompts.showMessage).toHaveBeenNthCalledWith(3, 'Wrong password')
})

it('uses decode flow for protected files and reports decode success', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-app-'))
  const configDir = join(root, '.config')
  const filePath = join(root, '.env')
  await mkdir(configDir, { recursive: true })
  await writeFile(join(configDir, 'config.json'), JSON.stringify(await createPasswordRecord('secret123')), 'utf8')
  await writeFile(filePath, await encodeTextFile('HELLO=world\n', 'secret123'), 'utf8')

  const prompts = {
    askNewPassword: vi.fn(),
    askConfirmPassword: vi.fn(),
    askPassword: vi.fn().mockResolvedValue('secret123'),
    selectFile: vi.fn().mockResolvedValue(filePath),
    confirmAction: vi.fn().mockResolvedValue(true),
    showMessage: vi.fn().mockResolvedValue(undefined),
  }

  await runCloak({ cwd: root, configDir, prompts })

  await expect(readFile(filePath, 'utf8')).resolves.toBe('HELLO=world\n')
  expect(prompts.confirmAction).toHaveBeenCalledWith('decode')
  expect(prompts.showMessage).toHaveBeenCalledWith('File decoded successfully')
})

it('exits cleanly when confirmation is false', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-app-'))
  const configDir = join(root, '.config')
  const filePath = join(root, '.env')
  await mkdir(configDir, { recursive: true })
  await writeFile(join(configDir, 'config.json'), JSON.stringify(await createPasswordRecord('secret123')), 'utf8')
  await writeFile(filePath, 'HELLO=world\n', 'utf8')

  const prompts = {
    askNewPassword: vi.fn(),
    askConfirmPassword: vi.fn(),
    askPassword: vi.fn().mockResolvedValue('secret123'),
    selectFile: vi.fn().mockResolvedValue(filePath),
    confirmAction: vi.fn().mockResolvedValue(false),
    showMessage: vi.fn().mockResolvedValue(undefined),
  }

  const before = await readFile(filePath, 'utf8')
  await expect(runCloak({ cwd: root, configDir, prompts })).resolves.toBeUndefined()
  await expect(readFile(filePath, 'utf8')).resolves.toBe(before)
})

it('exits cleanly when confirmation prompt is cancelled', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-app-'))
  const configDir = join(root, '.config')
  const filePath = join(root, '.env')
  await mkdir(configDir, { recursive: true })
  await writeFile(join(configDir, 'config.json'), JSON.stringify(await createPasswordRecord('secret123')), 'utf8')
  await writeFile(filePath, 'HELLO=world\n', 'utf8')

  const prompts = {
    askNewPassword: vi.fn(),
    askConfirmPassword: vi.fn(),
    askPassword: vi.fn().mockResolvedValue('secret123'),
    selectFile: vi.fn().mockResolvedValue(filePath),
    confirmAction: vi.fn().mockRejectedValue(new Error('User cancelled')),
    showMessage: vi.fn().mockResolvedValue(undefined),
  }

  const before = await readFile(filePath, 'utf8')
  await expect(runCloak({ cwd: root, configDir, prompts })).resolves.toBeUndefined()
  await expect(readFile(filePath, 'utf8')).resolves.toBe(before)
})

it('shows read failure and throws when selected file is not valid UTF-8 text', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-app-'))
  const configDir = join(root, '.config')
  const filePath = join(root, 'binary.bin')
  await mkdir(configDir, { recursive: true })
  await writeFile(join(configDir, 'config.json'), JSON.stringify(await createPasswordRecord('secret123')), 'utf8')
  await writeFile(filePath, Buffer.from([0xff, 0xfe, 0xfd]))

  const prompts = {
    askNewPassword: vi.fn(),
    askConfirmPassword: vi.fn(),
    askPassword: vi.fn().mockResolvedValue('secret123'),
    selectFile: vi.fn().mockResolvedValue(filePath),
    confirmAction: vi.fn(),
    showMessage: vi.fn().mockResolvedValue(undefined),
  }

  await expect(runCloak({ cwd: root, configDir, prompts })).rejects.toThrow('Cannot read file')
  expect(prompts.showMessage).toHaveBeenCalledWith('Cannot read file')
  expect(prompts.confirmAction).not.toHaveBeenCalled()
})

it('shows read failure and throws when selected file contains NUL bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-app-'))
  const configDir = join(root, '.config')
  const filePath = join(root, 'has-nul.txt')
  await mkdir(configDir, { recursive: true })
  await writeFile(join(configDir, 'config.json'), JSON.stringify(await createPasswordRecord('secret123')), 'utf8')
  await writeFile(filePath, Buffer.from([0x61, 0x00, 0x62]))

  const prompts = {
    askNewPassword: vi.fn(),
    askConfirmPassword: vi.fn(),
    askPassword: vi.fn().mockResolvedValue('secret123'),
    selectFile: vi.fn().mockResolvedValue(filePath),
    confirmAction: vi.fn(),
    showMessage: vi.fn().mockResolvedValue(undefined),
  }

  await expect(runCloak({ cwd: root, configDir, prompts })).rejects.toThrow('Cannot read file')
  expect(prompts.showMessage).toHaveBeenCalledWith('Cannot read file')
  expect(prompts.confirmAction).not.toHaveBeenCalled()
})
