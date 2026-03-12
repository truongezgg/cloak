# Local `.cloak` Password Implementation Plan

> **For agentic workers:** REQUIRED: Use @superpowers:subagent-driven-development (if subagents available) or @superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the global config-based password flow with a single local `<root>/.cloak` password file, while restricting file access to the startup current-directory tree.

**Architecture:** Keep the existing small-module shape, but move password sourcing into a focused local-file helper that owns parsing and rewriting `<root>/.cloak`. Let target resolution and recursive file listing enforce workspace boundaries, and keep `runCloak` as the orchestration layer that wires password loading, file selection, path rejection, encode/decode, and user messaging together.

**Tech Stack:** Node.js, TypeScript, npm, `@inquirer/prompts`, Node `fs/promises`, Node `path`, Node `crypto`, Vitest

---

## Planned File Structure

**Create:**
- `src/files/localPassword.ts` — parse, load, and rewrite `<root>/.cloak`
- `tests/localPassword.test.ts` — local password parsing/load/save coverage

**Modify:**
- `src/app/runCloak.ts` — switch from global auth to local `.cloak` flow
- `src/app/types.ts` — remove obsolete global-auth types and simplify prompt contracts
- `src/files/listFiles.ts` — recurse under the workspace root and exclude `<root>/.cloak`
- `src/files/resolveTarget.ts` — expose reserved-file/outside-root metadata for `runCloak`
- `src/ui/prompts.ts` — remove retry/outside-root auth prompts and add local-password + guidance messaging
- `tests/runCloak.test.ts` — cover local `.cloak`, nested files, and outside-root rejection
- `tests/listFiles.test.ts` — cover recursive listing, reserved-file exclusion, and symlink rules
- `tests/resolveTarget.test.ts` — cover reserved root `.cloak` detection in addition to outside-root behavior
- `tests/prompts.test.ts` — update prompt API and outside-root guidance formatting tests
- `README.md` — document local `.cloak` behavior and current-directory-only access
- `.gitignore` — ignore `.cloak` so raw passwords are not committed

**Delete:**
- `src/config/config.ts` — obsolete global config loader
- `src/crypto/password.ts` — obsolete global password hashing/verification
- `tests/password.test.ts` — obsolete global-config/password tests

**Keep unchanged unless a failing test proves otherwise:**
- `src/crypto/fileCipher.ts`
- `src/files/readFileState.ts`
- `src/files/writeOutput.ts`
- `src/cli.ts`

## Chunk 1: Local password source and workspace boundaries

### Task 1: Add the local `.cloak` password helper

**Files:**
- Create: `src/files/localPassword.ts`
- Create: `tests/localPassword.test.ts`

- [ ] **Step 1: Write the failing tests for `.cloak` parsing and rewrite rules**

Create `tests/localPassword.test.ts`:

```ts
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadLocalPassword, saveLocalPassword } from '../src/files/localPassword.js'

describe('localPassword', () => {
  it('returns null when .cloak is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cloak-local-password-'))
    await expect(loadLocalPassword(root)).resolves.toBeNull()
  })

  it('returns the first valid PASSWORD entry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cloak-local-password-'))
    await writeFile(
      join(root, '.cloak'),
      ['# comment', 'PASSWORD=secret123', 'PASSWORD=ignored'].join('\n'),
      'utf8',
    )

    await expect(loadLocalPassword(root)).resolves.toBe('secret123')
  })

  it('treats empty PASSWORD values as invalid', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cloak-local-password-'))
    await writeFile(join(root, '.cloak'), 'PASSWORD=\n', 'utf8')
    await expect(loadLocalPassword(root)).resolves.toBeNull()
  })

  it('ignores unrelated lines when PASSWORD is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cloak-local-password-'))
    await writeFile(join(root, '.cloak'), 'HELLO=world\n', 'utf8')
    await expect(loadLocalPassword(root)).resolves.toBeNull()
  })

  it('rewrites .cloak in env format', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cloak-local-password-'))
    await saveLocalPassword(root, 'secret123')
    await expect(readFile(join(root, '.cloak'), 'utf8')).resolves.toBe('PASSWORD=secret123\n')
  })
})
```

