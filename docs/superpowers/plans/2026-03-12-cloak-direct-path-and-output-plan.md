# Cloak Direct Path and Separate Output Implementation Plan

> **For agentic workers:** REQUIRED: Use @superpowers:subagent-driven-development (if subagents available) or @superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add direct-path invocation to `cloak` and change encode/decode from in-place overwrite to separate output files using the `.cloak` suffix.

**Architecture:** Keep the existing password/auth flow, but split file-target resolution from interactive file selection so the app can support both `cloak` and `cloak <path>`. Move output-name mapping and warning decisions into focused helpers so `runCloak` becomes an orchestration layer for source selection, action detection, confirmation, and destination writes without backup files.

**Tech Stack:** Node.js, TypeScript, npm, `@inquirer/prompts`, `hash-wasm`, Node `crypto`, `tsx`, Vitest

---

## Planned File Structure

**Modify:**
- `src/cli.ts` — parse optional path argument and pass it into the app entry flow
- `src/app/runCloak.ts` — support picker mode and direct-path mode, outside-root warnings, new destination writes, and separate overwrite confirmations
- `src/app/types.ts` — extend prompt interfaces for new warning/confirmation variants and optional direct-path options
- `src/files/readFileState.ts` — keep text validation helpers and add any small file-state helpers needed for suffix-based decode validation
- `src/files/listFiles.ts` — likely unchanged or lightly adjusted if shared types need reuse
- `src/crypto/fileCipher.ts` — reuse current encode/decode helpers with name-first action selection in orchestration
- `src/ui/prompts.ts` — add prompts for outside-directory warnings and source/output confirmation text
- `tests/runCloak.test.ts` — cover direct-path flow, overwrite warnings, abort behavior, and separate output files
- `tests/prompts.test.ts` — cover new prompt text/messages if kept unit-testable
- `README.md` — document the breaking CLI/output behavior after code changes land

**Create:**
- `src/files/resolveTarget.ts` — normalize CLI-supplied path, compute canonical source path, detect outside-root status, determine action candidate, and map output path
- `tests/resolveTarget.test.ts` — focused tests for path normalization, suffix mapping, and destination calculation

**Delete:**
- `src/files/writeWithBackup.ts` — remove the old in-place backup helper because the new flow never writes in place
- `tests/writeWithBackup.test.ts` — remove backup-specific tests with the helper they cover

## Chunk 1: Entry Flow and Path/Output Resolution

### Task 1: Add CLI argument parsing for optional direct-path mode

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/app/runCloak.ts`
- Modify: `src/app/types.ts`
- Test: `tests/runCloak.test.ts`

- [ ] **Step 1: Write the failing test that `cloak` with no argument still uses the picker**

Add a test to `tests/runCloak.test.ts` like:

```ts
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
    confirmAction: vi.fn().mockResolvedValue(true),
    showMessage: vi.fn(),
  }

  await runCloak({ cwd: root, configDir, prompts })

  expect(prompts.selectFile).toHaveBeenCalledOnce()
})
```

- [ ] **Step 2: Write the failing test for direct-path invocation bypassing the picker**

Add a second test to `tests/runCloak.test.ts` like:

```ts
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
    confirmAction: vi.fn().mockResolvedValue(true),
    showMessage: vi.fn(),
  }

  await runCloak({ cwd: root, configDir, prompts, directPath: './.env' })

  expect(prompts.selectFile).not.toHaveBeenCalled()
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run:
```bash
npm test -- tests/runCloak.test.ts
```

Expected: FAIL because `directPath` is not implemented yet.

- [ ] **Step 4: Extend the app types for direct-path mode**

Update `src/app/types.ts` to add the outside-root warning prompt and support the richer flow:

```ts
export type ActionKind = 'encode' | 'decode'

export type PromptPort = {
  askNewPassword(): Promise<string>
  askConfirmPassword(): Promise<string>
  askPassword(): Promise<string>
  selectFile(files: { name: string; path: string }[]): Promise<string>
  confirmOutsideRoot(path: string): Promise<boolean>
  confirmAction(action: ActionKind, sourcePath: string, outputPath: string, overwrite: boolean): Promise<boolean>
  showMessage(message: string): Promise<void>
}
```

Then update the local `RunCloakOptions` type in `src/app/runCloak.ts` to add:

```ts
type RunCloakOptions = {
  cwd?: string
  configDir?: string
  prompts?: PromptPort
  directPath?: string
}
```

