# Cloak CLI/TUI Design

Date: 2026-03-12
Topic: local `.cloak` password storage and current-directory-only file access

## Goal

Change Cloak from global password storage to a local password model.

When the user runs `cloak`:
- Cloak uses the startup current directory as the workspace root
- Cloak uses exactly one password file at `<root>/.cloak`
- Any file under the current directory tree, except the reserved password file `<root>/.cloak`, can be encoded or decoded with that password
- Files outside the current directory tree are rejected
- Cloak no longer uses `~/.config/cloak/config.json`
- Cloak stores the raw password in `.env`-style format inside `.cloak`

## Approved decisions

### Workspace root

- The startup current directory is the only workspace root for the run
- The password source is always `<root>/.cloak`
- Nested files under the current directory tree are allowed
- Cloak does not search for `.cloak` in parent directories, child directories, or the selected file’s directory

### Password storage

Use a plain-text file at `<root>/.cloak`:

```txt
PASSWORD=your-password
```

Rules:
- If `<root>/.cloak` does not exist, prompt once for a password and create it
- If `<root>/.cloak` exists but has no valid `PASSWORD=...`, prompt once and rewrite it
- If `<root>/.cloak` exists and contains a valid `PASSWORD=...`, use it automatically without prompting
- There is no password confirmation step
- There is no global password storage
- There is no hashed password storage

Parsing rules:
- Read the first valid `PASSWORD=` line
- Ignore unrelated lines
- Treat an empty `PASSWORD=` value as invalid
- Rewrite invalid or missing password content with a newly entered password

## File access rules

### Picker mode

- The file picker should allow selecting files anywhere under the current directory tree
- Listing should be recursive, not top-level only
- Symlinks are allowed only when their resolved path stays under the workspace root
- Files outside the root must never appear in the picker
- The root password file `<root>/.cloak` must never appear in the picker

### Direct-path mode

- `cloak <path>` still accepts relative or absolute paths
- After canonical resolution, the path must stay under the workspace root
- If the path resolves outside the workspace root, Cloak rejects it immediately
- If the path resolves to `<root>/.cloak`, Cloak rejects it immediately because the password file is not an encode/decode target

### Outside-root rejection

Outside-root access is a hard error, not a confirmation flow.

Show:

```txt
File is outside the current directory
Run Cloak from that directory instead:
cd /path/to/that/folder && cloak
```

Behavior:
- Do not show a continue prompt
- Do not use any `.cloak` file outside the startup root
- Do not read or write the target file

## Encode and decode behavior

Keep the current filename-based action rules for normal content files:

- Files ending in `.cloak` are decode candidates
- All other files are encode candidates
- Exception: the workspace password file `<root>/.cloak` is reserved for password storage and must never be treated as an encode/decode target

Keep the current output rules:

- `file` -> `file.cloak`
- `.env` -> `.env.cloak`
- `secret.json` -> `secret.json.cloak`
- `file.cloak` -> `file`
- `.env.cloak` -> `.env`

Decode validation stays strict:
- A decode candidate must have line 1 exactly equal to `# CLOAK: ENCRYPTED`
- Otherwise exit with `File is not protected by Cloak`

## Runtime flow

1. Resolve the startup current directory as the canonical workspace root
2. Load password from `<root>/.cloak`
3. If `.cloak` is missing or invalid, prompt once for a password and write:

```txt
PASSWORD=...
```

4. Select the target file:
   - picker mode: choose recursively from files under the root tree, excluding `<root>/.cloak`
   - direct-path mode: resolve the given path and reject it if outside root or if it targets `<root>/.cloak`
5. Read the selected file as text
6. Choose the action by filename for normal content files (`.cloak` => decode, otherwise encode); never treat `<root>/.cloak` as an encode/decode target
7. Show confirmation with source path, output path, and overwrite warning if needed
8. Encode or decode using the local password from `<root>/.cloak`
9. Write the output file
10. Show success message

## Error behavior

Keep these messages where applicable:
- `Cannot read file`
- `Cannot write file`
- `File is not protected by Cloak`

Remove old global-auth messages from the main flow:
- `Wrong password`
- `Too many failed attempts`
- `Passwords do not match`
- `Invalid config.json: ...`

Add outside-root rejection guidance:

```txt
File is outside the current directory
Run Cloak from that directory instead:
cd /path/to/that/folder && cloak
```

## Implementation impact

### Replace global config flow

The active flow should stop using:
- `src/config/config.ts`
- `src/crypto/password.ts`
- `RunCloakOptions.configDir`
- password verification and retry logic
- outside-root confirmation flow

### Add local password helper

Add a focused helper module for `<root>/.cloak` responsibilities:
- read and parse `<root>/.cloak`
- return the stored password when valid
- prompt for a password when missing or invalid
- rewrite `<root>/.cloak` as `PASSWORD=...\n`

### Update app orchestration

`src/app/runCloak.ts` should:
- load local password before file selection
- use the workspace-root `.cloak` for the whole session
- reject outside-root targets with the guidance message
- keep existing encode/decode and confirmation behavior otherwise

### Update file listing

`src/files/listFiles.ts` should change from top-level-only listing to recursive listing under the workspace root.

Ordering guidance:
- preferred file patterns should still sort ahead of others
- for nested files, display names should remain understandable and distinguish duplicate file names

### Update prompts and types

`src/ui/prompts.ts` and `src/app/types.ts` should remove prompts that are no longer needed:
- `askConfirmPassword`
- retry-based password verification prompts
- `confirmOutsideRoot`

Keep or add only prompts needed for:
- entering a local password when `.cloak` must be created or repaired
- selecting a file
- confirming encode/decode
- showing messages

## Testing

Update automated coverage to verify:
- `.cloak` missing => prompt once and create `<root>/.cloak`
- `.cloak` invalid or empty => prompt once and rewrite `<root>/.cloak`
- `.cloak` valid => no password prompt
- recursive picker includes nested files under root
- direct path outside root is rejected with the guidance message
- symlink targets outside root are rejected
- encode/decode still works with the local password
- old global-config modules are no longer part of the runtime path

## Out of scope

Do not add these in this change:
- per-subdirectory `.cloak` discovery
- parent-directory fallback lookup
- global password config
- hashed password storage
- multiple passwords in one workspace
- automatic migration from `~/.config/cloak/config.json`