- [ ] **Step 2: Run the new test file and verify it fails**

Run:
```bash
npm test -- tests/localPassword.test.ts
```

Expected: FAIL with a module-not-found error for `../src/files/localPassword.js`.

- [ ] **Step 3: Implement the local password helper**

Create `src/files/localPassword.ts`:

```ts
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const PASSWORD_PREFIX = 'PASSWORD='

function parsePasswordLine(text: string): string | null {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line.startsWith(PASSWORD_PREFIX)) {
      continue
    }

    const value = line.slice(PASSWORD_PREFIX.length)
    return value.length > 0 ? value : null
  }

  return null
}

export async function loadLocalPassword(rootDir: string): Promise<string | null> {
  try {
    const raw = await readFile(join(rootDir, '.cloak'), 'utf8')
    return parsePasswordLine(raw)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }
}

export async function saveLocalPassword(rootDir: string, password: string): Promise<void> {
  await writeFile(join(rootDir, '.cloak'), `PASSWORD=${password}\n`, 'utf8')
}
```

- [ ] **Step 4: Run the local password tests and verify they pass**

Run:
```bash
npm test -- tests/localPassword.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the local password helper**

Run if this directory is a git repository:
```bash
git add src/files/localPassword.ts tests/localPassword.test.ts
git commit -m "feat: add local .cloak password helper"
```

### Task 2: Extend target resolution for reserved `.cloak` detection

**Files:**
- Modify: `src/files/resolveTarget.ts`
- Modify: `tests/resolveTarget.test.ts`

- [ ] **Step 1: Write the failing reserved-file test**

Add to `tests/resolveTarget.test.ts`:

```ts
it('marks the workspace .cloak file as reserved', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-target-'))
  const passwordFile = join(root, '.cloak')
  await writeFile(passwordFile, 'PASSWORD=secret123\n', 'utf8')

  const target = await resolveTarget(root, passwordFile)
  expect(target.sourcePath).toBe(await realpath(passwordFile))
  expect(target.isWorkspacePasswordFile).toBe(true)
  expect(target.outsideRoot).toBe(false)
})
```

- [ ] **Step 2: Run the resolve-target tests and verify they fail**

Run:
```bash
npm test -- tests/resolveTarget.test.ts
```

Expected: FAIL because `isWorkspacePasswordFile` does not exist yet.

- [ ] **Step 3: Extend the resolved-target shape**

Update `src/files/resolveTarget.ts` so the return type includes the reserved-file flag:

```ts
export type ResolvedTarget = {
  sourcePath: string
  outputPath: string
  action: ActionKind
  outsideRoot: boolean
  isWorkspacePasswordFile: boolean
}
```

Then set the flag in `resolveTarget`:

```ts
const passwordFilePath = resolve(canonicalRoot, '.cloak')
const isWorkspacePasswordFile = sourcePath === passwordFilePath
```

Return that flag along with the existing fields.

- [ ] **Step 4: Run the resolve-target tests and verify they pass**

Run:
```bash
npm test -- tests/resolveTarget.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the target-resolution update**

Run if this directory is a git repository:
```bash
git add src/files/resolveTarget.ts tests/resolveTarget.test.ts
git commit -m "feat: mark reserved local password targets"
```

### Task 3: Make file listing recursive and exclude `<root>/.cloak`

**Files:**
- Modify: `src/files/listFiles.ts`
- Modify: `tests/listFiles.test.ts`

- [ ] **Step 1: Write failing tests for recursion and `.cloak` exclusion**

Replace the current top-level expectation in `tests/listFiles.test.ts` with:

```ts
it('lists files recursively under the workspace root', async () => {
  const root = await setupRoot()

  const files = await listSelectableFiles(root)
  expect(files.map((file) => file.name)).toEqual([
    '.env',
    'secret.json',
    'nested/hidden.txt',
    'z-last.md',
  ])
})

it('excludes the workspace .cloak file from the selectable list', async () => {
  const root = await setupRoot()
  await writeFile(join(root, '.cloak'), 'PASSWORD=secret123\n', 'utf8')

  const files = await listSelectableFiles(root)
  expect(files.map((file) => file.name)).not.toContain('.cloak')
})
```

