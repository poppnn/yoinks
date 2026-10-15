import {spawn, type ChildProcess} from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {formatBytes} from './format.js'
import {downloadItems, folderName, itemTemplate, parsePlaylist, type ItemResult, type PlaylistEntry, type PlaylistInfo} from './playlist.js'
import {saveAsOutputTemplate} from './save-as.js'
import {assetName, dueForCheck, installLatest, managedPath, markChecked} from './ytdlp-install.js'

// async on purpose: a spawnSync here blocks the event loop, which freezes
// ink mid-frame — the user hits enter and sees nothing until it returns
function commandWorks(cmd: string, args: string[], signal?: AbortSignal): Promise<boolean> {
  return new Promise(resolve => {
    let child
    try {
      child = spawn(cmd, args, {stdio: 'ignore', timeout: 10_000, signal})
    } catch {
      resolve(false)
      return
    }
    child.on('error', () => resolve(false))
    child.on('close', code => resolve(code === 0))
  })
}

/**
 * Resolve the yt-dlp to run. yoinks keeps its own copy in ~/.yoinks/bin and
 * looks for a new release at most once a day: an outdated yt-dlp is the most
 * common reason downloads fail, and system installs are often months old.
 * YOINKS_YT_DLP picks a specific binary instead. The system yt-dlp is only a
 * fallback, for when there is no standalone build or no network.
 */
export async function ensureYtDlp(onStatus: (message: string) => void, signal?: AbortSignal): Promise<string> {
  const override = process.env.YOINKS_YT_DLP
  if (override) {
    if (await commandWorks(override, ['--version'], signal)) return override
    signal?.throwIfAborted()
    throw new Error(`YOINKS_YT_DLP is set to “${override}”, but it doesn't run.`)
  }

  let installError: unknown
  const asset = assetName()
  if (asset) {
    const managed = managedPath()
    const have = await fs.access(managed).then(
      () => true,
      () => false,
    )
    if (!have || (await dueForCheck())) {
      if (have) onStatus('checking for a yt-dlp update…')
      try {
        await installLatest({target: managed, asset, signal, onStatus})
      } catch (error) {
        signal?.throwIfAborted()
        installError = error // an update that fails keeps the copy we have
      }
      // count it even if GitHub was unreachable: a network that blocks it
      // would otherwise stall every launch. `yoinks --update` forces a retry.
      await markChecked().catch(() => {})
    }
    if (await commandWorks(managed, ['--version'], signal)) return managed
  }

  if (await commandWorks('yt-dlp', ['--version'], signal)) return 'yt-dlp'
  // a cancelled check also returns false
  signal?.throwIfAborted()
  if (installError instanceof Error) {
    const reason = installError.message === 'fetch failed' ? 'Could not reach GitHub to download yt-dlp.' : installError.message
    throw new Error(`${reason} Check your connection and try again.`)
  }
  throw new Error('No yt-dlp build runs on this system. Install yt-dlp (https://github.com/yt-dlp/yt-dlp#installation) and try again.')
}

/**
 * Find ffmpeg for stream merging, mp3 extraction and embedding metadata:
 * system install first ("ffmpeg"), ffmpeg-static as fallback (its path).
 * Returns undefined if neither exists — yt-dlp still downloads single-file
 * formats without it.
 */
export async function findFfmpeg(): Promise<string | undefined> {
  if (await commandWorks('ffmpeg', ['-version'])) return 'ffmpeg'
  try {
    const mod = await import('ffmpeg-static')
    const ffmpegPath = (mod.default ?? mod) as unknown as string | null
    if (ffmpegPath && (await commandWorks(ffmpegPath, ['-version']))) return ffmpegPath
  } catch {
    // ffmpeg-static not installed or unsupported platform
  }
  return undefined
}

export type VideoInfo = {
  title: string
  uploader?: string
  duration?: number
  webpage_url?: string
  extractor_key?: string
  formats?: RawFormat[]
}

type RawFormat = {
  format_id: string
  ext?: string
  vcodec?: string
  acodec?: string
  height?: number
  width?: number
  abr?: number
  tbr?: number
  filesize?: number
  filesize_approx?: number
}

