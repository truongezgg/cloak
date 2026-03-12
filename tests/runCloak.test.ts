import { access, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
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
    confirmOutsideRoot: vi.fn(),
    confirmAction: vi.fn().mockResolvedValue(true),
    showMessage: vi.fn().mockResolvedValue(undefined),
  }

  await runCloak({ cwd: root, configDir, prompts })

  const canonicalPath = await realpath(filePath)
  const outputPath = `${canonicalPath}.cloak`
  const sourceAfter = await readFile(filePath, 'utf8')
  const outputAfter = await readFile(outputPath, 'utf8')
  expect(sourceAfter).toBe('HELLO=world\n')
  expect(outputAfter.startsWith('# CLOAK: ENCRYPTED\n')).toBe(true)
  expect(prompts.askPassword).not.toHaveBeenCalled()
  expect(prompts.confirmAction).toHaveBeenCalledWith('encode', canonicalPath, outputPath, false)
  expect(prompts.showMessage).toHaveBeenCalledWith('File encoded successfully')
})

it('uses the picker when no direct path is provided', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-app-'))
  const configDir = join(root, '.config')
  const filePath = join(root, '.env')
  await mkdir(configDir, { recursive: true })
  await writeFile(filePath, 'HELLO=world\n', 'utf8')
  await writeFile(join(configDir, 'config.json'), JSON.stringify(await createPasswordRecord('secret123')), 'utf8')

  const prompts = {
    askNewPassword: vi.fn(),
    askConfirmPassword: vi.fn(),
    askPassword: vi.fn().mockResolvedValue('secret123'),
    selectFile: vi.fn().mockResolvedValue(filePath),
    confirmOutsideRoot: vi.fn(),
    confirmAction: vi.fn().mockResolvedValue(true),
    showMessage: vi.fn().mockResolvedValue(undefined),
  }

  await runCloak({ cwd: root, configDir, prompts })

  expect(prompts.selectFile).toHaveBeenCalledOnce()
})

it('uses the provided direct path and skips file selection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-app-'))
  const configDir = join(root, '.config')
  const filePath = join(root, '.env')
  await mkdir(configDir, { recursive: true })
  await writeFile(filePath, 'HELLO=world\n', 'utf8')
  await writeFile(join(configDir, 'config.json'), JSON.stringify(await createPasswordRecord('secret123')), 'utf8')

  const prompts = {
    askNewPassword: vi.fn(),
    askConfirmPassword: vi.fn(),
    askPassword: vi.fn().mockResolvedValue('secret123'),
    selectFile: vi.fn(),
    confirmOutsideRoot: vi.fn(),
    confirmAction: vi.fn().mockResolvedValue(true),
    showMessage: vi.fn().mockResolvedValue(undefined),
  }

  await runCloak({ cwd: root, configDir, prompts, directPath: './.env' })

  expect(prompts.selectFile).not.toHaveBeenCalled()
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
    confirmOutsideRoot: vi.fn(),
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
    confirmOutsideRoot: vi.fn(),
    confirmAction: vi.fn(),
    showMessage: vi.fn().mockResolvedValue(undefined),
  }

  const before = await readFile(filePath, 'utf8')
  await expect(runCloak({ cwd: root, configDir, prompts })).resolves.toBeUndefined()
  await expect(readFile(filePath, 'utf8')).resolves.toBe(before)
  expect(prompts.selectFile).not.toHaveBeenCalled()
})

it('aborts without writing when the user declines the outside-root warning', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-app-'))
  const outside = await mkdtemp(join(tmpdir(), 'cloak-app-outside-'))
  const configDir = join(root, '.config')
  const filePath = join(outside, '.env')
  const outputPath = `${filePath}.cloak`
  await mkdir(configDir, { recursive: true })
  await writeFile(filePath, 'HELLO=world\n', 'utf8')
  await writeFile(join(configDir, 'config.json'), JSON.stringify(await createPasswordRecord('secret123')), 'utf8')

  const prompts = {
    askNewPassword: vi.fn(),
    askConfirmPassword: vi.fn(),
    askPassword: vi.fn().mockResolvedValue('secret123'),
    selectFile: vi.fn(),
    confirmOutsideRoot: vi.fn().mockResolvedValue(false),
    confirmAction: vi.fn(),
    showMessage: vi.fn().mockResolvedValue(undefined),
  }

  await runCloak({ cwd: root, configDir, prompts, directPath: filePath })

  await expect(readFile(filePath, 'utf8')).resolves.toBe('HELLO=world\n')
  await expect(access(outputPath)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(prompts.confirmAction).not.toHaveBeenCalled()
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
    confirmOutsideRoot: vi.fn(),
    confirmAction: vi.fn(),
    showMessage: vi.fn().mockResolvedValue(undefined),
  }

  await expect(runCloak({ cwd: root, configDir, prompts })).rejects.toThrow('Too many failed attempts')
  expect(prompts.showMessage).toHaveBeenCalledTimes(3)
  expect(prompts.showMessage).toHaveBeenNthCalledWith(1, 'Wrong password')
  expect(prompts.showMessage).toHaveBeenNthCalledWith(2, 'Wrong password')
  expect(prompts.showMessage).toHaveBeenNthCalledWith(3, 'Wrong password')
})