- [ ] **Step 2: Run the listing tests and verify they fail**

Run:
```bash
npm test -- tests/listFiles.test.ts
```

Expected: FAIL because nested files are not listed and `.cloak` is not excluded yet.

- [ ] **Step 3: Rework file listing to recurse under the root**

Update `src/files/listFiles.ts` to:
- walk subdirectories under the canonical root
- skip the root `.cloak` file
- keep skipping symlinks that resolve outside the root
- return `name` as the relative path from root (for example `nested/hidden.txt`)
- keep `path` as the absolute path for selection

Use this traversal shape:

```ts
async function collectFiles(rootDir: string, currentDir: string, files: SelectableFile[]): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true })

  for (const entry of entries) {
    const entryPath = join(currentDir, entry.name)

    if (entry.isDirectory()) {
      await collectFiles(rootDir, entryPath, files)
      continue
    }

    if (!entry.isFile() && !entry.isSymbolicLink()) {
      continue
    }

    let resolved: string
    try {
      resolved = await realpath(entryPath)
    } catch {
      continue
    }

    if (!resolved.startsWith(`${rootDir}${sep}`) && resolved !== rootDir) {
      continue
    }

    const relativePath = relative(rootDir, resolved)
    if (relativePath === '.cloak') {
      continue
    }

    files.push({ name: relativePath, path: resolved })
  }
}
```

Keep preferred sorting, but base the matcher check on `basename(file.name)` so nested `.env`, `.json`, `.txt`, `.pem`, and `.key` files still sort first.

- [ ] **Step 4: Run the listing tests and verify they pass**

Run:
```bash
npm test -- tests/listFiles.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the recursive picker listing**

Run if this directory is a git repository:
```bash
git add src/files/listFiles.ts tests/listFiles.test.ts
git commit -m "feat: recurse file picker under workspace root"
```

## Chunk 2: Prompt contract and main runtime flow

### Task 4: Simplify the prompt interface for local-password mode

**Files:**
- Modify: `src/app/types.ts`
- Modify: `src/ui/prompts.ts`
- Modify: `tests/prompts.test.ts`

- [ ] **Step 1: Write the failing prompt tests for the new API**

Update `tests/prompts.test.ts` to replace the old auth/outside-root expectations with:

```ts
it('cancels local password prompt when q is pressed', async () => {
  vi.mocked(password).mockImplementation(
    (_config, context?: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        context?.signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true })
      }),
  )

  const prompts = createPromptPort()
  const pending = prompts.askLocalPassword()

  stdin.emit('keypress', 'q', { name: 'q', ctrl: false, meta: false })

  await expect(pending).rejects.toThrow('User cancelled')
  expect(vi.mocked(password)).toHaveBeenCalledWith(
    { message: 'Enter password for .cloak (Esc/q to exit)' },
    expect.any(Object),
  )
})

it('formats the outside-root guidance with a cd suggestion', () => {
  expect(outsideRootMessage('/tmp/project/.env')).toContain('File is outside the current directory')
  expect(outsideRootMessage('/tmp/project/.env')).toContain('cd /tmp/project && cloak')
})
```

- [ ] **Step 2: Run the prompt tests and verify they fail**

Run:
```bash
npm test -- tests/prompts.test.ts
```

Expected: FAIL because `askLocalPassword` and the new guidance text do not exist yet.

- [ ] **Step 3: Simplify the prompt types**

Update `src/app/types.ts` so `PromptPort` becomes:

```ts
export type PromptPort = {
  askLocalPassword(): Promise<string>
  selectFile(files: { name: string; path: string }[]): Promise<string>
  confirmAction(action: ActionKind, sourcePath: string, outputPath: string, overwrite: boolean): Promise<boolean>
  showMessage(message: string): Promise<void>
}
```

Also remove the obsolete `PasswordRecord` type and the `configDir` field from `RunCloakOptions`.

- [ ] **Step 4: Update the real prompt adapter**

Change `src/ui/prompts.ts` so it:
- replaces `askNewPassword`, `askConfirmPassword`, and `askPassword` with `askLocalPassword`
- removes `confirmOutsideRoot`
- keeps `confirmAction` unchanged
- changes `outsideRootMessage` to compute a real directory suggestion using `dirname(path)`

Use this message shape:

```ts
export function outsideRootMessage(path: string): string {
  const targetDir = dirname(path)
  return `File is outside the current directory\nRun Cloak from that directory instead:\ncd ${targetDir} && cloak`
}
```

- [ ] **Step 5: Run the prompt tests and verify they pass**

Run:
```bash
npm test -- tests/prompts.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the prompt-contract update**

