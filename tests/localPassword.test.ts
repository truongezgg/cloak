import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadLocalPassword, saveLocalPassword } from '../src/files/localPassword.js'

describe('local password helper', () => {
  it('returns null when .cloak is missing', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'cloak-local-'))
    await expect(loadLocalPassword(rootDir)).resolves.toBeNull()
  })

  it('returns the first valid PASSWORD= entry', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'cloak-local-'))
    await writeFile(
      join(rootDir, '.cloak'),
      ['  # comment', 'PASSWORD=first', 'PASSWORD=second'].join('\n'),
      'utf8',
    )
    await expect(loadLocalPassword(rootDir)).resolves.toBe('first')
  })

  it('treats empty PASSWORD= values as invalid', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'cloak-local-'))
    await writeFile(
      join(rootDir, '.cloak'),
      ['PASSWORD=', 'PASSWORD=valid'].join('\n'),
      'utf8',
    )
    await expect(loadLocalPassword(rootDir)).resolves.toBe('valid')
  })

  it('returns null for a lone PASSWORD= entry', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'cloak-local-'))
    await writeFile(join(rootDir, '.cloak'), 'PASSWORD=\n', 'utf8')
    await expect(loadLocalPassword(rootDir)).resolves.toBeNull()
  })

  it('preserves whitespace in password values', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'cloak-local-'))
    await writeFile(join(rootDir, '.cloak'), 'PASSWORD=  spaced  \n', 'utf8')
    await expect(loadLocalPassword(rootDir)).resolves.toBe('  spaced  ')
  })

  it('ignores unrelated lines when PASSWORD= is missing', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'cloak-local-'))
    await writeFile(
      join(rootDir, '.cloak'),
      ['SOMETHING=else', 'PASSWORD_NOT=foo', 'foo=bar'].join('\n'),
      'utf8',
    )
    await expect(loadLocalPassword(rootDir)).resolves.toBeNull()
  })

  it('rewrites .cloak in env format', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'cloak-local-'))
    await saveLocalPassword(rootDir, 'secret123')
    const content = await readFile(join(rootDir, '.cloak'), 'utf8')
    expect(content).toBe('PASSWORD=secret123\n')
  })
})
