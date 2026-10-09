import React from 'react'
import fs from 'node:fs'
import os from 'node:os'
import {createRequire} from 'node:module'
import {render} from 'ink'
import {App, type Display, type Outcome} from './app.js'
import {captureFrames} from './lib/click-map.js'
import {parseArgs} from './lib/args.js'
import {readClipboard} from './lib/clipboard.js'
import {isProbablyUrl} from './lib/platforms.js'
import {ensureOutputDir, resolveOutputDir, resolveUserPath} from './lib/output-dir.js'
import type {Cookies} from './lib/cookies.js'
import {CONFIG_FILE, loadConfig, type Config} from './lib/config.js'
import {MANAGED_DIR, assetName, installLatest, managedPath, markChecked} from './lib/ytdlp-install.js'
import {runHeadless} from './headless.js'

// read at runtime from the shipped package.json so npm version bumps
// can't drift from a hardcoded constant
const VERSION: string = createRequire(import.meta.url)('../package.json').version

const HELP = `
  yoinks — yoink any video. paste. yoink. done.

  Usage
    $ yoinks [url] [-- yt-dlp options]

  Examples
    $ yoinks https://youtu.be/dQw4w9WgXcQ
    $ yoinks -o ~/Videos https://youtu.be/dQw4w9WgXcQ
    $ yoinks --cookies ~/cookies.txt https://youtu.be/<age-restricted>
    $ yoinks https://x.com/user/status/123456
    $ yoinks                 (prompts for a url)
    $ yoinks <url> -- --proxy socks5://127.0.0.1:9050   (anything yt-dlp takes)
    $ f=$(yoinks --mp3 https://youtu.be/dQw4w9WgXcQ)   (scripts: path on stdout)

  Options
    -o, --output <dir>  save downloads to <dir>
    -n, --name <name>   file name instead of the title (extension added)
    --best              skip the picker: highest quality video
    --mp3               skip the picker: audio only, as mp3
    --cookies <file>    sign in with a cookies.txt (Netscape format)
    --cookies-from-browser <browser>
                        sign in with a browser's cookies: firefox, chrome,
                        edge, safari, brave… (Chromium browsers often
                        can't be read on Windows — use --cookies there)
    --theme <mode>      use auto, light, or dark for this run
    --plain             no full screen, mouse or animation: output stays
                        in the scrollback, for screen readers
    --no-mouse          keep the terminal's own text selection
    --no-motion         don't animate the logo
    --update            update yoinks' own copy of yt-dlp now
    -h, --help          show this help
    -v, --version       show version

  Downloads are saved to your Downloads folder — wherever you moved it —
  unless you pass -o.
  yoinks keeps its own yt-dlp up to date (checked once a day). Set
  YOINKS_YT_DLP to a binary name or path to use a different one.
  Defaults for -o, cookies, theme and format go in
  ${CONFIG_FILE.replace(os.homedir(), '~')} — see the README.
  Powered by yt-dlp — YouTube, X, Instagram, Threads, TikTok & 1800+ sites.
`

const args = parseArgs(process.argv.slice(2))

if (args.error) {
  console.error(`yoinks: ${args.error}\nTry “yoinks --help” for usage.`)
  process.exit(1)
}

if (args.help) {
  console.log(HELP)
  process.exit(0)
}

if (args.version) {
  console.log(VERSION)
  process.exit(0)
}