it('uses decode flow for .cloak files and reports decode success', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-app-'))
  const configDir = join(root, '.config')
  const filePath = join(root, '.env.cloak')
  await mkdir(configDir, { recursive: true })
  await writeFile(join(configDir, 'config.json'), JSON.stringify(await createPasswordRecord('secret123')), 'utf8')
  await writeFile(filePath, await encodeTextFile('HELLO=world\n', 'secret123'), 'utf8')

  const prompts = {
    askNewPassword: vi.fn(),
    askConfirmPassword: vi.fn(),
    askPassword: vi.fn().mockResolvedValue('secret123'),
    selectFile: vi.fn().mockResolvedValue(filePath),
    confirmOutsideRoot: vi.fn(),
    confirmAction: vi.fn().mockResolvedValue(true),
    showMessage: vi.fn().mockResolvedValue(undefined),
  }

  await runCloak({ cwd: root, configDir, prompts })

  const canonicalPath = await realpath(filePath)
  const outputPath = canonicalPath.slice(0, -'.cloak'.length)
  await expect(readFile(filePath, 'utf8')).resolves.toContain('# CLOAK: ENCRYPTED\n')
  await expect(readFile(outputPath, 'utf8')).resolves.toBe('HELLO=world\n')
  expect(prompts.confirmAction).toHaveBeenCalledWith('decode', canonicalPath, outputPath, false)
  expect(prompts.showMessage).toHaveBeenCalledWith('File decoded successfully')
})

it('shows overwrite warning when encode destination already exists', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-app-'))
  const configDir = join(root, '.config')
  const sourcePath = join(root, '.env')
  const existingOutput = join(root, '.env.cloak')
  await mkdir(configDir, { recursive: true })
  await writeFile(join(configDir, 'config.json'), JSON.stringify(await createPasswordRecord('secret123')), 'utf8')
  await writeFile(sourcePath, 'HELLO=world\n', 'utf8')
  await writeFile(existingOutput, 'old encrypted payload\n', 'utf8')

  const prompts = {
    askNewPassword: vi.fn(),
    askConfirmPassword: vi.fn(),
    askPassword: vi.fn().mockResolvedValue('secret123'),
    selectFile: vi.fn().mockResolvedValue(sourcePath),
    confirmOutsideRoot: vi.fn(),
    confirmAction: vi.fn().mockResolvedValue(true),
    showMessage: vi.fn().mockResolvedValue(undefined),
  }

  await runCloak({ cwd: root, configDir, prompts })

  const canonicalSource = await realpath(sourcePath)
  const outputPath = `${canonicalSource}.cloak`
  expect(prompts.confirmAction).toHaveBeenCalledWith('encode', canonicalSource, outputPath, true)
})

it('shows overwrite warning when decode destination already exists', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-app-'))
  const configDir = join(root, '.config')
  const sourcePath = join(root, '.env.cloak')
  const existingOutput = join(root, '.env')
  await mkdir(configDir, { recursive: true })
  await writeFile(join(configDir, 'config.json'), JSON.stringify(await createPasswordRecord('secret123')), 'utf8')
  await writeFile(sourcePath, await encodeTextFile('HELLO=world\n', 'secret123'), 'utf8')
  await writeFile(existingOutput, 'previous plaintext\n', 'utf8')

  const prompts = {
    askNewPassword: vi.fn(),
    askConfirmPassword: vi.fn(),
    askPassword: vi.fn().mockResolvedValue('secret123'),
    selectFile: vi.fn().mockResolvedValue(sourcePath),
    confirmOutsideRoot: vi.fn(),
    confirmAction: vi.fn().mockResolvedValue(true),
    showMessage: vi.fn().mockResolvedValue(undefined),
  }

  await runCloak({ cwd: root, configDir, prompts })

  const canonicalSource = await realpath(sourcePath)
  const outputPath = canonicalSource.slice(0, -'.cloak'.length)
  expect(prompts.confirmAction).toHaveBeenCalledWith('decode', canonicalSource, outputPath, true)
})

