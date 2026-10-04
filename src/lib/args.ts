import {isThemeMode, type ThemeMode} from '../theme.js'

export type CliArgs = {
  help: boolean
  version: boolean
  /** update yoinks' own yt-dlp and exit */
  update: boolean
  initialUrl?: string
  themeMode?: ThemeMode
  outputDir?: string
  error?: string
}

export function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {help: false, version: false, update: false}
  const positional: string[] = []

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!
    if (arg === '-h' || arg === '--help') {
      result.help = true
    } else if (arg === '-v' || arg === '--version') {
      result.version = true
    } else if (arg === '--update') {
      result.update = true
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
    } else if (arg.startsWith('-')) {
      return {...result, error: `unknown option “${arg}”`}
    } else {
      positional.push(arg)
    }
  }

  if (positional.length > 1) return {...result, error: 'expected a single url'}
  result.initialUrl = positional[0]
  return result
}
