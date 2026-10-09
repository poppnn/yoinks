import {isThemeMode, type ThemeMode} from '../theme.js'
import {checkBrowserSpec, type Cookies} from './cookies.js'
import {checkYtDlpArgs} from './passthrough.js'
import {validateSaveAs} from './save-as.js'

/** what to download when skipping the picker */
export type Pick = 'best' | 'mp3'

export type CliArgs = {
  help: boolean
  version: boolean
  /** update yoinks' own yt-dlp and exit */
  update: boolean
  initialUrl?: string
  themeMode?: ThemeMode
  outputDir?: string
  /** no alternate screen, mouse or animation: output stays in the scrollback */
  plain?: boolean
  noMouse?: boolean
  noMotion?: boolean
  /** skip the picker and download this, without the interface */
  pick?: Pick
  /** file name for the download, extension added by the format */
  name?: string
  /** playlist items to download, e.g. "1-3,7" */
  items?: string
  /** everything after --, passed to yt-dlp as is */
  ytdlpArgs?: string[]
  /** sign in with these cookies — never on by default */
  cookies?: Cookies
  error?: string
}

export function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {help: false, version: false, update: false}
  const positional: string[] = []

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!
    if (arg === '--') {
      const rest = args.slice(index + 1)
      const refused = checkYtDlpArgs(rest)
      if (refused) return {...result, error: refused}
      result.ytdlpArgs = rest
      break
    } else if (arg === '-h' || arg === '--help') {
      result.help = true
    } else if (arg === '-v' || arg === '--version') {
      result.version = true
    } else if (arg === '--update') {
      result.update = true
    } else if (arg === '--plain') {
      result.plain = true
    } else if (arg === '--no-mouse') {
      result.noMouse = true
    } else if (arg === '--no-motion') {
      result.noMotion = true
    } else if (arg === '--best' || arg === '--mp3') {
      if (result.pick && result.pick !== arg.slice(2)) return {...result, error: 'use either --best or --mp3'}
      result.pick = arg === '--best' ? 'best' : 'mp3'
    } else if (arg === '--theme') {
      const value = args[++index]
      if (!value) return {...result, error: '--theme needs a value: auto, light, or dark'}
      if (!isThemeMode(value)) return {...result, error: `unknown theme “${value}” — use auto, light, or dark`}
      result.themeMode = value
    } else if (arg.startsWith('--theme=')) {
      const value = arg.slice('--theme='.length)
      if (!isThemeMode(value)) return {...result, error: `unknown theme “${value}” — use auto, light, or dark`}
      result.themeMode = value
    } else if (arg === '-o' || arg === '--output') {
      const value = args[++index]
      if (!value || value.startsWith('-')) return {...result, error: `${arg} needs a folder, e.g. ${arg} ~/Videos`}
      result.outputDir = value
    } else if (arg.startsWith('--output=')) {
      const value = arg.slice('--output='.length)
      if (!value) return {...result, error: '--output needs a folder, e.g. --output=~/Videos'}
      result.outputDir = value
    } else if (arg === '--items' || arg.startsWith('--items=')) {
      const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : args[++index]
      if (!value || !/^[\d,\s-]+$/.test(value)) return {...result, error: '--items needs numbers or ranges, e.g. 1-3,7'}
      result.items = value
    } else if (arg === '-n' || arg === '--name' || arg.startsWith('--name=')) {
      const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : args[++index]
      if (value === undefined || value.startsWith('-')) return {...result, error: `${arg} needs a file name`}
      const problem = validateSaveAs(value)
      if (problem) return {...result, error: problem}
      result.name = value.trim()
    } else if (arg === '--cookies-from-browser' || arg.startsWith('--cookies-from-browser=')) {
      const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : args[++index]
      if (!value || value.startsWith('-')) return {...result, error: '--cookies-from-browser needs a browser, e.g. firefox'}
      const problem = checkBrowserSpec(value)
      if (problem) return {...result, error: problem}
      result.cookies = {browser: value}
    } else if (arg === '--cookies' || arg.startsWith('--cookies=')) {
      const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : args[++index]
      if (!value || value.startsWith('-')) return {...result, error: '--cookies needs a cookies.txt file'}
      result.cookies = {file: value}
    } else if (arg.startsWith('-')) {
      return {...result, error: `unknown option “${arg}”`}
    } else {
      positional.push(arg)
    }
  }

  const ours = args.includes('--') ? args.slice(0, args.indexOf('--')) : args
  const cookieFlags = ours.filter(arg => /^--cookies(-from-browser)?(=|$)/.test(arg)).length
  if (cookieFlags > 1) return {...result, error: 'use either --cookies or --cookies-from-browser, once'}
  if (positional.length > 1) return {...result, error: 'expected a single url'}
  result.initialUrl = positional[0]
  return result
}
