# Cloak Direct Path and Separate Output Design

Date: 2026-03-12
Topic: direct path invocation and `.cloak` output breaking change

## Goal

Change `cloak` so it supports direct file selection from the command line and changes write behavior from in-place overwrite to separate output files.

New goals:
- support `cloak <file-path>` where the path may be relative or absolute
- keep `cloak` with no arguments as the interactive picker flow
- encoding writes a new file with a `.cloak` suffix and keeps the original file unchanged
- decoding writes a new file with the final `.cloak` suffix removed and keeps the encoded file unchanged
- remove backup-file creation from this flow because writes no longer happen in place

## CLI behavior

### `cloak`
- ask for password as today
- if login succeeds, open the file picker
- user selects a file from the current directory
- Cloak decides whether to encode or decode
- Cloak shows the appropriate confirmation or warning before writing the output file

### `cloak <file-path>`
- ask for password as today
- if login succeeds, skip the picker
- resolve the given path directly
- accepted input forms:
  - `./.env`
  - `.env`
  - `/home/xxx/.env`
- resolve the input to a canonical realpath before checking whether it is inside or outside the startup current directory
- if the canonical path is outside the canonical startup current directory, show a warning before continuing
- if the path does not exist or is unreadable, show `Cannot read file`

## File mapping

### Encode
If the selected file is plain text:
- input: `file`
- output: `file.cloak` in the same directory as the source file
- keep the original `file` unchanged

Examples:
- `.env` -> `.env.cloak`
- `config.json` -> `config.json.cloak`
- `secret.pem` -> `secret.pem.cloak`

### Decode
If the selected file is a Cloak file:
- input: `file.cloak`
- output: original filename with the final `.cloak` suffix removed, in the same directory as the source file
- keep the original encoded file unchanged

Examples:
- `.env.cloak` -> `.env`
- `config.json.cloak` -> `config.json`

### Decode naming rule
- only strip the final `.cloak` suffix
- in this CLI flow, files not ending with `.cloak` are always treated as encode candidates
- Cloak must not try to guess a decode output name from any other suffix pattern

## Action detection

Action detection changes from purely content-based to name-first with content validation.

### Encode candidate
- if the file name does not end with `.cloak`, treat it as an encode candidate

### Decode candidate
- if the file name ends with `.cloak`, treat it as a decode candidate
- before decoding, validate that line 1 exactly equals `# CLOAK: ENCRYPTED`
- if the header is invalid, show `File is not protected by Cloak`

## Warnings and confirmation

### Warning for direct path outside current directory
If the user runs `cloak <path>` and the resolved file is outside the startup current directory, show a warning before continuing.

Example:

```txt
Warning: this file is outside the current directory.
Path: /home/xxx/.env
Continue?
```

### Warning for encode overwrite
If encoding `file` to `file.cloak` and `file.cloak` already exists, show a strong overwrite warning before writing.

Example:

```txt
WARNING: destination file already exists
Target: .env.cloak
This will replace the existing file.
Continue?
```

### Warning for decode overwrite
If decoding `file.cloak` to `file` and `file` already exists, show a strong overwrite warning before writing.

Example:

```txt
WARNING: destination file already exists
Target: .env
This will replace the existing file.
Continue?
```

### Normal encode confirmation
If encoding and destination does not exist, show a normal confirmation.

Example:

```txt
Encode this file?
Source: .env
Output: .env.cloak
```

### Normal decode confirmation
If decoding and destination does not exist, show a normal confirmation.

Example:

```txt
Decode this file?
Source: .env.cloak
Output: .env
```

### Safety rule
- if output path would equal input path for any reason, abort with an error

### Cancel behavior
- if the user declines any confirmation or warning prompt, Cloak aborts without writing anything
- this includes:
  - outside-current-directory warning
  - normal encode confirmation
  - normal decode confirmation
  - encode overwrite warning
  - decode overwrite warning


### Encode flow
1. User selects or passes `file`
2. Cloak reads and validates it as text
3. Cloak encrypts the content
4. Cloak writes the result to `file.cloak`
5. Original `file` is unchanged
6. No backup file is created

### Decode flow
1. User selects or passes `file.cloak`
2. Cloak validates:
   - file name ends with `.cloak`
   - line 1 is `# CLOAK: ENCRYPTED`
3. Cloak decrypts the content
4. Cloak writes the result to the destination with the final `.cloak` removed
5. Original `file.cloak` is unchanged
6. No backup file is created

### Replace behavior
- encode:
  - if `file.cloak` already exists, show overwrite warning before replacing it
- decode:
  - if the decoded destination file already exists, show overwrite warning before replacing it

### Write rule
- remove backup creation logic from this feature path
- write directly to the destination path after the user confirms

## Errors and edge cases

### Errors
- invalid path:
  - `Cannot read file`
- non-text file:
  - `Cannot read file`
- decode requested for file missing valid Cloak header:
  - `File is not protected by Cloak`
- write failure:
  - `Cannot write file`

### Edge cases
- `cloak ./file` and `cloak /full/path/file` are both supported
- if the user passes a directory instead of a file:
  - `Cannot read file`
- if output path equals input path:
  - abort with an error
- if source is outside current directory through direct path:
  - show warning and continue only after explicit confirmation
- picker mode continues to work for files in the current directory

## Testing requirements

The implementation plan must include coverage for:
- `cloak` with no argument still uses the picker flow
- `cloak ./.env` skips the picker and encodes to `./.env.cloak`
- `cloak /abs/path/.env` skips the picker and shows outside-directory warning when applicable
- decode of `.env.cloak` writes `.env`
- overwrite warning when decode target already exists
- overwrite warning when encode target `.cloak` already exists
- declining any warning or confirmation aborts without writing
- invalid Cloak header/content cases for `.cloak` inputs
- no backup-file behavior in the new flow

## Breaking change summary

This is a breaking change because:
- encode no longer overwrites the original file
- decode no longer overwrites the encoded file
- encoded files are now expected to use the `.cloak` suffix for normal decode flow
- backup creation is removed from the main encode/decode path
- direct path invocation adds a second entry mode besides the picker

## Recommended implementation direction

Use a dual-entry CLI design:
- `cloak` keeps the picker-based flow
- `cloak <path>` skips the picker and operates on the supplied path

Use suffix-based output mapping:
- encode: append `.cloak`
- decode: remove the final `.cloak`

Use explicit overwrite warnings instead of backup files:
- source stays untouched
- destination may be replaced only after explicit confirmation

## Implementation plan outline

1. Update CLI argument parsing so `cloak` supports either no file argument or one direct file path argument.
2. Add path normalization and canonical realpath checks for direct-path mode, including outside-current-directory warning behavior.
3. Refactor action detection to use file-name suffix rules first, then validate Cloak content before decode.
4. Add output-path mapping helpers for `append .cloak` and `remove final .cloak` in the same directory as the source file.
5. Replace in-place overwrite confirmation with source/output confirmation and overwrite warnings on destination collisions.
6. Remove backup-file usage from the main encode/decode path and switch to direct destination writes.
7. Update tests for no-argument picker flow, direct-path flow, overwrite warnings, decline-to-abort behavior, and separate output files.
8. Update user-facing documentation and help text to explain the new breaking behavior.
