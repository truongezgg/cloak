import { mkdtemp, realpath, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { resolveTarget } from '../src/files/resolveTarget.js'

it('maps a plain file to an encode output with .cloak appended', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-target-'))
  const canonicalRoot = await realpath(root)
  const filePath = join(root, '.env')
  await writeFile(filePath, 'A=1\n', 'utf8')
  const canonicalFilePath = await realpath(filePath)

  const target = await resolveTarget(root, './.env')
  expect(target.action).toBe('encode')
  expect(target.sourcePath).toBe(canonicalFilePath)
  expect(target.outputPath).toBe(join(canonicalRoot, '.env.cloak'))
  expect(target.outsideRoot).toBe(false)
})


it('maps a .cloak file to a decode output by removing only the final suffix', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-target-'))
  const canonicalRoot = await realpath(root)
  const filePath = join(root, '.env.cloak')
  await writeFile(filePath, '# CLOAK: ENCRYPTED\n{}', 'utf8')

  const target = await resolveTarget(root, filePath)
  expect(target.action).toBe('decode')
  expect(target.outputPath).toBe(join(canonicalRoot, '.env'))
})


it('canonicalizes root and source paths through symlink hops', async () => {
  const canonicalRoot = await mkdtemp(join(tmpdir(), 'cloak-target-real-'))
  const canonicalRootReal = await realpath(canonicalRoot)
  const linkedRoot = join(tmpdir(), `cloak-target-link-${Date.now()}`)
  await symlink(canonicalRoot, linkedRoot)

  const canonicalFile = join(canonicalRoot, 'secret.txt')
  await writeFile(canonicalFile, 'A=1\n', 'utf8')
  const canonicalFileReal = await realpath(canonicalFile)

  const target = await resolveTarget(linkedRoot, './secret.txt')
  expect(target.sourcePath).toBe(canonicalFileReal)
  expect(target.outputPath).toBe(`${canonicalFileReal}.cloak`)
  expect(target.outsideRoot).toBe(false)
  expect(target.outputPath.startsWith(`${canonicalRootReal}`)).toBe(true)
})


it('marks a canonical path outside the startup directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-target-'))
  const outside = await mkdtemp(join(tmpdir(), 'cloak-target-outside-'))
  const filePath = join(outside, '.env')
  await writeFile(filePath, 'A=1\n', 'utf8')

  const target = await resolveTarget(root, filePath)
  expect(target.outsideRoot).toBe(true)
})
