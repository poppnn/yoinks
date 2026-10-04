import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

//absolute path set to user defined dir, or the ~/Downloads on default.
export function resolveOutputDir(flag?: string, homedir = os.homedir()): string {
  if (flag === undefined) return path.join(homedir, 'Downloads')
  const expanded =
    flag === '~' || flag.startsWith('~/') || flag.startsWith(`~${path.sep}`)
      ? path.join(homedir, flag.slice(1))
      : flag
  return path.resolve(expanded)
}

//mkdir if it doesn't exist.
export function ensureOutputDir(dir: string): void {
  try {
    fs.mkdirSync(dir, {recursive: true})
    fs.accessSync(dir, fs.constants.W_OK)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`can’t save to “${dir}” — ${reason}`)
  }
}