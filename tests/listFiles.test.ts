import { mkdir, mkdtemp, realpath, symlink, writeFile } from 'node:fs/promises'
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
    expect(files.map((file) => file.name)).toEqual(['.env', 'secret.json', 'nested/hidden.txt'])
  })

  it('excludes package manifest files from the selectable list', async () => {
    const root = await setupRoot()
    await writeFile(join(root, 'package.json'), '{"name":"cloak"}\n')
    await writeFile(join(root, 'package-lock.json'), '{}\n')

    const files = await listSelectableFiles(root)
    expect(files.map((file) => file.name)).toEqual(['.env', 'secret.json', 'nested/hidden.txt'])
  })

  it('excludes markdown files from the selectable list', async () => {
    const root = await setupRoot()
    await writeFile(join(root, 'README.md'), '# readme\n')

    const files = await listSelectableFiles(root)
    expect(files.some((file) => file.name === 'README.md')).toBe(false)
  })

  it('skips dangling symlinks instead of failing the list', async () => {
    const root = await setupRoot()
    await symlink(join(root, 'missing.txt'), join(root, 'dangling.lnk'))

    const files = await listSelectableFiles(root)
    expect(files.map((file) => file.name)).toEqual(['.env', 'secret.json', 'nested/hidden.txt'])
  })

  it('ignores symlinks that resolve outside the root directory', async () => {
    const root = await setupRoot()
    const outside = await mkdtemp(join(tmpdir(), 'cloak-list-outside-'))
    const outsideFile = join(outside, 'secret.txt')
    await writeFile(outsideFile, 'secret\n')
    await symlink(outsideFile, join(root, 'outside.lnk'))

    const files = await listSelectableFiles(root)
    expect(files.map((file) => file.name)).toEqual(['.env', 'secret.json', 'nested/hidden.txt'])
  })

  it('excludes the workspace root .cloak file from the selectable list', async () => {
    const root = await setupRoot()
    await writeFile(join(root, '.cloak'), 'password\n')

    const files = await listSelectableFiles(root)
    expect(files.map((file) => file.name)).toEqual(['.env', 'secret.json', 'nested/hidden.txt'])
  })

  it('recursively lists nested files under the startup directory', async () => {
    const root = await setupRoot()
    await mkdir(join(root, 'nested', 'deep'))
    await writeFile(join(root, 'nested', 'deep', 'secret.txt'), 'nom\n')

    const files = await listSelectableFiles(root)
    expect(files.map((file) => file.name)).toContain('nested/deep/secret.txt')
  })

  it('returns canonical absolute paths for selectable files', async () => {
    const root = await setupRoot()

    const files = await listSelectableFiles(root)
    const nestedFile = files.find((file) => file.name === 'nested/hidden.txt')
    expect(nestedFile).toBeDefined()

    const expectedPath = await realpath(join(root, 'nested', 'hidden.txt'))
    expect(nestedFile?.path).toBe(expectedPath)
  })

  it('treats nested preferred files as preferred by basename', async () => {
    const root = await setupRoot()
    await writeFile(join(root, 'zzz.log'), 'late\n')
    await writeFile(join(root, 'nested', 'preferred.txt'), 'yes\n')

    const files = await listSelectableFiles(root)
    const preferredIndex = files.findIndex((file) => file.name === 'nested/preferred.txt')
    const nonPreferredIndex = files.findIndex((file) => file.name === 'zzz.log')
    expect(preferredIndex).toBeGreaterThanOrEqual(0)
    expect(nonPreferredIndex).toBeGreaterThanOrEqual(0)
    expect(preferredIndex).toBeLessThan(nonPreferredIndex)
  })

  it('lists .cloak files first with a lock suffix', async () => {
    const root = await setupRoot()
    await writeFile(join(root, 'a.env.cloak'), 'encrypted\n')
    await writeFile(join(root, 'nested', 'z.txt.cloak'), 'encrypted\n')

    const files = await listSelectableFiles(root)
    const names = files.map((file) => file.name)

    expect(names[0]).toBe('a.env.cloak 🔒')
    expect(names[1]).toBe('nested/z.txt.cloak 🔒')
    expect(names).toContain('.env')
  })

  it('skips .git directories from the selectable list', async () => {
    const root = await setupRoot()
    const gitDir = join(root, '.git')
    await mkdir(gitDir)
    await writeFile(join(gitDir, 'config'), '[core]\nrepositoryformatversion = 0\n')

    const files = await listSelectableFiles(root)
    expect(files.some((file) => file.name.startsWith('.git/'))).toBe(false)
  })

  it('skips .claude directories from the selectable list', async () => {
    const root = await setupRoot()
    const claudeDir = join(root, '.claude')
    await mkdir(claudeDir)
    await writeFile(join(claudeDir, 'settings.local.json'), '{"theme":"dark"}\n')

    const files = await listSelectableFiles(root)
    expect(files.some((file) => file.name.startsWith('.claude/'))).toBe(false)
  })

  it('skips dist directories from the selectable list', async () => {
    const root = await setupRoot()
    const distDir = join(root, 'dist')
    await mkdir(distDir)
    await writeFile(join(distDir, 'bundle.js'), '// bundle\n')

    const files = await listSelectableFiles(root)
    expect(files.some((file) => file.name.startsWith('dist/'))).toBe(false)
  })

  it('skips build directories from the selectable list', async () => {
    const root = await setupRoot()
    const buildDir = join(root, 'build')
    await mkdir(buildDir)
    await writeFile(join(buildDir, 'out.js'), 'out\n')

    const files = await listSelectableFiles(root)
    expect(files.some((file) => file.name.startsWith('build/'))).toBe(false)
  })
})
