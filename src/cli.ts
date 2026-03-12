#!/usr/bin/env node
import { runCloak } from './app/runCloak.js'

const [, , directPath] = process.argv

runCloak({ directPath }).catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
})
