import {execFileSync, type ExecFileSyncOptionsWithStringEncoding} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const SHELL_FOLDERS = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders'
/** Windows' Known Folder id for Downloads. */
const DOWNLOADS_ID = '{374DE290-123F-4565-9164-39C4925E467B}'

type Env = Record<string, string | undefined>

type DownloadsDirOptions = {
  platform?: string
  homedir?: string
  env?: Env
  /** the raw User Shell Folders value for Downloads (Windows) */
  readRegistry?: () => string | undefined
  readFile?: (file: string) => string | undefined
}

/**
 * The folder the OS treats as Downloads. People move it — to another drive
 * on Windows, to a localized name on Linux — and then ~/Downloads is the
 * wrong place, or doesn't exist at all.
 */
export function downloadsDir({
  platform = process.platform,
  homedir = os.homedir(),
  env = process.env,
  readRegistry = readDownloadsFromRegistry,
  readFile = readTextFile,
}: DownloadsDirOptions = {}): string {
  const p = platform === 'win32' ? path.win32 : path.posix
  const fallback = p.join(homedir, 'Downloads')

  if (platform === 'win32') {
    const raw = readRegistry()
    // REG_EXPAND_SZ, usually "%USERPROFILE%\Downloads"; env names are case-insensitive
    const expanded = raw?.replace(/%([^%]+)%/g, (match, name: string) => lookup(env, name) ?? match)
    return expanded && !expanded.includes('%') && p.isAbsolute(expanded) ? expanded : fallback
  }

  if (platform === 'linux' || platform === 'freebsd' || platform === 'openbsd') {
    const fromEnv = env.XDG_DOWNLOAD_DIR
    if (fromEnv && p.isAbsolute(fromEnv)) return fromEnv
    const configHome = env.XDG_CONFIG_HOME && p.isAbsolute(env.XDG_CONFIG_HOME) ? env.XDG_CONFIG_HOME : p.join(homedir, '.config')
    const line = /^\s*XDG_DOWNLOAD_DIR\s*=\s*"([^"]*)"/m.exec(readFile(p.join(configHome, 'user-dirs.dirs')) ?? '')?.[1]
    if (line) {
      const dir = line.replace(/^\$HOME(?=\/|$)/, homedir)
      // xdg-user-dirs marks a disabled folder by pointing it at $HOME itself
      if (p.isAbsolute(dir) && p.resolve(dir) !== p.resolve(homedir)) return dir
    }
  }

  return fallback
}

function lookup(env: Env, name: string): string | undefined {
  const key = Object.keys(env).find(k => k.toLowerCase() === name.toLowerCase())
  return key === undefined ? undefined : env[key]
}

function readTextFile(file: string): string | undefined {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return undefined
  }
}

function readDownloadsFromRegistry(): string | undefined {
  const options: ExecFileSyncOptionsWithStringEncoding = {
    encoding: 'utf8',
    timeout: 3000,
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
  }
  try {
    const output = execFileSync('reg', ['query', SHELL_FOLDERS, '/v', DOWNLOADS_ID], options)
    const value = /REG_(?:EXPAND_)?SZ\s+(.+?)\s*$/m.exec(output)?.[1]
    // reg prints in the console's code page, which mangles non-ASCII paths.
    // In that rare case ask PowerShell, which is 30× slower but speaks UTF-8.
    if (!value?.includes('�')) return value
    const script = `[Console]::OutputEncoding = [Text.Encoding]::UTF8; (Get-ItemProperty -LiteralPath 'Registry::${SHELL_FOLDERS}').'${DOWNLOADS_ID}'`
    return execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], options).trim() || undefined
  } catch {
    return undefined
  }
}

/** A path typed by the user, absolute, with a leading ~ expanded. */
export function resolveUserPath(input: string, homedir = os.homedir()): string {
  const expanded =
    input === '~' || input.startsWith('~/') || input.startsWith(`~${path.sep}`) ? path.join(homedir, input.slice(1)) : input
  return path.resolve(expanded)
}

/** Absolute folder to save into: the -o value, or the Downloads folder. */
export function resolveOutputDir(flag?: string, homedir = os.homedir(), defaultDir = () => downloadsDir({homedir})): string {
  return flag === undefined ? defaultDir() : resolveUserPath(flag, homedir)
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
