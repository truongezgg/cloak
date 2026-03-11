# Cloak CLI/TUI Design

Date: 2026-03-12
Topic: password-protected file encode/decode TUI

## Goal

Create a CLI/TUI tool named `cloak`.

When the user runs `cloak`:
- if a password has not been set yet, the tool asks the user to create one
- on every run, the tool asks for the password
- if the password is correct, the tool opens a file picker
- after the user selects a file, the tool automatically decides whether to encode or decode based on the first line of the file
- the tool then asks for confirmation and overwrites the same file

Configuration is stored under:

```txt
~/.config/cloak/
```

## User flow

1. User runs `cloak`
2. If no password exists yet:
   - ask for a new password
   - ask to confirm it
   - save only password-derived auth material in `~/.config/cloak/config.json`
3. Ask user for password
4. If the password is wrong:
   - show `Wrong password`
   - allow up to 3 tries total
   - exit after the 3rd failed try with `Too many failed attempts`
5. If the password is correct:
   - open a file picker starting in current directory `./`
   - show likely files such as `.env*`, `.json`, `.txt`, `.pem`, `.key`
6. After file selection:
   - inspect the first line of the file
   - if line 1 exactly equals `# CLOAK: ENCRYPTED` (case-sensitive, allowing a trailing `\r` from CRLF files), treat the file as encoded and prepare to decode
   - otherwise treat the file as plain text and prepare to encode
7. Show confirmation:
   - `This file is plain text. Encode it?`
   - or `This file is protected by Cloak. Decode it?`
8. On confirm, overwrite the same file

## Encoded file format

The encoded-file marker is:

```txt
# CLOAK: ENCRYPTED
```

Rules:
- line 1 of any encoded file must exactly equal `# CLOAK: ENCRYPTED`
- files are treated as encoded only when line 1 exactly equals that marker, case-sensitive, allowing a trailing `\r` from CRLF files
- all other files are treated as plain text

Applies to these file types:
- `.env*`
- `*.json`
- `*.txt`
- `*.pem`
- `*.key`

All of these are treated as text files for encode/decode purposes.

## Config storage

Use:

```txt
~/.config/cloak/config.json
```

Suggested shape:

```json
{
  "passwordHash": "...",
  "salt": "...",
  "kdf": {
    "name": "argon2id"
  }
}
```

Behavior:
- if `config.json` does not exist, or `passwordHash` is missing, `cloak` enters first-run setup
- first-run setup asks for password twice
- after successful setup, the current run continues as authenticated and goes straight to the file picker
- save only password-derived auth material: password hash, salt, and KDF metadata
- never store the raw password
- use Argon2id with a per-user random salt
- minimum Argon2id requirements: memory cost 64 MiB, time cost 3, parallelism 1, salt length 16 bytes, hash length 32 bytes
- every later run asks for password and verifies against `passwordHash`
- use constant-time comparison for password verification

## TUI behavior

After successful login:
- open directly into a file picker rooted at current directory `./`
- the picker must not allow selecting a path outside the startup current directory
- resolve the selected path and reject it if it is outside the startup current directory
- default suggestions are files in `./` only
- allow any file in `./`, but prioritize files matching:
  - `.env*`
  - `*.json`
  - `*.txt`
  - `*.pem`
  - `*.key`
- after selecting a file:
  - inspect first line
  - show one confirmation screen:
    - `This file is plain text. Encode it?`
    - or `This file is protected by Cloak. Decode it?`
- on confirm:
  - overwrite the same file
  - show success message:
    - `File encoded successfully`
    - or `File decoded successfully`
- `Esc` or `q` exits without changing anything

## Errors and safety

Error behavior:
- wrong password:
  - show `Wrong password`
  - allow up to 3 tries
  - then exit with `Too many failed attempts`
- password setup mismatch:
  - show `Passwords do not match`
  - ask again
- unreadable file:
  - show `Cannot read file`
- write failure:
  - show `Cannot write file`
- empty file:
  - still allow encoding
  - result starts with `# CLOAK: ENCRYPTED`

Backup and overwrite behavior:
1. Create a backup file first
2. If the default backup path already exists, create a unique backup path instead and never overwrite an existing backup file
3. Write the new content to the original file path
4. If the write succeeds, remove the backup file
5. If the write fails, keep the backup file

Suggested backup naming:
- `.env` -> `.env.cloak.bak`
- `secret.json` -> `secret.json.cloak.bak`

## Recommended approach

Use a minimal single-flow TUI with one confirmation step before writing.

Why this approach:
- keeps the tool simple
- matches the desired workflow of selecting a file and automatically rotating between encoded and plain text states
- adds a small safety check before overwriting the file

## Out of scope for now

Do not add these yet unless requested later:
- recursive file search by default
- explicit encode/decode menu before file selection
- multiple config files
- storing the raw password
- non-text file support
- extra metadata headers beyond the first-line marker