- [ ] **Step 5: Implement minimal CLI argument parsing**

Update `src/cli.ts` so it passes one optional path argument only:

```ts
#!/usr/bin/env node
import { runCloak } from './app/runCloak.js'

const [, , directPath] = process.argv

runCloak({ directPath }).catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
})
```

- [ ] **Step 6: Implement the minimal direct-path branch in `runCloak`**

Add the smallest change needed so `runCloak`:
- uses picker mode when `directPath` is absent
- skips picker when `directPath` is present
- routes both modes through one shared source-selection path so later target/output logic does not fork unnecessarily
- continues using the existing file logic for now

Pseudo-shape:

```ts
const selectedPath = options.directPath
  ? resolve(cwd, options.directPath)
  : await prompts.selectFile(files)
```

Do not implement the full outside-root warning yet; just get the direct-path branch wired so the tests pass.

- [ ] **Step 7: Run the tests to verify they pass**

Run:
```bash
npm test -- tests/runCloak.test.ts
```

Expected: PASS for the new direct-path bypass test.

- [ ] **Step 8: Commit**

If this directory is a git repository:
```bash
git add src/cli.ts src/app/runCloak.ts src/app/types.ts tests/runCloak.test.ts
git commit -m "feat: add direct path entry flow"
```

### Task 2: Add path normalization, outside-root detection, and output-path mapping helpers

**Files:**
- Create: `src/files/resolveTarget.ts`
- Create: `tests/resolveTarget.test.ts`
- Modify: `src/app/runCloak.ts`

- [ ] **Step 1: Write failing tests for path normalization and output mapping**

Create `tests/resolveTarget.test.ts`:

```ts
import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { resolveTarget } from '../src/files/resolveTarget.js'

it('maps a plain file to an encode output with .cloak appended', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-target-'))
  const filePath = join(root, '.env')
  await writeFile(filePath, 'A=1\n', 'utf8')

  const target = await resolveTarget(root, './.env')
  expect(target.action).toBe('encode')
  expect(target.sourcePath).toBe(filePath)
  expect(target.outputPath).toBe(join(root, '.env.cloak'))
  expect(target.outsideRoot).toBe(false)
})

it('maps a .cloak file to a decode output by removing the final suffix', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-target-'))
  const filePath = join(root, '.env.cloak')
  await writeFile(filePath, '# CLOAK: ENCRYPTED\n{}', 'utf8')

  const target = await resolveTarget(root, filePath)
  expect(target.action).toBe('decode')
  expect(target.outputPath).toBe(join(root, '.env'))
})

it('marks a canonical path outside the startup directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-target-'))
  const outside = await mkdtemp(join(tmpdir(), 'cloak-target-outside-'))
  const filePath = join(outside, '.env')
  await writeFile(filePath, 'A=1\n', 'utf8')

  const target = await resolveTarget(root, filePath)
  expect(target.outsideRoot).toBe(true)
})
```

- [ ] **Step 2: Run the target-resolution tests to verify they fail**

Run:
```bash
npm test -- tests/resolveTarget.test.ts
```

Expected: FAIL because `resolveTarget` does not exist.

- [ ] **Step 3: Implement the target-resolution helper**

Create `src/files/resolveTarget.ts` with a focused return type:

```ts
import { realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path'
import type { ActionKind } from '../app/types.js'

export type ResolvedTarget = {
  sourcePath: string
  outputPath: string
  action: ActionKind
  outsideRoot: boolean
}

function isInsideRoot(rootDir: string, path: string): boolean {
  return path === rootDir || path.startsWith(`${rootDir}${sep}`)
}

export async function resolveTarget(rootDir: string, inputPath: string): Promise<ResolvedTarget> {
  const canonicalRoot = await realpath(rootDir)
  const rawPath = isAbsolute(inputPath) ? inputPath : resolve(rootDir, inputPath)
  const sourcePath = await realpath(rawPath)
  const action: ActionKind = sourcePath.endsWith('.cloak') ? 'decode' : 'encode'
  const outputPath = action === 'encode'
    ? `${sourcePath}.cloak`
    : sourcePath.slice(0, -'.cloak'.length)

  return {
    sourcePath,
    outputPath,
    action,
    outsideRoot: !isInsideRoot(canonicalRoot, sourcePath),
  }
}
```

- [ ] **Step 4: Wire `runCloak` to use `resolveTarget` for both picker mode and direct-path mode**

