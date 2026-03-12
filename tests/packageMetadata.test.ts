import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('package metadata', () => {
  it('declares Node 20.12 or newer for runtime compatibility', async () => {
    const packageJsonPath = join(process.cwd(), 'package.json')
    const raw = await readFile(packageJsonPath, 'utf8')
    const pkg = JSON.parse(raw) as {
      engines?: {
        node?: string
      }
    }

    expect(pkg.engines?.node).toBe(">=20.12.0")
  })
})
