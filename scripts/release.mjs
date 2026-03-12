#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'))
const version = packageJson.version
const tag = `v${version}`

function run(command, args) {
  execFileSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
  })
}

function output(command, args) {
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim()
}

const status = output('git', ['status', '--short'])
if (status) {
  console.error('Working tree is not clean. Commit or stash changes before releasing.')
  process.exit(1)
}

const existingTag = output('git', ['tag', '--list', tag])
if (existingTag) {
  console.error(`Tag ${tag} already exists.`)
  process.exit(1)
}

run('npm', ['test'])
run('npm', ['run', 'build'])
run('git', ['tag', tag])
run('git', ['push', 'origin', 'HEAD'])
run('git', ['push', 'origin', tag])

console.log(`Release tag ${tag} pushed. GitHub Actions will build and publish the release artifacts.`)