Run if this directory is a git repository:
```bash
git add src/app/types.ts src/ui/prompts.ts tests/prompts.test.ts
git commit -m "refactor: simplify prompts for local password mode"
```

### Task 5: Rewrite `runCloak` around the workspace `.cloak`

**Files:**
- Modify: `src/app/runCloak.ts`
- Modify: `tests/runCloak.test.ts`
- Delete: `src/config/config.ts`
- Delete: `src/crypto/password.ts`
- Delete: `tests/password.test.ts`

- [ ] **Step 1: Replace the old runtime tests with local `.cloak` coverage**

In `tests/runCloak.test.ts`, remove config-based setup and add these cases:

```ts
it('creates .cloak on first run and uses it to encode the selected file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-app-'))
  const filePath = join(root, '.env')
  await writeFile(filePath, 'HELLO=world\n', 'utf8')

  const prompts = {
    askLocalPassword: vi.fn().mockResolvedValue('secret123'),
    selectFile: vi.fn().mockResolvedValue(filePath),
    confirmAction: vi.fn().mockResolvedValue(true),
    showMessage: vi.fn().mockResolvedValue(undefined),
  }

  await runCloak({ cwd: root, prompts })

  await expect(readFile(join(root, '.cloak'), 'utf8')).resolves.toBe('PASSWORD=secret123\n')
  await expect(readFile(`${await realpath(filePath)}.cloak`, 'utf8')).resolves.toContain('# CLOAK: ENCRYPTED\n')
  expect(prompts.askLocalPassword).toHaveBeenCalledOnce()
})

it('rewrites invalid .cloak content before continuing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-app-'))
  const filePath = join(root, 'secret.txt')
  await writeFile(join(root, '.cloak'), 'PASSWORD=\n', 'utf8')
  await writeFile(filePath, 'SECRET=1\n', 'utf8')

  const prompts = {
    askLocalPassword: vi.fn().mockResolvedValue('secret123'),
    selectFile: vi.fn().mockResolvedValue(filePath),
    confirmAction: vi.fn().mockResolvedValue(false),
    showMessage: vi.fn().mockResolvedValue(undefined),
  }

  await runCloak({ cwd: root, prompts })

  await expect(readFile(join(root, '.cloak'), 'utf8')).resolves.toBe('PASSWORD=secret123\n')
})

it('uses an existing valid .cloak without prompting', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-app-'))
  const filePath = join(root, '.env')
  await writeFile(join(root, '.cloak'), 'PASSWORD=secret123\n', 'utf8')
  await writeFile(filePath, 'HELLO=world\n', 'utf8')

  const prompts = {
    askLocalPassword: vi.fn(),
    selectFile: vi.fn().mockResolvedValue(filePath),
    confirmAction: vi.fn().mockResolvedValue(false),
    showMessage: vi.fn().mockResolvedValue(undefined),
  }

  await runCloak({ cwd: root, prompts })
  expect(prompts.askLocalPassword).not.toHaveBeenCalled()
})

it('rejects direct paths outside the workspace root with guidance', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-app-'))
  const outside = await mkdtemp(join(tmpdir(), 'cloak-app-outside-'))
  const outsideFile = join(outside, 'secret.txt')
  await writeFile(join(root, '.cloak'), 'PASSWORD=secret123\n', 'utf8')
  await writeFile(outsideFile, 'SECRET=1\n', 'utf8')

  const prompts = {
    askLocalPassword: vi.fn(),
    selectFile: vi.fn(),
    confirmAction: vi.fn(),
    showMessage: vi.fn().mockResolvedValue(undefined),
  }

  await expect(runCloak({ cwd: root, prompts, directPath: outsideFile })).rejects.toThrow(
    'File is outside the current directory',
  )
  expect(prompts.showMessage).toHaveBeenCalledWith(
    expect.stringContaining(`cd ${outside} && cloak`),
  )
  expect(prompts.confirmAction).not.toHaveBeenCalled()
})

it('rejects targeting the workspace .cloak file itself', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cloak-app-'))
  await writeFile(join(root, '.cloak'), 'PASSWORD=secret123\n', 'utf8')

  const prompts = {
    askLocalPassword: vi.fn(),
    selectFile: vi.fn(),
    confirmAction: vi.fn(),
    showMessage: vi.fn().mockResolvedValue(undefined),
  }

  await expect(runCloak({ cwd: root, prompts, directPath: join(root, '.cloak') })).rejects.toThrow(
    'Cannot read file',
  )
  expect(prompts.showMessage).toHaveBeenCalledWith('Cannot read file')
})
```

