#!/usr/bin/env node
import { runCloak } from './app/runCloak.js'

runCloak().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
})