Modify `src/app/runCloak.ts` so source selection becomes:
- picker mode: use `selectFile(files)` to get the raw path, then pass that path into `resolveTarget(rootDir, selectedPath)`
- direct-path mode: call `resolveTarget(rootDir, options.directPath)` directly
- from this point on, both modes should share the same `sourcePath`, `outputPath`, `action`, and `outsideRoot` data shape

- [ ] **Step 5: Run the target-resolution tests to verify they pass**

Run:
```bash
npm test -- tests/resolveTarget.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

If this directory is a git repository:
```bash
git add src/files/resolveTarget.ts src/app/runCloak.ts tests/resolveTarget.test.ts
git commit -m "feat: add target path resolution helpers"
```

## Chunk 2: Action Confirmation and Separate Output Writes

### Task 3: Replace in-place confirmation with source/output confirmation and overwrite warnings

**Files:**
- Modify: `src/ui/prompts.ts`
- Modify: `src/app/types.ts`
- Modify: `src/app/runCloak.ts`
- Test: `tests/prompts.test.ts`
- Test: `tests/runCloak.test.ts`

- [ ] **Step 1: Write failing tests for the new prompt text**

Add tests to `tests/prompts.test.ts` around a small exported message helper from `src/ui/prompts.ts`:

```ts
import { expect, it } from 'vitest'
import { actionMessage, overwriteWarningMessage, outsideRootMessage } from '../src/ui/prompts.js'

it('formats the encode confirmation with source and output', () => {
  expect(actionMessage('encode', '.env', '.env.cloak')).toContain('Encode this file?')
  expect(actionMessage('encode', '.env', '.env.cloak')).toContain('Source: .env')
  expect(actionMessage('encode', '.env', '.env.cloak')).toContain('Output: .env.cloak')
})

it('formats the decode overwrite warning', () => {
  expect(overwriteWarningMessage('.env')).toContain('WARNING: destination file already exists')
  expect(overwriteWarningMessage('.env')).toContain('Target: .env')
})

it('formats the outside-root warning', () => {
  expect(outsideRootMessage('/tmp/.env')).toContain('outside the current directory')
})
```

- [ ] **Step 2: Run the prompt tests and verify they fail**

Run:
```bash
npm test -- tests/prompts.test.ts
```

Expected: FAIL because the helpers are not exported yet.

- [ ] **Step 3: Implement message helpers and richer confirmation prompts**

Update `src/ui/prompts.ts` to export pure helpers:

```ts
import { confirm, password, select } from '@inquirer/prompts'
import type { ActionKind, PromptPort } from '../app/types.js'

export function actionMessage(action: ActionKind, sourcePath: string, outputPath: string): string {
  return action === 'encode'
    ? `Encode this file?\nSource: ${sourcePath}\nOutput: ${outputPath}`
    : `Decode this file?\nSource: ${sourcePath}\nOutput: ${outputPath}`
}

export function overwriteWarningMessage(targetPath: string): string {
  return `WARNING: destination file already exists\nTarget: ${targetPath}\nThis will replace the existing file.\nContinue?`
}

export function outsideRootMessage(path: string): string {
  return `Warning: this file is outside the current directory.\nPath: ${path}\nContinue?`
}
```

Then update `createPromptPort()` so:
- `confirmOutsideRoot(path)` shows `outsideRootMessage(path)`
- `confirmAction(action, sourcePath, outputPath, overwrite)` shows either `actionMessage(...)` or `overwriteWarningMessage(outputPath)` depending on `overwrite`

- [ ] **Step 4: Update `runCloak` to use the new confirmation model**

Modify `src/app/runCloak.ts` to:
- if `outsideRoot` is true, call `prompts.confirmOutsideRoot(sourcePath)` and return if declined
- determine whether the destination already exists
- call `prompts.confirmAction(action, sourcePath, outputPath, overwrite)`
- return if declined

- [ ] **Step 5: Add an app-flow test for declining the outside-root warning**

Add to `tests/runCloak.test.ts`:

```ts
it('aborts without writing when the user declines the outside-root warning', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-app-'))
  const outside = await mkdtemp(join(tmpdir(), 'cloak-app-outside-'))
  const configDir = join(root, '.config')
  const filePath = join(outside, '.env')
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
    showMessage: vi.fn(),
  }

  await runCloak({ cwd: root, configDir, prompts, directPath: filePath })

  await expect(access(`${filePath}.cloak`)).rejects.toThrow()
  expect(prompts.confirmAction).not.toHaveBeenCalled()
})
```

- [ ] **Step 6: Add an app-flow test for write failure surfacing `Cannot write file`**

Add a concrete test to `tests/runCloak.test.ts` like:

```ts
it('shows Cannot write file when destination writing fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-app-'))
  const configDir = join(root, '.config')
  const sourcePath = join(root, '.env')
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
    showMessage: vi.fn(),
  }

  const writer = vi.fn().mockRejectedValue(new Error('disk full'))

  await expect(runCloak({ cwd: root, configDir, prompts, writeOutput: writer })).rejects.toThrow('Cannot write file')
  expect(await readFile(sourcePath, 'utf8')).toBe(original)
  expect(prompts.showMessage).toHaveBeenCalledWith('Cannot write file')
})
```

Implement the smallest dependency-injection seam needed for this test if `runCloak` does not already accept an injected writer.

- [ ] **Step 7: Run the affected tests and verify they pass**

Run:
```bash
npm test -- tests/prompts.test.ts tests/runCloak.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