it('does not write when the user declines the encode overwrite warning', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-app-'))
  const configDir = join(root, '.config')
  const sourcePath = join(root, '.env')
  const outputPath = join(root, '.env.cloak')
  const existingDestination = 'existing encrypted payload\n'
  await mkdir(configDir, { recursive: true })
  await writeFile(join(configDir, 'config.json'), JSON.stringify(await createPasswordRecord('secret123')), 'utf8')
  await writeFile(sourcePath, 'HELLO=world\n', 'utf8')
  await writeFile(outputPath, existingDestination, 'utf8')

  const prompts = {
    askNewPassword: vi.fn(),
    askConfirmPassword: vi.fn(),
    askPassword: vi.fn().mockResolvedValue('secret123'),
    selectFile: vi.fn().mockResolvedValue(sourcePath),
    confirmOutsideRoot: vi.fn(),
    confirmAction: vi.fn().mockResolvedValue(false),
    showMessage: vi.fn().mockResolvedValue(undefined),
  }

  await expect(runCloak({ cwd: root, configDir, prompts })).resolves.toBeUndefined()
  await expect(readFile(outputPath, 'utf8')).resolves.toBe(existingDestination)
})

it('does not write when the user declines the decode overwrite warning', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-app-'))
  const configDir = join(root, '.config')
  const sourcePath = join(root, '.env.cloak')
  const outputPath = join(root, '.env')
  const existingDestination = 'existing plaintext\n'
  const encoded = await encodeTextFile('HELLO=world\n', 'secret123')
  await mkdir(configDir, { recursive: true })
  await writeFile(join(configDir, 'config.json'), JSON.stringify(await createPasswordRecord('secret123')), 'utf8')
  await writeFile(sourcePath, encoded, 'utf8')
  await writeFile(outputPath, existingDestination, 'utf8')

  const prompts = {
    askNewPassword: vi.fn(),
    askConfirmPassword: vi.fn(),
    askPassword: vi.fn().mockResolvedValue('secret123'),
    selectFile: vi.fn().mockResolvedValue(sourcePath),
    confirmOutsideRoot: vi.fn(),
    confirmAction: vi.fn().mockResolvedValue(false),
    showMessage: vi.fn().mockResolvedValue(undefined),
  }

  await expect(runCloak({ cwd: root, configDir, prompts })).resolves.toBeUndefined()
  await expect(readFile(outputPath, 'utf8')).resolves.toBe(existingDestination)
  await expect(readFile(sourcePath, 'utf8')).resolves.toBe(encoded)
})

it('treats non-.cloak files as encode candidates even if they contain the cloak header', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-app-'))
  const configDir = join(root, '.config')
  const filePath = join(root, 'secret.txt')
  const original = '# CLOAK: ENCRYPTED\n{"not":"ciphertext"}\n'
  await mkdir(configDir, { recursive: true })
  await writeFile(join(configDir, 'config.json'), JSON.stringify(await createPasswordRecord('secret123')), 'utf8')
  await writeFile(filePath, original, 'utf8')

  const prompts = {
    askNewPassword: vi.fn(),
    askConfirmPassword: vi.fn(),
    askPassword: vi.fn().mockResolvedValue('secret123'),
    selectFile: vi.fn().mockResolvedValue(filePath),
    confirmOutsideRoot: vi.fn(),
    confirmAction: vi.fn().mockResolvedValue(true),
    showMessage: vi.fn().mockResolvedValue(undefined),
  }

  await runCloak({ cwd: root, configDir, prompts })

  const canonicalPath = await realpath(filePath)
  const outputPath = `${canonicalPath}.cloak`
  expect(prompts.confirmAction).toHaveBeenCalledWith('encode', canonicalPath, outputPath, false)
  await expect(readFile(filePath, 'utf8')).resolves.toBe(original)
  await expect(readFile(outputPath, 'utf8')).resolves.toContain('# CLOAK: ENCRYPTED\n')
})

