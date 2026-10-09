import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {isThemeMode, type ThemeMode} from '../theme.js'
import type {Pick} from './args.js'
import {checkBrowserSpec, type Cookies} from './cookies.js'
import {resolveUserPath} from './output-dir.js'

export const CONFIG_FILE = path.join(os.homedir(), '.config', 'yoinks', 'config.json')

/** Defaults for every run. Command-line options win over these. */
export type Config = {
  output?: string
  cookies?: Cookies
  theme?: ThemeMode
  /** the choice highlighted in the picker, and used when it is skipped */
  format?: Pick
  /** same as --plain */
  plain?: boolean
  /** false: same as --no-mouse */
  mouse?: boolean
  /** false: same as --no-motion */
  motion?: boolean
}

const KEYS = ['output', 'cookies', 'cookiesFromBrowser', 'theme', 'format', 'plain', 'mouse', 'motion']

/**
 * Parses config.json, strictly: a misspelled key that is silently ignored
 * is worse than an error. Relative paths are relative to the config file,
 * not to wherever yoinks happens to run.
 */
export function parseConfig(text: string, file: string, homedir: string = os.homedir()): Config {
  const problem = (message: string) => new Error(`${file}: ${message}`)

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    throw problem(`not valid JSON (${error instanceof Error ? error.message : String(error)})`)
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw problem('expected an object, like {"output": "~/Videos"}')
  const entries = raw as Record<string, unknown>

  for (const key of Object.keys(entries)) {
    if (!KEYS.includes(key)) throw problem(`unknown setting “${key}” — use ${KEYS.join(', ')}`)
  }
  const stringAt = (key: string): string | undefined => {
    const value = entries[key]
    if (value === undefined) return undefined
    if (typeof value !== 'string' || !value.trim()) throw problem(`“${key}” must be a non-empty string`)
    return value
  }
  const booleanAt = (key: string): boolean | undefined => {
    const value = entries[key]
    if (value === undefined) return undefined
    if (typeof value !== 'boolean') throw problem(`“${key}” must be true or false`)
    return value
  }
  const toPath = (value: string) =>
    value === '~' || value.startsWith('~/') || value.startsWith('~\\')
      ? resolveUserPath(value, homedir)
      : path.resolve(path.dirname(file), value)

  const config: Config = {}

  const output = stringAt('output')
  if (output) config.output = toPath(output)

  const cookies = stringAt('cookies')
  const browser = stringAt('cookiesFromBrowser')
  if (cookies && browser) throw problem('use either “cookies” or “cookiesFromBrowser”')
  if (cookies) config.cookies = {file: toPath(cookies)}
  if (browser) {
    const unknown = checkBrowserSpec(browser)
    if (unknown) throw problem(unknown)
    config.cookies = {browser}
  }

  const theme = stringAt('theme')
  if (theme) {
    if (!isThemeMode(theme)) throw problem(`unknown theme “${theme}” — use auto, light, or dark`)
    config.theme = theme
  }

  const format = stringAt('format')
  if (format) {
    if (format !== 'best' && format !== 'mp3') throw problem(`unknown format “${format}” — use best or mp3`)
    config.format = format
  }

  for (const key of ['plain', 'mouse', 'motion'] as const) {
    const value = booleanAt(key)
    if (value !== undefined) config[key] = value
  }

  return config
}

/** The config file's settings, or none when there is no config file. */
export function loadConfig(file: string = CONFIG_FILE): Config {
  let text: string
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw new Error(`${file}: ${error instanceof Error ? error.message : String(error)}`)
  }
  return parseConfig(text, file)
}