If this directory is a git repository:
```bash
git add src/ui/prompts.ts src/app/types.ts src/app/runCloak.ts tests/prompts.test.ts tests/runCloak.test.ts
git commit -m "feat: add direct path warnings and output confirmations"
```

### Task 4: Switch encode/decode writes to separate destination files without backups

**Files:**
- Modify: `src/app/runCloak.ts`
- Create: `src/files/writeOutput.ts`
- Delete: `src/files/writeWithBackup.ts`
- Test: `tests/runCloak.test.ts`
- Delete: `tests/writeWithBackup.test.ts`

- [ ] **Step 1: Write the failing tests for separate-output behavior**

Add to `tests/runCloak.test.ts` concrete tests like:

```ts
it('encodes to a new .cloak file and leaves the source unchanged', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-app-'))
  const configDir = join(root, '.config')
  const sourcePath = join(root, '.env')
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
    showMessage: vi.fn(),
  }

  await runCloak({ cwd: root, configDir, prompts })

  expect(await readFile(sourcePath, 'utf8')).toBe(original)
  expect(await readFile(`${sourcePath}.cloak`, 'utf8')).toContain('# CLOAK: ENCRYPTED')
})

it('decodes to the original name and leaves the .cloak source unchanged', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-app-'))
  const configDir = join(root, '.config')
  const sourcePath = join(root, '.env.cloak')
  const encoded = await encodeTextFile('API_KEY=abc123\n', 'secret123')
  await mkdir(configDir, { recursive: true })
  await writeFile(sourcePath, encoded, 'utf8')
  await writeFile(join(configDir, 'config.json'), JSON.stringify(await createPasswordRecord('secret123')), 'utf8')

  const prompts = {
    askNewPassword: vi.fn(),
    askConfirmPassword: vi.fn(),
    askPassword: vi.fn().mockResolvedValue('secret123'),
    selectFile: vi.fn().mockResolvedValue(sourcePath),
    confirmOutsideRoot: vi.fn(),
    confirmAction: vi.fn().mockResolvedValue(true),
    showMessage: vi.fn(),
  }

  await runCloak({ cwd: root, configDir, prompts })

  expect(await readFile(sourcePath, 'utf8')).toBe(encoded)
  expect(await readFile(join(root, '.env'), 'utf8')).toBe('API_KEY=abc123\n')
})

it('aborts before writing when outputPath equals sourcePath', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-app-'))
  const configDir = join(root, '.config')
  const sourcePath = join(root, '.env')
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
    showMessage: vi.fn(),
  }

  const writer = vi.fn()

  await expect(
    runCloak({
      cwd: root,
      configDir,
      prompts,
      writeOutput: writer,
      resolveTarget: async () => ({
        sourcePath,
        outputPath: sourcePath,
        action: 'encode',
        outsideRoot: false,
      }),
    }),
  ).rejects.toThrow('Cannot write file')

  expect(writer).not.toHaveBeenCalled()
  expect(await readFile(sourcePath, 'utf8')).toBe(original)
})
```

- [ ] **Step 2: Run the runCloak tests to verify they fail**

Run:
```bash
npm test -- tests/runCloak.test.ts
```

Expected: FAIL because `runCloak` still writes in place and/or uses backup behavior.

- [ ] **Step 3: Implement a simple destination-write helper**

Create `src/files/writeOutput.ts`:

```ts
import { writeFile } from 'node:fs/promises'

export async function writeOutput(filePath: string, content: string): Promise<void> {
  await writeFile(filePath, content, 'utf8')
}
```

Also extend `RunCloakOptions` with narrow optional test seams for write failures and target-shape safety tests if needed:

```ts
type RunCloakOptions = {
  cwd?: string
  configDir?: string
  prompts?: PromptPort
  directPath?: string
  writeOutput?: (filePath: string, content: string) => Promise<void>
  resolveTarget?: (rootDir: string, inputPath: string) => Promise<ResolvedTarget>
}
```

If you inject `resolveTarget` for tests, keep that seam test-only and default it to the real helper in production code.

- [ ] **Step 4: Update `runCloak` to write to `outputPath` instead of the source file**

Replace the current write section with logic shaped like:

```ts
const nextText = action === 'encode'
  ? await encodeTextFile(currentText, sessionPassword)
  : await decodeTextFile(currentText, sessionPassword)

try {
  await writeOutput(outputPath, nextText)
} catch {
  await prompts.showMessage('Cannot write file')
  throw new Error('Cannot write file')
}
```

Also ensure:
- the source file is never modified
- if `outputPath === sourcePath`, throw before writing
- backup logic is no longer used in this flow

- [ ] **Step 5: Remove backup-specific files**

Delete both legacy backup artifacts in this breaking change:
- `src/files/writeWithBackup.ts`
- `tests/writeWithBackup.test.ts`

Do not leave them as legacy code unless execution uncovers a concrete dependency that must be removed in a follow-up step within the same plan.

- [ ] **Step 6: Run the affected tests and verify they pass**

Run:
```bash
npm test -- tests/runCloak.test.ts
```

Expected: PASS, with source files unchanged and destination files created.

- [ ] **Step 7: Commit**

If this directory is a git repository:
```bash
git add src/app/runCloak.ts src/files/writeOutput.ts src/files/writeWithBackup.ts tests/runCloak.test.ts tests/writeWithBackup.test.ts
git commit -m "feat: write cloak output to separate files"
```

## Chunk 3: Decode Validation, Overwrite Handling, and Final Cleanup

### Task 5: Enforce suffix-based action rules and decode validation

**Files:**
- Modify: `src/app/runCloak.ts`
- Modify: `src/files/resolveTarget.ts`
- Test: `tests/runCloak.test.ts`
- Test: `tests/fileCipher.test.ts`

- [ ] **Step 1: Write failing tests for `.cloak` decode validation**

Add to `tests/runCloak.test.ts`:

```ts
it('treats non-.cloak files as encode candidates even if they contain the cloak header', async () => {
  // arrange file named secret.txt with cloak marker content
  // expect encode path to secret.txt.cloak, not decode
})

it('rejects .cloak input when the cloak header appears on line 2 instead of line 1', async () => {
  // arrange bad.cloak with a different first line and `# CLOAK: ENCRYPTED` on line 2
  // expect runCloak to reject with new Error('File is not protected by Cloak')
})

it('rejects .cloak input with an invalid cloak header', async () => {
  // arrange bad.cloak without valid header on line 1
  // expect runCloak to reject with new Error('File is not protected by Cloak')
})
```

- [ ] **Step 2: Run the runCloak tests to verify they fail**

Run:
```bash
npm test -- tests/runCloak.test.ts
```

Expected: FAIL because action detection still relies on content rather than name-first behavior.

- [ ] **Step 3: Update `resolveTarget` and `runCloak` for name-first action selection**

Implement the rule:
- `.cloak` suffix => decode candidate
- all other files => encode candidate
- only `.cloak` inputs go through decode validation
- decode validation must check that line 1 exactly equals `# CLOAK: ENCRYPTED`; otherwise throw `File is not protected by Cloak`

Keep `fileCipher.ts` unchanged except for any tiny helper extraction you need. The orchestration layer should decide the action based on the file name, not the file header.

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
npm test -- tests/runCloak.test.ts tests/fileCipher.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

If this directory is a git repository:
```bash
git add src/app/runCloak.ts src/files/resolveTarget.ts tests/runCloak.test.ts tests/fileCipher.test.ts
git commit -m "feat: make cloak action selection suffix-based"
```

### Task 6: Add overwrite-collision coverage and decline-to-abort behavior

**Files:**
- Modify: `tests/runCloak.test.ts`
- Modify: `src/app/runCloak.ts`

- [ ] **Step 1: Write failing tests for destination collisions and declined confirmation**

