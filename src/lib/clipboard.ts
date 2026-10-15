import {execFile, execFileSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'

const COMMANDS: Array<[string, string[]]> =
  process.platform === 'darwin'
    ? [['pbpaste', []]]
    : process.platform === 'win32'
      ? [['powershell', ['-NoProfile', '-Command', 'Get-Clipboard']]]
      : [
          ['wl-paste', ['--no-newline']],
          ['xclip', ['-selection', 'clipboard', '-o']],
          ['xsel', ['--clipboard', '--output']],
        ]

export function readClipboard(): string {
  for (const [command, args] of COMMANDS) {
    try {
      return execFileSync(command, args, {encoding: 'utf8', timeout: 500, stdio: ['ignore', 'pipe', 'ignore']})
    } catch {
      // tool missing or clipboard empty — try the next one
    }
  }
  return ''
}

/** readClipboard without blocking — for the url offered at launch, where a cold PowerShell can take a second. */
export async function readClipboardAsync(): Promise<string> {
  for (const [command, args] of COMMANDS) {
    const text = await new Promise<string | undefined>(resolve =>
      execFile(command, args, {encoding: 'utf8', timeout: 2_000, windowsHide: true}, (error, stdout) => resolve(error ? undefined : stdout)),
    )
    if (text !== undefined) return text
  }
  return ''
}

/**
 * Put the downloaded file itself on the clipboard — not its path — so it
 * can be pasted into a chat or a file manager. Linux gets a file:// uri,
 * the closest portable equivalent. Resolves false when no tool for it is
 * available. Async: PowerShell alone takes a few hundred ms to start, and
 * a synchronous call would freeze the interface meanwhile.
 */
export async function copyFileToClipboard(filepath: string): Promise<boolean> {
  const run = (command: string, args: string[], input?: string, env?: NodeJS.ProcessEnv) =>
    new Promise<boolean>(resolve => {
      const child = execFile(command, args, {timeout: 5_000, windowsHide: true, env}, error => resolve(!error))
      child.stdin?.end(input)
    })

  if (process.platform === 'darwin') {
    // JSON string escapes (\" and \) are also AppleScript's
    return run('osascript', ['-e', `set the clipboard to (POSIX file ${JSON.stringify(filepath)})`])
  }
  if (process.platform === 'win32') {
    // the path goes in through the environment, never into the command: a
    // video title is chosen by its uploader, and PowerShell also ends a quoted
    // string at ’ — escaping ' alone let a title run commands
    return run('powershell', ['-NoProfile', '-NonInteractive', '-Command', 'Set-Clipboard -LiteralPath $env:YOINKS_FILE'], undefined, {
      ...process.env,
      YOINKS_FILE: filepath,
    })
  }
  // encoded: a raw "file://" + path breaks on spaces
  const uri = `${pathToFileURL(filepath).href}\r\n`
  for (const [command, args] of [
    ['wl-copy', ['--type', 'text/uri-list']],
    ['xclip', ['-selection', 'clipboard', '-t', 'text/uri-list']],
  ] as const) {
    if (await run(command, [...args], uri)) return true
  }
  return false
}