export type ProbeResult =
  | {
      info: VideoInfo
      /** Raw -J output saved to disk so downloads can skip re-extraction via --load-info-json. */
      infoJsonPath: string
      playlist?: undefined
    }
  | {info: VideoInfo; infoJsonPath?: undefined; playlist: PlaylistInfo}

/** `auth` is the cookie arguments, if any — see cookieArgs(); `extra` the user's own, after --. */
export async function probe(
  ytdlp: string,
  url: string,
  signal?: AbortSignal,
  auth: string[] = [],
  extra: string[] = [],
): Promise<ProbeResult> {
  const stdout = await new Promise<string>((resolve, reject) => {
    // --no-playlist keeps a video link that also names a playlist (watch?v=…&list=…)
    // a single video; --flat-playlist lists a real playlist without probing every item
    const child = spawn(ytdlp, ['-J', '--no-playlist', '--flat-playlist', '--no-warnings', ...UTF8, ...auth, ...extra, url], {
      signal,
    })
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    let out = ''
    let stderr = ''
    child.stdout.on('data', chunk => (out += chunk))
    child.stderr.on('data', chunk => (stderr += chunk))
    child.on('error', reject)
    child.on('close', code => {
      if (code !== 0) {
        reject(describeYtDlpError(stderr, ytdlp, auth.length > 0) ?? new Error(`yt-dlp exited with code ${code}`))
      } else {
        resolve(out)
      }
    })
  })

  let info: VideoInfo
  try {
    info = JSON.parse(stdout) as VideoInfo
  } catch {
    throw new Error('Could not parse video info from yt-dlp.')
  }

  const playlist = parsePlaylist(info)
  if (playlist) {
    if (playlist.entries.length === 0) throw new Error('No videos found at this link.')
    return {info, playlist}
  }

  const infoJsonPath = path.join(os.tmpdir(), `yoinks-info-${process.pid}-${Date.now()}.json`)
  await fs.writeFile(infoJsonPath, stdout)
  return {info, infoJsonPath}
}

export type DownloadChoice = {
  label: string
  kind: 'video' | 'audio'
  args: string[]
  /**
   * Tags, cover art, chapters. Only passed when ffmpeg is available: without
   * it yt-dlp fails the whole download, even though the file was fetched.
   */
  embed?: string[]
}

/** title, uploader and chapters, which --embed-metadata also covers */
const EMBED_VIDEO = ['--embed-metadata']
const EMBED_MP3 = [
  // "Artist - Title" fills the artist and title tags. meta_ fields only
  // change the tags: parsing into title itself would also rename the file.
  '--parse-metadata',
  'title:(?P<meta_artist>.+?) - (?P<meta_title>.+)',
  '--embed-metadata',
  '--embed-thumbnail',
]

const MAX_VIDEO_CHOICES = 8

// QuickTime can't play VP9 and only newer Macs play AV1, but yt-dlp picks
// them over H.264. Ask for H.264 first, then AV1, with AAC audio.
const WITH_AAC = '+(ba[acodec^=mp4a]/ba)'

/**
 * Format choices for a playlist: its items' formats aren't known without
 * probing each one, so offer height caps with the same codec preference.
 */
export function playlistChoices(): DownloadChoice[] {
  const capped = (height: number): DownloadChoice => ({
    kind: 'video',
    label: `up to ${height}p · mp4`,
    args: ['-f', selector(`[height<=${height}]`, 'bv*+ba'), '--merge-output-format', 'mp4'],
    embed: EMBED_VIDEO,
  })
  return [capped(1080), capped(720), capped(360), audioChoice()]
}


function audioChoice(): DownloadChoice {
  return {
    kind: 'audio',
    label: 'audio only · mp3',
    args: ['-f', 'ba/b', '-x', '--audio-format', 'mp3', '--audio-quality', '0'],
    embed: EMBED_MP3,
  }
}

/** H.264, then AV1, with AAC, within `height`; then anything within it; then `fallback`. */
function selector(height: string, fallback: string): string {
  return [
    `bv*${height}[vcodec~='^(avc|h264)']${WITH_AAC}`,
    `bv*${height}[vcodec^=av01]${WITH_AAC}`,
    `bv*${height}+ba`,
    `b${height}`,
    fallback,
    'b',
  ].join('/')
}

