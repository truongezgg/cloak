import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { listSelectableFiles } from '../src/files/listFiles.js'

async function setupRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cloak-list-'))
  await writeFile(join(root, '.env'), 'A=1\n')
  await writeFile(join(root, 'z-last.md'), '# readme\n')
  await writeFile(join(root, 'secret.json'), '{}\n')
  await mkdir(join(root, 'nested'))
  await writeFile(join(root, 'nested', 'hidden.txt'), 'nope\n')
  return root
}

describe('listSelectableFiles', () => {
  it('lists only files from the startup directory and sorts preferred patterns first', async () => {
    const root = await setupRoot()

    const files = await listSelectableFiles(root)
    expect(files.map((file) => file.name)).toEqual(['.env', 'secret.json', 'z-last.md'])
  })

  it('excludes package manifest files from the selectable list', async () => {
    const root = await setupRoot()
    await writeFile(join(root, 'package.json'), '{"name":"cloak"}\n')
    await writeFile(join(root, 'package-lock.json'), '{}\n')

    const files = await listSelectableFiles(root)
    expect(files.map((file) => file.name)).toEqual(['.env', 'secret.json', 'z-last.md'])
  })

  it('skips dangling symlinks instead of failing the list', async () => {
    const root = await setupRoot()
    await symlink(join(root, 'missing.txt'), join(root, 'dangling.lnk'))

    const files = await listSelectableFiles(root)
    expect(files.map((file) => file.name)).toEqual(['.env', 'secret.json', 'z-last.md'])
  })

  it('ignores symlinks that resolve outside the root directory', async () => {
    const root = await setupRoot()
    const outside = await mkdtemp(join(tmpdir(), 'cloak-list-outside-'))
    const outsideFile = join(outside, 'secret.txt')
    await writeFile(outsideFile, 'secret\n')
    await symlink(outsideFile, join(root, 'outside.lnk'))

    const files = await listSelectableFiles(root)
    expect(files.map((file) => file.name)).toEqual(['.env', 'secret.json', 'z-last.md'])
  })
})
