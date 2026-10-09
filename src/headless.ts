import fs from 'node:fs/promises'
import path from 'node:path'
import type {Pick} from './lib/args.js'
import {cookieArgs, type Cookies} from './lib/cookies.js'
import {formatBytes, formatEta, formatSpeed} from './lib/format.js'
import {downloadItems, folderName, itemTemplate, selectItems} from './lib/playlist.js'
import {
  buildChoices,
  download,
  ensureYtDlp,
  findFfmpeg,
  playlistChoices,
  probe,
  probeWithCookies,
  type DownloadProgress,
} from './lib/ytdlp.js'

/**
 * Download without the interface, for scripts: status and progress go to
 * stderr (only when it's a terminal), the saved file's path to stdout — one
 * line per item for a playlist — and the exit code says how it went: 0 done,
 * 1 failed (any item, for a playlist), 130 cancelled.
 */
export async function runHeadless(opts: {
  url: string
  pick: Pick
  outDir: string
  cookies?: Cookies
  name?: string
  ytdlpArgs?: string[]
  /** playlist items to download, e.g. "1-3,7" */
  items?: string
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
      cookies => probe(ytdlp, opts.url, controller.signal, cookies, opts.ytdlpArgs),
      cookieArgs(opts.cookies),
    )
    infoJsonPath = result.infoJsonPath
    if (notice) {
      clear()
      process.stderr.write(`yoinks: ${notice}\n`)
    }

    if (result.playlist) {
      const {playlist} = result
      const entries = opts.items ? selectItems(opts.items, playlist.entries) : playlist.entries
      const choice = playlistChoices().find(c => c.kind === (opts.pick === 'mp3' ? 'audio' : 'video'))!
      // -n names the folder here; a playlist's files are named after their items
      const folder = path.join(opts.outDir, folderName(opts.name ?? playlist.title))
      const ffmpeg = await findFfmpeg()
      let current = ''
      const handlers = {
        onProgress: (progress: DownloadProgress) => status(`${current} · ${progressLine(choice.label, progress)}`),
        onProcessing: () => status(`${current} · ${opts.pick === 'mp3' ? 'converting to mp3…' : 'merging…'}`),
      }
      const results = await downloadItems(
        entries,
        async entry => {
          const filepath = await download(
            {
              ytdlp,
              ffmpeg,
              url: opts.url,
              choice,
              outDir: folder,
              auth,
              extra: opts.ytdlpArgs,
              playlistItem: entry.index,
              template: itemTemplate(entry, playlist.entries.length),
            },
            handlers,
            controller.signal,
          )
          // as each one lands, so a script can start on it
          clear()
          process.stdout.write(`${filepath}\n`)
          return filepath
        },
        (position, entry) => {
          current = `${position + 1}/${entries.length}`
          status(`${current} · ${entry.title}`)
        },
        controller.signal,
      )

      clear()
      const failed = results.filter(r => r.error)
      for (const {entry, error} of failed) process.stderr.write(`yoinks: ${entry.index}. ${entry.title} — ${error}\n`)
      if (failed.length > 0) process.stderr.write(`yoinks: ${results.length - failed.length} of ${results.length} saved\n`)
      return failed.length > 0 ? 1 : 0
    }
    if (opts.items) process.stderr.write('yoinks: --items is for playlists; this link is a single video\n')

    const choice = buildChoices(result.info).find(c => c.kind === (opts.pick === 'mp3' ? 'audio' : 'video'))!
    const handlers = {
      onProgress: (progress: DownloadProgress) => status(progressLine(choice.label, progress)),
      onProcessing: () => status(opts.pick === 'mp3' ? 'converting to mp3…' : 'merging…'),
    }
    const base = {ytdlp, ffmpeg: await findFfmpeg(), url: opts.url, choice, outDir: opts.outDir, auth, name: opts.name, extra: opts.ytdlpArgs}
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
