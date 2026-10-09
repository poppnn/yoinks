import {createHash} from 'node:crypto'
import {createReadStream, createWriteStream} from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {Readable} from 'node:stream'
import {pipeline} from 'node:stream/promises'

const RELEASES = 'https://github.com/yt-dlp/yt-dlp/releases'
const CHECKSUMS = 'SHA2-256SUMS'
const STAMP = 'last-update-check'

export const MANAGED_DIR = path.join(os.homedir(), '.yoinks', 'bin')

/** Look for a new yt-dlp at most this often — YouTube breaks old ones within weeks. */
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

/** Finding out whether there is an update must never hold up a download for long. */
const CHECK_TIMEOUT_MS = 10_000

/** Standalone release asset for this machine, or undefined where none runs (Termux, 32-bit…). */
export function assetName(platform: string = process.platform, arch: string = process.arch): string | undefined {
  if (platform === 'win32') return arch === 'arm64' ? 'yt-dlp_arm64.exe' : 'yt-dlp.exe'
  if (platform === 'darwin') return 'yt-dlp_macos'
  if (platform === 'linux' && arch === 'x64') return 'yt-dlp_linux'
  if (platform === 'linux' && arch === 'arm64') return 'yt-dlp_linux_aarch64'
  return undefined
}

export function managedPath(dir: string = MANAGED_DIR, platform: string = process.platform): string {
  return path.join(dir, platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')
}

/** Parses `sha256sum` output ("<hex>  <name>", optionally "*<name>") into name → hash. */
export function parseChecksums(text: string): Map<string, string> {
  const sums = new Map<string, string>()
  for (const line of text.split('\n')) {
    const match = /^([0-9a-f]{64})\s+\*?(\S+)$/i.exec(line.trim())
    if (match) sums.set(match[2]!, match[1]!.toLowerCase())
  }
  return sums
}

/** Hex sha256 of a file, or undefined if it can't be read. */
export async function sha256File(file: string): Promise<string | undefined> {
  try {
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer)
    return hash.digest('hex')
  } catch {
    return undefined
  }
}

export async function dueForCheck(dir: string = MANAGED_DIR, now: number = Date.now()): Promise<boolean> {
  const stat = await fs.stat(path.join(dir, STAMP)).catch(() => undefined)
  return !stat || now - stat.mtimeMs >= CHECK_INTERVAL_MS
}

export async function markChecked(dir: string = MANAGED_DIR): Promise<void> {
  await fs.mkdir(dir, {recursive: true})
  await fs.writeFile(path.join(dir, STAMP), `${new Date().toISOString()}\n`)
}

type Fetch = typeof fetch

export type InstallResult = {
  status: 'installed' | 'updated' | 'up-to-date'
  /** Release tag now installed, e.g. "2026.08.19". */
  tag: string
}

/**
 * Makes `target` the latest yt-dlp release, verified against the release's
 * SHA2-256SUMS. Comparing hashes also tells us whether we're already current,
 * so an up-to-date check costs one small request. The old binary is only
 * replaced once the new one checks out, so a failed update leaves it usable.
 *
 * The checksum comes from the same GitHub release over HTTPS: it catches a
 * truncated or corrupted download, not a compromised release.
 */
export async function installLatest(opts: {
  target: string
  asset: string
  fetch?: Fetch
  signal?: AbortSignal
  onStatus?: (message: string) => void
}): Promise<InstallResult> {
  const fetchImpl = opts.fetch ?? fetch
  const checkSignal = AbortSignal.any([AbortSignal.timeout(CHECK_TIMEOUT_MS), ...(opts.signal ? [opts.signal] : [])])

  // "latest" redirects to the tagged URL: read the tag from it, then fetch
  // the checksums and the binary from that same release, never from "latest"
  // twice — a release landing in between would mismatch them
  const latest = await fetchImpl(`${RELEASES}/latest/download/${CHECKSUMS}`, {redirect: 'manual', signal: checkSignal})
  const tag = /\/releases\/download\/([^/]+)\//.exec(latest.headers.get('location') ?? '')?.[1]
  if (!tag) throw new Error(`Could not find the latest yt-dlp release (HTTP ${latest.status}).`)
  const base = `${RELEASES}/download/${tag}`

  const sums = await fetchImpl(`${base}/${CHECKSUMS}`, {signal: checkSignal})
  if (!sums.ok) throw new Error(`Could not download the yt-dlp ${tag} checksums (HTTP ${sums.status}).`)
  const expected = parseChecksums(await sums.text()).get(opts.asset)
  if (!expected) throw new Error(`yt-dlp ${tag} lists no checksum for ${opts.asset}.`)

  const current = await sha256File(opts.target)
  if (current === expected) return {status: 'up-to-date', tag}

  opts.onStatus?.(current ? `updating yt-dlp to ${tag}…` : `first run: fetching yt-dlp ${tag}…`)
  await fs.mkdir(path.dirname(opts.target), {recursive: true})
  const tmp = `${opts.target}.download`
  try {
    // no timeout here: a 40 MB binary can legitimately take a while, and esc still cancels
    const response = await fetchImpl(`${base}/${opts.asset}`, {signal: opts.signal})
    if (!response.ok || !response.body) throw new Error(`Could not download yt-dlp ${tag} (HTTP ${response.status}).`)
    await pipeline(Readable.fromWeb(response.body as never), createWriteStream(tmp), {signal: opts.signal})
    if ((await sha256File(tmp)) !== expected) {
      throw new Error(`The downloaded yt-dlp ${tag} doesn't match its checksum, so it wasn't installed.`)
    }
    await fs.chmod(tmp, 0o755)
    await fs.rename(tmp, opts.target)
  } finally {
    await fs.rm(tmp, {force: true}).catch(() => {})
  }
  return {status: current ? 'updated' : 'installed', tag}
}
