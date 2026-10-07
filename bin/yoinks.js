#!/usr/bin/env node

const major = Number(process.versions.node.split('.')[0])

if (major < 22) {
  console.error(`yoinks requires Node.js 22 or later (found ${process.version}).`)
  process.exitCode = 1
} else {
  await import('../dist/cli.js')
}