it('rejects .cloak input when the cloak header appears on line 2 instead of line 1', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-app-'))
  const configDir = join(root, '.config')
  const filePath = join(root, 'bad.cloak')
  const outputPath = join(root, 'bad')
  await mkdir(configDir, { recursive: true })
  await writeFile(join(configDir, 'config.json'), JSON.stringify(await createPasswordRecord('secret123')), 'utf8')
  await writeFile(filePath, 'not cloak\n# CLOAK: ENCRYPTED\n{}\n', 'utf8')

  const prompts = {
    askNewPassword: vi.fn(),
    askConfirmPassword: vi.fn(),
    askPassword: vi.fn().mockResolvedValue('secret123'),
    selectFile: vi.fn().mockResolvedValue(filePath),
    confirmOutsideRoot: vi.fn(),
    confirmAction: vi.fn().mockResolvedValue(true),
    showMessage: vi.fn().mockResolvedValue(undefined),
  }

  await expect(runCloak({ cwd: root, configDir, prompts })).rejects.toThrow('File is not protected by Cloak')
  expect(prompts.confirmAction).not.toHaveBeenCalled()
  await expect(access(outputPath)).rejects.toMatchObject({ code: 'ENOENT' })
})

it('rejects .cloak input with an invalid cloak header on line 1', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-app-'))
  const configDir = join(root, '.config')
  const filePath = join(root, 'bad.cloak')
  const outputPath = join(root, 'bad')
  await mkdir(configDir, { recursive: true })
  await writeFile(join(configDir, 'config.json'), JSON.stringify(await createPasswordRecord('secret123')), 'utf8')
  await writeFile(filePath, '# CLOAK: ENCRYPTED extra\n{}\n', 'utf8')

  const prompts = {
    askNewPassword: vi.fn(),
    askConfirmPassword: vi.fn(),
    askPassword: vi.fn().mockResolvedValue('secret123'),
    selectFile: vi.fn().mockResolvedValue(filePath),
    confirmOutsideRoot: vi.fn(),
    confirmAction: vi.fn().mockResolvedValue(true),
    showMessage: vi.fn().mockResolvedValue(undefined),
  }

  await expect(runCloak({ cwd: root, configDir, prompts })).rejects.toThrow('File is not protected by Cloak')
  expect(prompts.confirmAction).not.toHaveBeenCalled()
  await expect(access(outputPath)).rejects.toMatchObject({ code: 'ENOENT' })
})

it('does not create destination when the user declines the normal confirmation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-app-'))
  const configDir = join(root, '.config')
  const filePath = join(root, '.env')
  const outputPath = join(root, '.env.cloak')
  await mkdir(configDir, { recursive: true })
  await writeFile(join(configDir, 'config.json'), JSON.stringify(await createPasswordRecord('secret123')), 'utf8')
  await writeFile(filePath, 'HELLO=world\n', 'utf8')

  const prompts = {
    askNewPassword: vi.fn(),
    askConfirmPassword: vi.fn(),
    askPassword: vi.fn().mockResolvedValue('secret123'),
    selectFile: vi.fn().mockResolvedValue(filePath),
    confirmOutsideRoot: vi.fn(),
    confirmAction: vi.fn().mockResolvedValue(false),
    showMessage: vi.fn().mockResolvedValue(undefined),
  }

  const before = await readFile(filePath, 'utf8')
  await expect(runCloak({ cwd: root, configDir, prompts })).resolves.toBeUndefined()
  await expect(readFile(filePath, 'utf8')).resolves.toBe(before)
  await expect(access(outputPath)).rejects.toMatchObject({ code: 'ENOENT' })
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
    confirmOutsideRoot: vi.fn(),
    confirmAction: vi.fn().mockRejectedValue(new Error('User cancelled')),
    showMessage: vi.fn().mockResolvedValue(undefined),
  }

  const before = await readFile(filePath, 'utf8')
  await expect(runCloak({ cwd: root, configDir, prompts })).resolves.toBeUndefined()
  await expect(readFile(filePath, 'utf8')).resolves.toBe(before)
})

it('shows read failure and throws when direct path does not exist', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-app-'))
  const configDir = join(root, '.config')
  await mkdir(configDir, { recursive: true })
  await writeFile(join(configDir, 'config.json'), JSON.stringify(await createPasswordRecord('secret123')), 'utf8')

  const prompts = {
    askNewPassword: vi.fn(),
    askConfirmPassword: vi.fn(),
    askPassword: vi.fn().mockResolvedValue('secret123'),
    selectFile: vi.fn(),
    confirmOutsideRoot: vi.fn(),
    confirmAction: vi.fn(),
    showMessage: vi.fn().mockResolvedValue(undefined),
  }

  await expect(runCloak({ cwd: root, configDir, prompts, directPath: './missing.env' })).rejects.toThrow('Cannot read file')
  expect(prompts.showMessage).toHaveBeenCalledWith('Cannot read file')
  expect(prompts.selectFile).not.toHaveBeenCalled()
  expect(prompts.confirmAction).not.toHaveBeenCalled()
})

