import { describe, expect, it } from 'vitest'
import { decodeTextFile, detectEncodedText, encodeTextFile } from '../src/crypto/fileCipher.js'

describe('file cipher', () => {
  it('detects encrypted files only when the first line matches exactly', () => {
    expect(detectEncodedText('# CLOAK: ENCRYPTED\n{}')).toBe(true)
    expect(detectEncodedText('# CLOAK: ENCRYPTED\r\n{}')).toBe(true)
    expect(detectEncodedText('# CLOAK: ENCRYPTED extra\n{}')).toBe(false)
    expect(detectEncodedText('plain text')).toBe(false)
  })

  it('round-trips plain text through encode and decode', async () => {
    const encoded = await encodeTextFile('HELLO=world\n', 'secret123')
    expect(encoded.startsWith('# CLOAK: ENCRYPTED\n')).toBe(true)
    await expect(decodeTextFile(encoded, 'secret123')).resolves.toBe('HELLO=world\n')
  })

  it('encodes an empty file with the cloak marker first', async () => {
    const encoded = await encodeTextFile('', 'secret123')
    expect(encoded.startsWith('# CLOAK: ENCRYPTED\n')).toBe(true)
  })

  it('rejects decode with a wrong password', async () => {
    const encoded = await encodeTextFile('top-secret', 'secret123')
    await expect(decodeTextFile(encoded, 'wrong')).rejects.toThrow('Wrong password')
  })

  it('rejects malformed payloads separately from wrong passwords', async () => {
    await expect(decodeTextFile('# CLOAK: ENCRYPTED\nnot-json', 'secret123')).rejects.toThrow('Invalid Cloak payload')
  })

  it('rejects well-formed payloads with invalid metadata', async () => {
    const base64 = Buffer.from('plaintext').toString('base64')
    const payload = JSON.stringify({
      version: 2,
      alg: 'aes-256-gcm',
      kdf: 'scrypt',
      salt: base64,
      iv: base64,
      tag: base64,
      ciphertext: base64,
    })
    await expect(decodeTextFile(`# CLOAK: ENCRYPTED\n${payload}`, 'secret123')).rejects.toThrow('Invalid Cloak payload')
  })

  it('rejects payloads with invalid base64 fields', async () => {
    const payload = JSON.stringify({
      version: 1,
      alg: 'aes-256-gcm',
      kdf: 'scrypt',
      salt: 'not-base64',
      iv: 'not-base64',
      tag: 'not-base64',
      ciphertext: 'not-base64',
    })
    await expect(decodeTextFile(`# CLOAK: ENCRYPTED\n${payload}`, 'secret123')).rejects.toThrow('Invalid Cloak payload')
  })
})