export function buildChoices(info: VideoInfo): DownloadChoice[] {
  const formats = info.formats ?? []
  const choices: DownloadChoice[] = []

  const audioOnly = formats.filter(f => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'))
  const bestAudio = [...audioOnly].sort(byBitrate)[0]
  const audioSize = sizeOf(bestAudio)
  const videoAudio = audioOnly.filter(f => f.acodec?.startsWith('mp4a')).sort(byBitrate)[0] ?? bestAudio

  const videos = formats.filter(f => f.vcodec && f.vcodec !== 'none' && f.height)
  const heights = [...new Set(videos.map(f => f.height as number))].sort((a, b) => b - a)

  for (const height of heights.slice(0, MAX_VIDEO_CHOICES)) {
    const candidates = videos.filter(f => f.height === height)
    // guess the stream the selector will get, so the size matches the download
    const preferred = [isH264, isAv1].map(is => candidates.filter(is)).find(group => group.length > 0) ?? candidates
    const best = [...preferred].sort((a, b) => Number(Boolean(sizeOf(b))) - Number(Boolean(sizeOf(a))) || byBitrate(a, b))[0]!
    const muxed = best.acodec && best.acodec !== 'none'
    const audio = isH264(best) || isAv1(best) ? videoAudio : bestAudio
    const videoSize = sizeOf(best) ?? (best.tbr && info.duration ? (best.tbr * 1000 * info.duration) / 8 : undefined)
    // if the video size is unknown, show nothing rather than just the audio size
    const size = videoSize === undefined ? 0 : videoSize + (muxed ? 0 : sizeOf(audio) ?? 0)
    const sizeLabel = size > 0 ? ` · ~${formatBytes(size)}` : ''
    // H.264 plays everywhere, so only name the codec when it might not
    const codecLabel = isH264(best) ? '' : ` · ${codecName(best)}`
    choices.push({
      kind: 'video',
      label: `${height}p · mp4${codecLabel}${sizeLabel}`,
      args: ['-f', selector(`[height=${height}]`, `bv*[height<=${height}]+ba`), '--merge-output-format', 'mp4'],
      embed: EMBED_VIDEO,
    })
  }

  if (choices.length === 0) {
    choices.push({
      kind: 'video',
      label: 'best available · mp4',
      args: ['-f', 'bv*+ba/b', '--merge-output-format', 'mp4'],
      embed: EMBED_VIDEO,
    })
  }

  const audioSizeLabel = audioSize ? ` · ~${formatBytes(audioSize)}` : ''
  choices.push({...audioChoice(), label: `audio only · mp3${audioSizeLabel}`})

  return choices
}

const isH264 = (f: RawFormat) => /^(avc|h264)/.test(f.vcodec ?? '')
const isAv1 = (f: RawFormat) => f.vcodec?.startsWith('av01') ?? false

function codecName(f: RawFormat): string {
  const codec = (f.vcodec ?? '').toLowerCase()
  if (codec.startsWith('av01')) return 'AV1'
  if (codec.startsWith('vp9') || codec.startsWith('vp09')) return 'VP9'
  if (codec.startsWith('hev1') || codec.startsWith('hvc1') || codec.startsWith('h265')) return 'HEVC'
  return codec.split('.')[0]!.toUpperCase() || '?'
}
const sizeOf = (f?: RawFormat) => f?.filesize ?? f?.filesize_approx
const byBitrate = (a: RawFormat, b: RawFormat) => (b.abr ?? b.tbr ?? 0) - (a.abr ?? a.tbr ?? 0)

export type DownloadProgress = {
  downloadedBytes: number
  totalBytes?: number
  speed?: number
  eta?: number
  part: number
  /** How many files this download resolves to (video+audio merges are 2). */
  totalParts: number
}

export type DownloadHandlers = {
  onProgress: (progress: DownloadProgress) => void
  onProcessing: () => void
  /** the cached links expired: starting over with fresh ones */
  onRefresh?: () => void
}

/**
 * On Windows yt-dlp prints in the console's code page when piped: a title
 * like "été 日本" came back mangled (or lost), the saved file couldn't be
 * found, and it was deleted with the staging folder.
 */
const UTF8 = ['--encoding', 'utf-8']

const PROGRESS_PREFIX = 'YOINK|'
const PROGRESS_TEMPLATE = `${PROGRESS_PREFIX}%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s`

let activeChild: ChildProcess | undefined
process.on('exit', () => activeChild?.kill('SIGTERM'))

type DownloadOptions = {
  ytdlp: string
  /** "ffmpeg" when it is on the PATH, its path otherwise, undefined when missing */
  ffmpeg?: string
  url: string
  /** When set, reuse the probe's metadata instead of re-extracting — starts much faster. */
  infoJsonPath?: string
  choice: DownloadChoice
  outDir: string
  /** cookie arguments, the same ones the probe succeeded with */
  auth?: string[]
  /** file name to use instead of the title; the extension comes from the format */
  name?: string
  /** the user's own yt-dlp options, from after -- */
  extra?: string[]
  /** download this 1-based item of the playlist at `url` instead of a single video */
  playlistItem?: number
  /** yt-dlp output template for the file name, instead of the title or `name` */
  template?: string
}

export async function download(opts: DownloadOptions, handlers: DownloadHandlers, signal?: AbortSignal): Promise<string> {
  try {
    return await downloadOnce(opts, handlers, signal)
  } catch (error) {
    // the probe's media links expire after a few hours — the only failure a
    // fresh extraction fixes; anything else would just download it all again
    const expired = error instanceof YtDlpError && error.kind === 'outdated'
    if (!opts.infoJsonPath || signal?.aborted || !expired) throw error
    handlers.onRefresh?.()
    return downloadOnce({...opts, infoJsonPath: undefined}, handlers, signal)
  }
}

/**
 * Downloads the chosen entries of a playlist one after the other, into a
 * folder named after it (or `name`), numbered so they keep their order.
 */
export async function downloadPlaylist(
  opts: Omit<DownloadOptions, 'infoJsonPath' | 'playlistItem' | 'template'> & {playlist: PlaylistInfo; entries: PlaylistEntry[]},
  handlers: DownloadHandlers & {onItem: (position: number, entry: PlaylistEntry) => void; onSaved?: (filepath: string) => void},
  signal?: AbortSignal,
): Promise<{folder: string; results: ItemResult[]}> {
  const {playlist, entries, name, ...base} = opts
  const folder = path.join(opts.outDir, folderName(name ?? playlist.title))
  const results = await downloadItems(
    entries,
    async entry => {
      const filepath = await download(
        {
          ...base,
          outDir: folder,
          // an item's own url when there is one: -I re-reads the playlist up
          // to that item, slower the further down it is (5.8 s for item 1,
          // 19 s for item 1500, against 2.7 s by url)
          url: entry.url ?? base.url,
          playlistItem: entry.url ? undefined : entry.index,
          template: itemTemplate(entry, playlist.entries.length),
        },
        handlers,
        signal,
      )
      handlers.onSaved?.(filepath)
      return filepath
    },
    handlers.onItem,
    signal,
  )
  return {folder, results}
}

async function downloadOnce(opts: DownloadOptions, handlers: DownloadHandlers, signal?: AbortSignal): Promise<string> {
  // yt-dlp skips a file that already exists and returns the old one, so
  // download into an empty folder and pick a free name at the end
  await fs.mkdir(opts.outDir, {recursive: true})
  const staging = await fs.mkdtemp(path.join(opts.outDir, '.yoinks-'))
  try {
    const staged = await runYtDlp({...opts, outDir: staging}, handlers, signal)
    const saved = await moveToFreeName(staged, opts.outDir)
    // files yt-dlp wrote alongside it — subtitles, thumbnails, a description,
    // asked for after -- — would otherwise go with the staging folder
    for (const entry of await fs.readdir(staging, {withFileTypes: true})) {
      if (entry.isFile()) await moveToFreeName(path.join(staging, entry.name), opts.outDir)
    }
    return saved
  } finally {
    // this also removes partial files from a cancelled or failed download
    await fs.rm(staging, {recursive: true, force: true}).catch(() => {})
  }
}

/** Moves file into dir, adding " (1)", " (2)"… if the name is taken. */
async function moveToFreeName(file: string, dir: string): Promise<string> {
  const {name, ext} = path.parse(file)
  for (let n = 0; ; n++) {
    const target = path.join(dir, n === 0 ? `${name}${ext}` : `${name} (${n})${ext}`)
    // claim the name atomically ("wx" fails if it exists), then move over the
    // empty placeholder: check-then-rename let a parallel download take it
    // between the two, and rename silently replaced that file
    try {
      await (await fs.open(target, 'wx')).close()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue
      throw error
    }
    try {
      await fs.rename(file, target)
    } catch (error) {
      await fs.rm(target, {force: true})
      throw error
    }
    return target
  }
}

function runYtDlp(opts: DownloadOptions, handlers: DownloadHandlers, signal?: AbortSignal): Promise<string> {
  const args = [
    ...(opts.infoJsonPath ? ['--load-info-json', opts.infoJsonPath] : [opts.url]),
    ...opts.choice.args,
    ...(opts.ffmpeg ? (opts.choice.embed ?? []) : []),
    ...(opts.auth ?? []),
    ...(opts.playlistItem ? ['--yes-playlist', '-I', String(opts.playlistItem)] : ['--no-playlist']),
    '--no-warnings',
    ...UTF8,
    // HLS/DASH sites (X, Twitch, Vimeo…) serve hundreds of small fragments:
    // fetching four at a time is several times faster
    '--concurrent-fragments',
    '4',
    '--newline',
    // --print implies --quiet, which suppresses progress bars and the
    // [Merger]/[ExtractAudio] lines we detect the processing phase from
    '--no-quiet',
    '--progress',
    '--progress-template',
    `download:${PROGRESS_TEMPLATE}`,
    '--print',
    'after_move:filepath',
    '--no-simulate',
    '-o',
    opts.template ? path.join(opts.outDir, opts.template) : saveAsOutputTemplate(opts.outDir, opts.name),
  ]
  // on the PATH, yt-dlp finds it itself
  if (opts.ffmpeg && opts.ffmpeg !== 'ffmpeg') args.push('--ffmpeg-location', opts.ffmpeg)
  // last, so they win over our defaults (e.g. --concurrent-fragments)
  args.push(...(opts.extra ?? []))

  return new Promise((resolve, reject) => {
    const child = spawn(opts.ytdlp, args, {signal})
    activeChild = child

    let stderr = ''
    let filepath = ''
    let part = 0
    let totalParts = 1
    let lastDownloaded = 0
    let buffer = ''

    // decodes whole characters even when one is split across two chunks
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line) continue
        if (line.startsWith(PROGRESS_PREFIX)) {
          const [downloaded, total, totalEstimate, speed, eta] = line.slice(PROGRESS_PREFIX.length).split('|')
          const downloadedBytes = toNumber(downloaded) ?? 0
          if (downloadedBytes < lastDownloaded) part++
          lastDownloaded = downloadedBytes
          handlers.onProgress({
            downloadedBytes,
            totalBytes: toNumber(total) ?? toNumber(totalEstimate),
            speed: toNumber(speed),
            eta: toNumber(eta),
            part,
            totalParts,
          })
        } else if (line.includes('Downloading 1 format(s):')) {
          // "[info] xxx: Downloading 1 format(s): 395+251" — each id is one file
          totalParts = (line.split('format(s):')[1] ?? '').trim().split('+').length
        } else if (line.includes('[Merger]') || line.includes('[ExtractAudio]')) {
          handlers.onProcessing()
        } else if (path.isAbsolute(line)) {
          filepath = line
        }
      }
    })
    child.stderr.on('data', chunk => (stderr += chunk))
    child.on('error', error => {
      if (!signal?.aborted) reject(error)
    })
    // on cancel, wait for yt-dlp to exit but not for 'close': something it
    // started (like ffmpeg) can keep the pipes open for a while
    child.on('exit', () => {
      activeChild = undefined
      if (signal?.aborted) reject(new Error('Download cancelled.'))
    })
    child.on('close', code => {
      if (signal?.aborted) return
      if (code === 0 && filepath) {
        resolve(filepath)
      } else {
        reject(
          describeYtDlpError(stderr, opts.ytdlp, Boolean(opts.auth?.length)) ??
            new Error(`Download failed (yt-dlp exit code ${code}).`),
        )
      }
    })
  })
}

