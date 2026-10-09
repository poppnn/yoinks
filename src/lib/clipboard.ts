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

/**
 * Put the downloaded file itself on the clipboard — not its path — so it
 * can be pasted into a chat or a file manager. Linux gets a file:// uri,
 * the closest portable equivalent. Resolves false when no tool for it is
 * available. Async: PowerShell alone takes a few hundred ms to start, and
 * a synchronous call would freeze the interface meanwhile.
 */
export async function copyFileToClipboard(filepath: string): Promise<boolean> {
  const run = (command: string, args: string[], input?: string) =>
    new Promise<boolean>(resolve => {
      const child = execFile(command, args, {timeout: 5_000, windowsHide: true}, error => resolve(!error))
      child.stdin?.end(input)
    })

  if (process.platform === 'darwin') {
    // JSON string escapes (\" and \) are also AppleScript's
    return run('osascript', ['-e', `set the clipboard to (POSIX file ${JSON.stringify(filepath)})`])
  }
  if (process.platform === 'win32') {
    // -LiteralPath so wildcard-looking names aren't expanded; doubled single
    // quotes are PowerShell's escape inside a literal string
    const literal = `'${filepath.replace(/'/g, "''")}'`
    return run('powershell', ['-NoProfile', '-NonInteractive', '-Command', `Set-Clipboard -LiteralPath ${literal}`])
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