it('shows read failure and throws when direct path points to a directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-app-'))
  const configDir = join(root, '.config')
  const directoryPath = join(root, 'folder')
  await mkdir(configDir, { recursive: true })
  await mkdir(directoryPath, { recursive: true })
  await writeFile(join(configDir, 'config.json'), JSON.stringify(await createPasswordRecord('secret123')), 'utf8')

  const prompts = {
    askNewPassword: vi.fn(),
    askConfirmPassword: vi.fn(),
    askPassword: vi.fn().mockResolvedValue('secret123'),
    selectFile: vi.fn(),
    confirmOutsideRoot: vi.fn(),
    confirmAction: vi.fn(),
    showMessage: vi.fn().mockResolvedValue(undefined),
  }

  await expect(runCloak({ cwd: root, configDir, prompts, directPath: directoryPath })).rejects.toThrow('Cannot read file')
  expect(prompts.showMessage).toHaveBeenCalledWith('Cannot read file')
  expect(prompts.selectFile).not.toHaveBeenCalled()
  expect(prompts.confirmAction).not.toHaveBeenCalled()
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
    confirmOutsideRoot: vi.fn(),
    confirmAction: vi.fn(),
    showMessage: vi.fn().mockResolvedValue(undefined),
  }

  await expect(runCloak({ cwd: root, configDir, prompts })).rejects.toThrow('Cannot read file')
  expect(prompts.showMessage).toHaveBeenCalledWith('Cannot read file')
  expect(prompts.confirmAction).not.toHaveBeenCalled()
})

it('aborts before writing when outputPath equals sourcePath', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-app-'))
  const configDir = join(root, '.config')
  const sourcePath = join(root, '.env')
  const original = 'SAFE=1\n'
  await mkdir(configDir, { recursive: true })
  await writeFile(sourcePath, original, 'utf8')
  await writeFile(join(configDir, 'config.json'), JSON.stringify(await createPasswordRecord('secret123')), 'utf8')

  const prompts = {
    askNewPassword: vi.fn(),
    askConfirmPassword: vi.fn(),
    askPassword: vi.fn().mockResolvedValue('secret123'),
    selectFile: vi.fn().mockResolvedValue(sourcePath),
    confirmOutsideRoot: vi.fn(),
    confirmAction: vi.fn().mockResolvedValue(true),
    showMessage: vi.fn().mockResolvedValue(undefined),
  }

  const writer = vi.fn().mockResolvedValue(undefined)

  await expect(
    runCloak({
      cwd: root,
      configDir,
      prompts,
      resolveTargetPath: async () => ({
        sourcePath,
        outputPath: sourcePath,
        action: 'encode',
        outsideRoot: false,
      }),
      writeOutput: writer,
    }),
  ).rejects.toThrow('Cannot write file')

  expect(writer).not.toHaveBeenCalled()
  expect(prompts.showMessage).toHaveBeenCalledWith('Cannot write file')
  expect(await readFile(sourcePath, 'utf8')).toBe(original)
})

it('shows Cannot write file when writing fails and leaves source unchanged', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-app-'))
  const configDir = join(root, '.config')
  const sourcePath = join(root, '.env')
  const outputPath = `${sourcePath}.cloak`
  const original = 'API_KEY=abc123\n'
  await mkdir(configDir, { recursive: true })
  await writeFile(sourcePath, original, 'utf8')
  await writeFile(join(configDir, 'config.json'), JSON.stringify(await createPasswordRecord('secret123')), 'utf8')

  const prompts = {
    askNewPassword: vi.fn(),
    askConfirmPassword: vi.fn(),
    askPassword: vi.fn().mockResolvedValue('secret123'),
    selectFile: vi.fn().mockResolvedValue(sourcePath),
    confirmOutsideRoot: vi.fn(),
    confirmAction: vi.fn().mockResolvedValue(true),
    showMessage: vi.fn().mockResolvedValue(undefined),
  }

  const writer = vi.fn().mockRejectedValue(new Error('disk full'))

  await expect(runCloak({ cwd: root, configDir, prompts, writeOutput: writer })).rejects.toThrow('Cannot write file')
  expect(await readFile(sourcePath, 'utf8')).toBe(original)
  await expect(access(outputPath)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(prompts.showMessage).toHaveBeenCalledWith('Cannot write file')
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
    confirmOutsideRoot: vi.fn(),
    confirmAction: vi.fn(),
    showMessage: vi.fn().mockResolvedValue(undefined),
  }

  await expect(runCloak({ cwd: root, configDir, prompts })).rejects.toThrow('Cannot read file')
  expect(prompts.showMessage).toHaveBeenCalledWith('Cannot read file')
  expect(prompts.confirmAction).not.toHaveBeenCalled()
})