Keep the existing encode/decode, overwrite-warning, cancellation, non-text, and write-failure cases, but rewrite all fixture setup to use `<root>/.cloak` instead of `config.json`.

- [ ] **Step 2: Run the app-flow tests and verify they fail**

Run:
```bash
npm test -- tests/runCloak.test.ts
```

Expected: FAIL because `runCloak` still expects global config and old prompt methods.

- [ ] **Step 3: Rewrite the runtime flow to load the workspace password**

Update `src/app/runCloak.ts` to:
- remove all imports from `src/config/config.ts` and `src/crypto/password.ts`
- import `loadLocalPassword` and `saveLocalPassword` from `src/files/localPassword.ts`
- load the password from `<root>/.cloak` before file selection
- prompt once with `prompts.askLocalPassword()` only when the file is missing or invalid
- rewrite `<root>/.cloak` immediately after the user provides the password
- keep the existing cancellation wrapper behavior for password, selection, and confirmation

Use this control-flow shape:

```ts
let sessionPassword = await loadLocalPassword(rootDir)

if (!sessionPassword) {
  const enteredPassword = await withUserCancelExit(() => prompts.askLocalPassword())
  if (enteredPassword === undefined) {
    return
  }

  await saveLocalPassword(rootDir, enteredPassword)
  sessionPassword = enteredPassword
}
```

- [ ] **Step 4: Reject outside-root and reserved `.cloak` targets before reading file contents**

In `src/app/runCloak.ts`, after `resolveTargetPath(rootDir, selectedPath)`:

```ts
if (target.outsideRoot) {
  const message = outsideRootMessage(target.sourcePath)
  await prompts.showMessage(message)
  throw new Error('File is outside the current directory')
}

if (target.isWorkspacePasswordFile) {
  await prompts.showMessage('Cannot read file')
  throw new Error('Cannot read file')
}
```

Do not call `confirmAction` for either case.

- [ ] **Step 5: Remove the obsolete global-auth code**

Delete:
```txt
src/config/config.ts
src/crypto/password.ts
tests/password.test.ts
```

Also remove any dead types or options left behind by those modules.

- [ ] **Step 6: Run the app-flow tests and verify they pass**

