import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Absolute folder to save into: the -o value with ~ expanded, or ~/Downloads. */
export function resolveOutputDir(flag?: string, homedir = os.homedir()): string {
  if (flag === undefined) return path.join(homedir, 'Downloads')
  const expanded =
    flag === '~' || flag.startsWith('~/') || flag.startsWith(`~${path.sep}`)
      ? path.join(homedir, flag.slice(1))
      : flag
  return path.resolve(expanded)
}

/** Creates the folder if needed and checks we can write to it. */
export function ensureOutputDir(dir: string): void {
  try {
    fs.mkdirSync(dir, {recursive: true})
    fs.accessSync(dir, fs.constants.W_OK)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`can’t save to “${dir}” — ${reason}`)
  }
}
