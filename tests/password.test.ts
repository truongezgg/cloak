import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import * as passwordModule from '../src/crypto/password.js'
import { loadConfig, saveConfig } from '../src/config/config.js'

describe('password config', () => {
  it('creates a config record with the approved argon2id settings', async () => {
    const record = await passwordModule.createPasswordRecord('secret123')
    expect(record.kdf).toEqual({
      name: 'argon2id',
      memoryCost: 64 * 1024,
      timeCost: 3,
      parallelism: 1,
      hashLength: 32,
      saltLength: 16,
    })
    expect(Buffer.from(record.salt, 'base64')).toHaveLength(16)
    expect(Buffer.from(record.passwordHash, 'base64')).toHaveLength(32)
  })

  it('uses timingSafeEqual during password verification', async () => {
    const { timingSafeEqual } = await import('node:crypto')
    let called = false
    passwordModule.setSafeEqual((a, b) => {
      called = true
      return timingSafeEqual(a, b)
    })

    try {
      const record = await passwordModule.createPasswordRecord('secret123')
      await passwordModule.verifyPassword('secret123', record)
      expect(called).toBe(true)
    } finally {
      passwordModule.resetSafeEqual()
    }
  })

  it('verifies the correct password and rejects a wrong one', async () => {
    const record = await passwordModule.createPasswordRecord('secret123')
    await expect(passwordModule.verifyPassword('secret123', record)).resolves.toBe(true)
    await expect(passwordModule.verifyPassword('wrong', record)).resolves.toBe(false)
  })

  it('still runs safeEqual when expected and actual hash lengths differ', async () => {
    const record = await passwordModule.createPasswordRecord('secret123')
    const shortened = {
      ...record,
      passwordHash: Buffer.from(record.passwordHash, 'base64').subarray(0, 8).toString('base64'),
    }

    let called = false
    let comparedLength = 0
    passwordModule.setSafeEqual((a, b) => {
      called = true
      comparedLength = a.length
      return false
    })

    try {
      await expect(passwordModule.verifyPassword('secret123', shortened)).resolves.toBe(false)
      expect(called).toBe(true)
      expect(comparedLength).toBe(32)
    } finally {
      passwordModule.resetSafeEqual()
    }
  })

  it('returns null when config.json is missing', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'cloak-config-'))
    await expect(loadConfig(baseDir)).resolves.toBeNull()
  })

  it('returns null when passwordHash is missing', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'cloak-config-'))
    await writeFile(
      join(baseDir, 'config.json'),
      JSON.stringify({
        salt: 'c2FsdA==',
        kdf: {
          name: 'argon2id',
          memoryCost: 64 * 1024,
          timeCost: 3,
          parallelism: 1,
          hashLength: 32,
          saltLength: 16,
        },
      }),
      'utf8',
    )
    await expect(loadConfig(baseDir)).resolves.toBeNull()
  })

  it('throws a clear error when passwordHash is present but not a string', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'cloak-config-'))
    await writeFile(
      join(baseDir, 'config.json'),
      JSON.stringify({
        passwordHash: 123,
        salt: 'c2FsdA==',
        kdf: {
          name: 'argon2id',
          memoryCost: 64 * 1024,
          timeCost: 3,
          parallelism: 1,
          hashLength: 32,
          saltLength: 16,
        },
      }),
      'utf8',
    )
    await expect(loadConfig(baseDir)).rejects.toThrow('Invalid config.json: passwordHash must be a non-empty string')
  })

  it('throws a clear error when passwordHash is present but empty', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'cloak-config-'))
    await writeFile(
      join(baseDir, 'config.json'),
      JSON.stringify({
        passwordHash: '',
        salt: 'c2FsdA==',
        kdf: {
          name: 'argon2id',
          memoryCost: 64 * 1024,
          timeCost: 3,
          parallelism: 1,
          hashLength: 32,
          saltLength: 16,
        },
      }),
      'utf8',
    )
    await expect(loadConfig(baseDir)).rejects.toThrow('Invalid config.json: passwordHash must be a non-empty string')
  })

  it('throws a clear error when config.json is malformed JSON', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'cloak-config-'))
    await writeFile(join(baseDir, 'config.json'), '{not json', 'utf8')
    await expect(loadConfig(baseDir)).rejects.toThrow('Invalid config.json: malformed JSON')
  })

  it('throws a clear error when config.json is not an object', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'cloak-config-'))
    await writeFile(join(baseDir, 'config.json'), JSON.stringify(['not-an-object']), 'utf8')
    await expect(loadConfig(baseDir)).rejects.toThrow('Invalid config.json: expected an object')
  })

  it('throws a clear error when kdf metadata is missing', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'cloak-config-'))
    await writeFile(
      join(baseDir, 'config.json'),
      JSON.stringify({
        passwordHash: 'aGVsbG8=',
        salt: 'c2FsdA==',
      }),
      'utf8',
    )
    await expect(loadConfig(baseDir)).rejects.toThrow('Invalid config.json: missing required fields')
  })

  it('throws a clear error when salt is missing', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'cloak-config-'))
    await writeFile(
      join(baseDir, 'config.json'),
      JSON.stringify({
        passwordHash: 'aGVsbG8=',
        kdf: {
          name: 'argon2id',
          memoryCost: 64 * 1024,
          timeCost: 3,
          parallelism: 1,
          hashLength: 32,
          saltLength: 16,
        },
      }),
      'utf8',
    )
    await expect(loadConfig(baseDir)).rejects.toThrow('Invalid config.json: missing required fields')
  })
})