Run:
```bash
npm test -- tests/runCloak.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the runtime rewrite**

Run if this directory is a git repository:
```bash
git add src/app/runCloak.ts src/app/types.ts src/files/localPassword.ts src/files/resolveTarget.ts tests/runCloak.test.ts tests/resolveTarget.test.ts tests/localPassword.test.ts
git rm src/config/config.ts src/crypto/password.ts tests/password.test.ts
git commit -m "feat: switch cloak to local workspace passwords"
```

## Chunk 3: Docs, ignore rules, and final verification

### Task 6: Update docs and ignore rules for raw local passwords

**Files:**
- Modify: `README.md`
- Modify: `.gitignore`

- [ ] **Step 1: Write the `.gitignore` and README assertions as a checklist**

Confirm these exact changes before editing:
- `.gitignore` contains `.cloak`
- `README.md` no longer mentions `~/.config/cloak/config.json`
- `README.md` documents that Cloak uses `<cwd>/.cloak` with `PASSWORD=...`
- `README.md` documents outside-root rejection with a `cd ... && cloak` hint

- [ ] **Step 2: Add `.cloak` to git ignore rules**

Update `.gitignore` to include:

```gitignore
.cloak
```

Keep the existing `node_modules`, `dist`, and `.env*` entries.

- [ ] **Step 3: Rewrite the README authentication and path-behavior sections**

Update `README.md` so it says:
- Cloak uses a local `.cloak` file in the directory where the command starts
- `.cloak` stores `PASSWORD=...` in plain text
- if `.cloak` is missing or invalid, Cloak prompts once and rewrites it
- files under the current directory tree are allowed, including nested files
- files outside that tree are rejected with a suggestion to change directory and rerun Cloak
- `.cloak` itself is reserved and not an encode/decode target

- [ ] **Step 4: Review the docs diff for accidental stale references**

Run:
```bash
git diff -- README.md .gitignore
```

Expected: no mention of `config.json`, Argon2id login retries, or global password storage remains in the updated sections.

- [ ] **Step 5: Commit the documentation and ignore updates**

Run if this directory is a git repository:
```bash
git add README.md .gitignore
git commit -m "docs: describe local .cloak password workflow"
```

### Task 7: Run full verification and a manual smoke check

**Files:**
- Test: `tests/localPassword.test.ts`
- Test: `tests/resolveTarget.test.ts`
- Test: `tests/listFiles.test.ts`
- Test: `tests/prompts.test.ts`
- Test: `tests/runCloak.test.ts`
- Modify: any file required for the smallest possible fix

- [ ] **Step 1: Run the focused automated suite first**

Run:
```bash
npm test -- tests/localPassword.test.ts tests/resolveTarget.test.ts tests/listFiles.test.ts tests/prompts.test.ts tests/runCloak.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the full automated test suite**

Run:
```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Build the CLI**

Run:
```bash
npm run build
```

Expected: PASS and update `dist/cli.js`.

- [ ] **Step 4: Run a manual first-run smoke test**

Run from a temporary directory containing a text file but no `.cloak`:

```bash
node dist/cli.js
```

Expected manual behavior:
- prompts once for a password
- writes `<cwd>/.cloak` as `PASSWORD=...`
- lists nested files under the current directory tree
- excludes `.cloak` from the picker
- encoding a plain-text file writes `<file>.cloak`

- [ ] **Step 5: Run a manual outside-root smoke test**

Run from one directory while passing a file in another:

```bash
node dist/cli.js /absolute/path/outside/current/root/secret.txt
```

Expected manual behavior:
- shows:
  - `File is outside the current directory`
  - `Run Cloak from that directory instead:`
  - `cd /absolute/path/outside/current/root && cloak`
- does not ask for encode/decode confirmation
- does not read or write the outside file

- [ ] **Step 6: Fix the smallest failing surface, then re-run only the failing check first**

If anything fails:
- fix only the module responsible for the failure
- rerun the narrowest failing test file or command first
- rerun `npm test`
- rerun `npm run build` if the failure involved runtime code or types

- [ ] **Step 7: Commit the verified implementation**

Run if this directory is a git repository:
```bash
git add src tests README.md .gitignore
git commit -m "feat: use local .cloak passwords per workspace"
```

## Plan review checklist

Before execution, make sure the implementer confirms these details from the spec while working:
- only one password source is used per run: `<root>/.cloak`
- `.cloak` stores raw text as `PASSWORD=...`
- missing or invalid `.cloak` triggers exactly one password prompt, then rewrite
- no password confirmation step remains
- no password retry loop remains
- any file under the current directory tree can be selected, including nested files
- `<root>/.cloak` is excluded from picker mode and rejected in direct-path mode
- outside-root targets are rejected with the guidance message, not a confirmation prompt
- encode/decode action still comes from the filename suffix, except for the reserved root `.cloak`
- output naming rules remain unchanged
- `.cloak` is ignored by git so raw passwords are not staged accidentally
