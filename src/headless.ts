import fs from 'node:fs/promises'
import type {Pick} from './lib/args.js'
import {cookieArgs, type Cookies} from './lib/cookies.js'
import {formatBytes, formatEta, formatSpeed} from './lib/format.js'
import {
  buildChoices,
  download,
  ensureYtDlp,
  findFfmpeg,
  probe,
  probeWithCookies,
  type DownloadProgress,
} from './lib/ytdlp.js'

/**
 * Download without the interface, for scripts: status and progress go to
 * stderr (only when it's a terminal), the saved file's path to stdout, and
 * the exit code says how it went — 0 done, 1 failed, 130 cancelled.
 */
export async function runHeadless(opts: {
  url: string
  pick: Pick
  outDir: string
  cookies?: Cookies
  name?: string
}): Promise<number> {
  const controller = new AbortController()
  const cancel = () => controller.abort()
  process.once('SIGINT', cancel)

  const live = Boolean(process.stderr.isTTY)
  let shown = false
  const status = (message: string) => {
    if (!live) return
    process.stderr.write(`\r\x1b[K${message}`)
    shown = true
  }
  const clear = () => {
    if (shown) process.stderr.write('\r\x1b[K')
    shown = false
  }

  let infoJsonPath: string | undefined
  try {
    const ytdlp = await ensureYtDlp(status, controller.signal)
    status('fetching video info…')
    const {result, auth, notice} = await probeWithCookies(
      cookies => probe(ytdlp, opts.url, controller.signal, cookies),
      cookieArgs(opts.cookies),
    )
    infoJsonPath = result.infoJsonPath
    if (notice) {
      clear()
      process.stderr.write(`yoinks: ${notice}\n`)
    }

    const choice = buildChoices(result.info).find(c => c.kind === (opts.pick === 'mp3' ? 'audio' : 'video'))!
    const handlers = {
      onProgress: (progress: DownloadProgress) => status(progressLine(choice.label, progress)),
      onProcessing: () => status(opts.pick === 'mp3' ? 'converting to mp3…' : 'merging…'),
    }
    const base = {ytdlp, ffmpegLocation: await findFfmpeg(), url: opts.url, choice, outDir: opts.outDir, auth, name: opts.name}
    let filepath: string
    try {
      filepath = await download({...base, infoJsonPath}, handlers, controller.signal)
    } catch (error) {
      if (controller.signal.aborted) throw error
      // media urls in the cached info can expire — retry with a fresh extraction
      filepath = await download(base, handlers, controller.signal)
    }

    clear()
    process.stdout.write(`${filepath}\n`)
    return 0
  } catch (error) {
    clear()
    if (controller.signal.aborted) {
      process.stderr.write('yoinks: cancelled\n')
      return 130
    }
    process.stderr.write(`yoinks: ${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  } finally {
    process.off('SIGINT', cancel)
    if (infoJsonPath) await fs.rm(infoJsonPath, {force: true}).catch(() => {})
  }
}

function progressLine(label: string, progress: DownloadProgress): string {
  const {downloadedBytes, totalBytes, speed, eta, part, totalParts} = progress
  const percent = totalBytes ? `${Math.min(100, Math.floor((downloadedBytes / totalBytes) * 100))}%` : formatBytes(downloadedBytes)
  return [
    `${label}${totalParts > 1 ? ` · part ${Math.min(part + 1, totalParts)}/${totalParts}` : ''}`,
    percent,
    speed ? formatSpeed(speed) : '',
    eta ? `${formatEta(eta)} left` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}