if (args.update) {
  const asset = assetName()
  if (!asset) {
    console.error('yoinks: there is no standalone yt-dlp for this system — update your own yt-dlp instead.')
    process.exit(1)
  }
  try {
    const {status, tag} = await installLatest({target: managedPath(), asset, onStatus: message => console.log(message)})
    await markChecked(MANAGED_DIR)
    console.log(status === 'up-to-date' ? `yt-dlp ${tag} is already the latest.` : `✓ yt-dlp ${tag} ${status}.`)
    if (process.env.YOINKS_YT_DLP) console.log(`note: YOINKS_YT_DLP is set, so yoinks runs “${process.env.YOINKS_YT_DLP}” instead.`)
    process.exit(0)
  } catch (error) {
    console.error(`yoinks: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

// loaded after --help, --version and --update, so a broken config file
// can't get in the way of those
let config: Config
try {
  config = loadConfig()
} catch (error) {
  console.error(`yoinks: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

// a cookies file that isn't there is a typo: say so now, not after a slow probe
let cookies: Cookies | undefined = args.cookies ?? config.cookies
if (cookies && 'file' in cookies) {
  const file = resolveUserPath(cookies.file)
  if (!fs.statSync(file, {throwIfNoEntry: false})?.isFile()) {
    console.error(`yoinks: no cookies file at “${file}”`)
    process.exit(1)
  }
  cookies = {file}
}

const outDir = resolveOutputDir(args.outputDir ?? config.output)

try {
  ensureOutputDir(outDir)
} catch (error) {
  console.error(`yoinks: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

// --best / --mp3, or output that isn't a terminal (a pipe, a script):
// no interface — a full-screen app would just be noise there
if (args.pick || !process.stdout.isTTY) {
  if (!args.initialUrl) {
    console.error(`yoinks: ${args.pick ? `--${args.pick} needs a url` : 'no url given, and no terminal to ask for one'}`)
    process.exit(1)
  }
  const pick = args.pick ?? config.format ?? 'best'
  const code = await runHeadless({url: args.initialUrl, pick, outDir, cookies, name: args.name, ytdlpArgs: args.ytdlpArgs})
  process.exit(code)
}

const initialUrl = args.initialUrl
const initialThemeMode = args.themeMode ?? config.theme ?? 'auto'

const isTTY = Boolean(process.stdout.isTTY)

// a dumb terminal can't take the alternate screen or cursor games either
const dumb = process.env.TERM === 'dumb'
const plain = Boolean(args.plain || config.plain || dumb)
const display: Display = {
  plain,
  // --plain implies the other two: a screen reader follows the scrollback,
  // which mouse reports and a redrawn animation both disturb
  mouse: !plain && !args.noMouse && config.mouse !== false,
  motion: !plain && !args.noMotion && config.motion !== false,
}

// no url given — offer the clipboard url (⇥ to paste) when it already holds one
let clipboardUrl: string | undefined
if (!initialUrl && isTTY) {
  const clipped = readClipboard().trim()
  // reject multi-line clipboard content — new URL() silently strips newlines
  if (clipped && !/\s/.test(clipped) && isProbablyUrl(clipped)) clipboardUrl = clipped
}
let inAltScreen = false
const enterAltScreen = () => {
  process.stdout.write('\x1b[?1049h\x1b[H')
  inAltScreen = true
}
// also switch mouse tracking off — a crash can skip React effect cleanup
// only once: doing it again moves the cursor back over the "yoinked →" line
const leaveAltScreen = () => {
  if (!inAltScreen) return
  inAltScreen = false
  process.stdout.write('\x1b[?1006l\x1b[?1000l\x1b[?1049l')
}

if (isTTY && !display.plain) {
  enterAltScreen()
  process.on('exit', leaveAltScreen)
  // a kill or a closed terminal skips 'exit' handlers by default: restore
  // the screen first, or the shell is left in the alternate screen with
  // mouse reports typed into it
  for (const [signal, code] of [
    ['SIGINT', 130],
    ['SIGTERM', 143],
    ['SIGHUP', 129],
  ] as const) {
    process.on(signal, () => {
      leaveAltScreen()
      process.exit(code)
    })
  }
  // restore the terminal BEFORE a crash prints, or the stack trace is
  // wiped along with the alternate screen and the app looks like it
  // silently quit
  for (const event of ['uncaughtException', 'unhandledRejection'] as const) {
    process.on(event, (error: unknown) => {
      leaveAltScreen()
      console.error(error)
      process.exit(1)
    })
  }
}

let outcome: Outcome = {}
const {waitUntilExit} = render(
  <App
    initialUrl={initialUrl}
    clipboardUrl={clipboardUrl}
    initialThemeMode={initialThemeMode}
    outDir={outDir}
    cookies={cookies}
    defaultFormat={config.format}
    display={display}
    ytdlpArgs={args.ytdlpArgs}
    name={args.name}
    onOutcome={result => (outcome = result)}
  />,
  // keep a copy of every frame so clicks can be hit-tested against it
  {stdout: captureFrames(process.stdout)},
)

await waitUntilExit()

if (isTTY) leaveAltScreen()
if (outcome.filepath) {
  console.log(`✓ yoinked → ${outcome.filepath}`)
}
