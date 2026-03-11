import { writeFile, mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { writeWithBackup } from '../src/files/writeWithBackup.js'

describe('writeWithBackup', () => {
  it('removes the backup after a successful write', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'cloak-write-'))
    const filePath = join(baseDir, '.env')
    await writeFile(filePath, 'HELLO=world\n', 'utf8')

    const result = await writeWithBackup(filePath, '# CLOAK: ENCRYPTED\n{}')

    await expect(readFile(filePath, 'utf8')).resolves.toContain('# CLOAK: ENCRYPTED')
    await expect(stat(result.backupPath)).rejects.toThrow()
  })

  it('keeps the backup and throws when the writer fails', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'cloak-write-'))
    const filePath = join(baseDir, '.env')
    await writeFile(filePath, 'HELLO=world\n', 'utf8')

    let backupPath: string | undefined
    await expect(
      writeWithBackup(filePath, 'ignored', async () => {
        throw new Error('disk full')
      }).catch((error) => {
        backupPath = (error as Error & { backupPath: string }).backupPath
        throw error
      }),
    ).rejects.toMatchObject({ message: 'Cannot write file' })

    await expect(readFile(backupPath!, 'utf8')).resolves.toBe('HELLO=world\n')
  })

  it('uses a unique backup path when the default backup already exists', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'cloak-write-'))
    const filePath = join(baseDir, '.env')
    const backupPath = `${filePath}.cloak.bak`
    await writeFile(filePath, 'HELLO=world\n', 'utf8')
    await writeFile(backupPath, 'older backup\n', 'utf8')

    await expect(
      writeWithBackup(filePath, 'ignored', async () => {
        throw new Error('Cannot write file')
      }),
    ).rejects.toMatchObject({
      backupPath: expect.stringMatching(/\.cloak\.bak\./),
    })

    await expect(readFile(backupPath, 'utf8')).resolves.toBe('older backup\n')
  })

  it('throws when backup cleanup fails', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'cloak-write-'))
    const filePath = join(baseDir, '.env')
    await writeFile(filePath, 'HELLO=world\n', 'utf8')

    const cleanup = vi.fn(async () => {
      throw new Error('cleanup failed')
    })

    await expect(writeWithBackup(filePath, 'HELLO=cloaked\n', undefined, cleanup)).rejects.toMatchObject({
      message: 'Cannot remove backup',
    })

    await expect(readFile(`${filePath}.cloak.bak`, 'utf8')).resolves.toBe('HELLO=world\n')
  })
})