Add tests like:

```ts
it('shows overwrite warning when encode destination already exists', async () => {
  // arrange .env and existing .env.cloak
  // expect confirmAction called with overwrite=true
})

it('shows overwrite warning when decode destination already exists', async () => {
  // arrange .env.cloak and existing .env
  // expect confirmAction called with overwrite=true
})

it('does not write when the user declines the encode overwrite warning', async () => {
  // arrange .env and existing .env.cloak with confirmAction => false
  // expect existing destination content unchanged
})

it('does not write when the user declines the decode overwrite warning', async () => {
  // arrange .env.cloak and existing .env with confirmAction => false
  // expect existing destination content unchanged
})

it('does not write when the user declines the normal confirmation', async () => {
  // arrange encode flow with confirmAction => false and no destination collision
  // expect destination file not to be created
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
npm test -- tests/runCloak.test.ts
```

Expected: FAIL until overwrite-state plumbing is correct.

- [ ] **Step 3: Implement overwrite-state checks in `runCloak`**

Use `access`/`stat` on `outputPath` to determine whether it already exists. Pass `overwrite=true` into `confirmAction(...)` for destination collisions.

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
npm test -- tests/runCloak.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

If this directory is a git repository:
```bash
git add src/app/runCloak.ts tests/runCloak.test.ts
git commit -m "feat: warn before replacing cloak destinations"
```

### Task 7: Update docs and run full verification

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-03-12-cloak-direct-path-and-output-design.md` only if implementation forced a spec clarification
- Test: `tests/runCloak.test.ts`
- Test: `tests/resolveTarget.test.ts`
- Test: `tests/fileCipher.test.ts`
- Test: `tests/constants.test.ts`
- Test: `tests/prompts.test.ts`
- Test: `tests/listFiles.test.ts`

- [ ] **Step 1: Update the README for the breaking change**

Revise `README.md` so it clearly documents:
- `cloak` vs `cloak <path>` usage
- `.cloak` output naming on encode
- decoded output naming on decode
- source files remain unchanged
- overwrite warnings on destination collisions
- outside-current-directory warning for direct paths
- removal of backup-file behavior from the main flow

- [ ] **Step 2: Add/confirm error-case coverage required by the spec**

Before running the full suite, make sure `tests/runCloak.test.ts` explicitly covers:
- direct-path invalid path => `Cannot read file`
- direct-path directory input => `Cannot read file`
- non-text input => `Cannot read file`
- invalid `.cloak` header => `File is not protected by Cloak`
- overwrite collision decline leaves destination unchanged

If any of these tests do not exist yet, add them in the earliest task where they naturally belong before continuing.

- [ ] **Step 3: Run the full test suite**

Run:
```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 4: Build the CLI**

Run:
```bash
npm run build
```

Expected: PASS.

- [ ] **Step 5: Run smoke-style verification for both entry paths**

Run practical checks for:
- no-argument picker flow creating `.cloak` output without changing source
- direct-path flow with `./.env`
- direct-path flow with absolute path outside current directory and decline/continue behavior
- decode flow writing back to the non-`.cloak` destination without changing the source `.cloak` file
- overwrite collision prompts for both encode and decode destinations
- invalid `.cloak` header behavior surfacing `File is not protected by Cloak`

If terminal interactivity is awkward, use the existing injected-prompt pattern in a small Node one-liner or dedicated temporary script and remove the temp script afterward.

- [ ] **Step 6: Fix any failing verification with the smallest possible change**

Re-run only the failing command first, then rerun the full verification (`npm test` and `npm run build`).

- [ ] **Step 7: Commit**

If this directory is a git repository:
```bash
git add README.md src tests
git commit -m "feat: add direct path cloak outputs"
```

## Plan review checklist

Before execution, the implementer must confirm these points from the spec while working:
- `cloak` with no argument still opens the picker
- `cloak <path>` skips the picker
- direct paths can be relative or absolute
- canonical paths outside the startup current directory show a warning before continuing
- encode writes to `source + '.cloak'` in the same directory as the source file
- decode writes to the same directory with only the final `.cloak` suffix removed
- source files remain unchanged for both encode and decode
- destination collisions show overwrite warnings
- declining any warning/confirmation aborts without writing
- action selection is name-first: `.cloak` means decode candidate, everything else means encode candidate
- decode validation still requires the Cloak header/content to be valid
- backup-file behavior is removed from the main encode/decode path