function toNumber(value: string | undefined): number | undefined {
  if (!value || value === 'NA' || value === 'None') return undefined
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? n : undefined
}

export type YtDlpErrorKind = 'cookies' | 'login' | 'outdated' | 'other'

export class YtDlpError extends Error {
  constructor(
    message: string,
    readonly kind: YtDlpErrorKind,
  ) {
    super(message)
    this.name = 'YtDlpError'
  }
}

const BROWSER_LOCKED = /failed to decrypt|could not copy .*cookie/i
const BROWSER_MISSING = /could not find .*(?:cookies|profile)/i
const NOT_NETSCAPE = /netscape format cookies/i
const NEEDS_LOGIN = /sign in to confirm|not a bot|login required|members[- ]only|use --cookies/i
const LOOKS_OUTDATED = /requested format is not available|http error 403|unable to extract|nsig extraction|signature extraction/i

/**
 * The last error yt-dlp printed, rewritten when we can say something more
 * useful: yt-dlp's own advice names flags yoinks doesn't have, or doesn't
 * say what to do. `signedIn` tells whether cookies were passed.
 */
export function describeYtDlpError(stderr: string, ytdlp: string, signedIn = false): YtDlpError | undefined {
  const last = stderr
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('ERROR:'))
    .at(-1)
  if (!last) return undefined
  const message = last.replace(/^ERROR:\s*(\[[^\]]+\]\s*)?/, '')

  // cookies we were asked to use but couldn't load — checked first, before
  // the login wall they would have got us past
  if (BROWSER_LOCKED.test(message)) {
    return new YtDlpError(
      "Couldn't read the browser's cookies — on Windows, Chrome, Edge and other Chromium browsers lock them. Use --cookies with an exported cookies.txt, or sign in with Firefox and use --cookies-from-browser firefox.",
      'cookies',
    )
  }
  if (BROWSER_MISSING.test(message)) {
    return new YtDlpError("Couldn't find that browser's cookies. Is it installed, and signed in to the site?", 'cookies')
  }
  if (NOT_NETSCAPE.test(message)) {
    return new YtDlpError("That cookies file isn't a Netscape cookies.txt. Export one with a cookies.txt browser extension.", 'cookies')
  }

  if (NEEDS_LOGIN.test(message)) {
    return new YtDlpError(
      signedIn
        ? "This video needs a signed-in account, and your cookies didn't sign you in — they may have expired. Export fresh ones."
        : 'This video needs a signed-in account (age check, bot check or members-only). Sign in with --cookies <file> or --cookies-from-browser <browser>.',
      'login',
    )
  }
  if (LOOKS_OUTDATED.test(message)) {
    // keep yt-dlp's first sentence, drop its "Use --list-formats…" advice
    const what = message.split(/(?<=\.)\s/)[0]
    const fix =
      ytdlp === managedPath() ? 'Run “yoinks --update” and try again.' : `Update ${ytdlp === 'yt-dlp' ? 'your yt-dlp' : ytdlp} and try again.`
    return new YtDlpError(`${what} This often means yt-dlp is out of date. ${fix}`, 'outdated')
  }
  return new YtDlpError(message, 'other')
}

/**
 * Probe with cookies, but don't let cookies we can't read block a video that
 * doesn't need them: retry without, and hand back a notice to show instead.
 * A login wall on the retry means the cookie problem is the real story.
 */
export async function probeWithCookies(
  run: (auth: string[]) => Promise<ProbeResult>,
  auth: string[],
): Promise<{result: ProbeResult; auth: string[]; notice?: string}> {
  try {
    return {result: await run(auth), auth}
  } catch (error) {
    if (auth.length === 0 || !(error instanceof YtDlpError) || error.kind !== 'cookies') throw error
    try {
      return {result: await run([]), auth: [], notice: `${error.message} Continued without signing in.`}
    } catch (retryError) {
      if (retryError instanceof YtDlpError && retryError.kind === 'login') throw error
      throw retryError
    }
  }
}
