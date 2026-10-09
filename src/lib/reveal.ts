import {spawn} from 'node:child_process'
import path from 'node:path'

/** How long to wait for a file manager launcher to report failure. */
const LAUNCH_GRACE_MS = 2_000

/**
 * Show a finished download in the system file manager. macOS can highlight
 * the file itself; elsewhere the best we can do is open the folder.
 * Resolves false when there is nothing to open with, so the UI can say so
 * instead of looking like the keypress did nothing.
 */
export function revealInFileManager(filepath: string): Promise<boolean> {
  // explorer's /select flag is meant to open the folder with the file
  // highlighted, but it silently falls back to the Documents folder unless
  // an explorer.exe window has already been opened this session — plain
  // folder is what actually works every time
  const [command, args]: [string, string[]] =
    process.platform === 'darwin'
      ? ['open', ['-R', filepath]]
      : process.platform === 'win32'
        ? ['explorer', [path.dirname(filepath)]]
        : ['xdg-open', [path.dirname(filepath)]]

  return new Promise(resolve => {
    let child
    try {
      // detached: the file manager outlives yoinks, and its output must not
      // land in the alternate screen we're drawing on
      child = spawn(command, args, {stdio: 'ignore', detached: true})
    } catch {
      resolve(false)
      return
    }
    child.unref()
    child.on('error', () => resolve(false))
    // explorer.exe exits non-zero even when it worked, so on Windows only a
    // spawn failure counts as failure
    child.on('close', code => resolve(process.platform === 'win32' || code === 0))
    // some xdg-open setups stay attached to the window they opened: still
    // running after a moment means it worked. Never kill it — that would
    // close the window.
    setTimeout(() => resolve(true), LAUNCH_GRACE_MS).unref()
  })
}
