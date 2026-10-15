import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {buildChoices, describeYtDlpError, download, downloadPlaylist, probeWithCookies, type DownloadChoice, type VideoInfo} from './ytdlp.js'
import {managedPath} from './ytdlp-install.js'

const choice: DownloadChoice = {label: 'best', kind: 'video', args: []}
const noop = {onProgress: () => {}, onProcessing: () => {}}

/**
 * A fake yt-dlp that saves to "clip.mp4" and then runs `body`. Windows can't
 * run a script as a program, so there node itself stands in for yt-dlp and
 * loads the fake with --require. The fake must then exit before node goes on
 * to run the url as a script: hence the final exit, and synchronous writes
 * (`say`) that an exit can't cut short.
 */
async function fakeYtDlp(dir: string, body: string): Promise<string> {
  const bin = path.join(dir, 'fake-yt-dlp')
  await fs.writeFile(
    bin,
    `#!/usr/bin/env node
const fs = require('node:fs')
const args = process.argv.slice(2)
const say = text => fs.writeSync(1, text + '\\n')
const out = args[args.indexOf('-o') + 1].replace('%(title).60s', 'clip').replace('%(ext)s', 'mp4')
${body}
process.exit()
`,
    {mode: 0o755},
  )
  if (process.platform !== 'win32') return bin
  // NODE_OPTIONS reads \ as an escape: hand it the path with forward slashes
  process.env.NODE_OPTIONS = `--require "${bin.replaceAll('\\', '/')}"`
  return process.execPath
}

const tempDir = () => fs.mkdtemp(path.join(os.tmpdir(), 'yoinks-test-'))

test('a same-named file in the output folder is kept and the new download gets a free name', async () => {
  const dir = await tempDir()
  const outDir = path.join(dir, 'Downloads')
  await fs.mkdir(outDir)
  await fs.writeFile(path.join(outDir, 'clip.mp4'), 'an earlier, different video')
  const ytdlp = await fakeYtDlp(dir, `fs.writeFileSync(out, 'the video you just picked'); say(out)`)

  const filepath = await download({ytdlp, url: 'https://example.com/clip.mp4', choice, outDir}, noop)

  assert.equal(filepath, path.join(outDir, 'clip (1).mp4'))
  assert.equal(await fs.readFile(filepath, 'utf8'), 'the video you just picked')
  assert.equal(await fs.readFile(path.join(outDir, 'clip.mp4'), 'utf8'), 'an earlier, different video')
  assert.deepEqual((await fs.readdir(outDir)).sort(), ['clip (1).mp4', 'clip.mp4'])
  await fs.rm(dir, {recursive: true, force: true})
})

test('cancelling stops right away and leaves no partial files', {timeout: 3000}, async () => {
  const dir = await tempDir()
  const outDir = path.join(dir, 'Downloads')
  const pidFile = path.join(dir, 'helper.pid')
  // the helper outlives yt-dlp and keeps its output pipe open, like ffmpeg can
  const ytdlp = await fakeYtDlp(
    dir,
    `fs.writeFileSync(out + '.part', 'half a video')
const helper = require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], {stdio: 'inherit', env: {...process.env, NODE_OPTIONS: ''}})
fs.writeFileSync(${JSON.stringify(pidFile)}, String(helper.pid))
say('YOINK|6|12|NA|NA|NA')
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10000)`,
  )
  const controller = new AbortController()

  await assert.rejects(
    download(
      {ytdlp, url: 'https://example.com/clip.mp4', choice, outDir},
      {...noop, onProgress: () => controller.abort()},
      controller.signal,
    ),
    /cancelled/,
  )

  assert.deepEqual(await fs.readdir(outDir), [])
  // cleanup only — on Windows the helper already went down with the killed fake
  try {
    process.kill(Number(await fs.readFile(pidFile, 'utf8')))
  } catch {}
  await fs.rm(dir, {recursive: true, force: true})
})

// real yt-dlp output, with the warnings it prints before the error
const AGE_GATE = `WARNING: [youtube] AGrDHYmhuS0: some warning
ERROR: [youtube] AGrDHYmhuS0: Sign in to confirm your age. Use --cookies-from-browser or --cookies for the authentication. See  https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp  for how to manually pass cookies. Also see  https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies  for tips on effectively exporting YouTube cookies
`
const NO_FORMAT =
  'ERROR: [youtube] HyLCgkQtluw: Requested format is not available. Use --list-formats for a list of available formats\n'

// what yt-dlp printed on this project's Windows test machine (2026-09-10)
const DPAPI = `Extracting cookies from chrome
ERROR: Failed to decrypt with DPAPI. See  https://github.com/yt-dlp/yt-dlp/issues/10927  for more info
`
const CHROME_OPEN = 'ERROR: Could not copy Chrome cookie database. See  https://github.com/yt-dlp/yt-dlp/issues/7271  for more info\n'

const describe = (stderr: string, ytdlp = 'yt-dlp', signedIn = false) => {
  const error = describeYtDlpError(stderr, ytdlp, signedIn)
  assert.ok(error, 'expected an error')
  return error
}

test("explains login walls without pointing at yt-dlp flags yoinks doesn't have", () => {
  const error = describe(AGE_GATE, managedPath())
  assert.equal(error.kind, 'login')
  assert.match(error.message, /needs a signed-in account.*--cookies <file> or --cookies-from-browser <browser>/)
  assert.doesNotMatch(error.message, /https:/)
  assert.equal(describe('ERROR: [Instagram] x: login required\n').kind, 'login')
  // cookies were passed and still didn't get us in
  assert.match(describe(AGE_GATE, 'yt-dlp', true).message, /cookies didn't sign you in/)
})

test('explains cookies yt-dlp could not load', () => {
  for (const stderr of [DPAPI, CHROME_OPEN]) {
    const error = describe(stderr)
    assert.equal(error.kind, 'cookies')
    assert.match(error.message, /Chromium browsers lock them.*--cookies.*firefox/)
  }
  assert.equal(describe('ERROR: could not find firefox cookies database in "/home/x/.mozilla"\n').kind, 'cookies')
  assert.match(describe('ERROR: cookies.txt does not look like a Netscape format cookies file\n').message, /isn't a Netscape cookies\.txt/)
  // the age gate mentions cookies too, but it is a login wall, not a load failure
  assert.equal(describe(AGE_GATE).kind, 'login')
})

test('suggests the right update for errors an outdated yt-dlp causes', () => {
  const error = describe(NO_FORMAT, managedPath())
  assert.equal(error.kind, 'outdated')
  assert.equal(
    error.message,
    'HyLCgkQtluw: Requested format is not available. This often means yt-dlp is out of date. Run “yoinks --update” and try again.',
  )
  assert.match(describe(NO_FORMAT, 'yt-dlp').message, /Update your yt-dlp and try again\.$/)
  assert.match(describe('ERROR: unable to download video data: HTTP Error 403: Forbidden\n', '/opt/yt-dlp').message, /Update \/opt\/yt-dlp/)
})

test('passes other errors through, and returns nothing without an error line', () => {
  const error = describe('ERROR: [generic] Unable to download webpage: HTTP Error 404: Not Found\n')
  assert.equal(error.kind, 'other')
  assert.equal(error.message, 'Unable to download webpage: HTTP Error 404: Not Found')
  assert.equal(describeYtDlpError('WARNING: just a warning\n', 'yt-dlp'), undefined)
})

const probed = {info: {title: 'clip'}, infoJsonPath: '/tmp/x.json'}
const COOKIES = ['--cookies-from-browser', 'chrome']

/** A fake probe that fails with `withCookies` when given cookies, `without` otherwise. */
function fakeProbe(withCookies?: Error, without?: Error) {
  const calls: string[][] = []
  const run = async (auth: string[]) => {
    calls.push(auth)
    const failure = auth.length > 0 ? withCookies : without
    if (failure) throw failure
    return probed
  }
  return {run, calls}
}

test("cookies that can't be read don't block a public video", async () => {
  const {run, calls} = fakeProbe(describe(DPAPI))
  const outcome = await probeWithCookies(run, COOKIES)
  assert.deepEqual(calls, [COOKIES, []])
  assert.deepEqual(outcome.auth, []) // the download must not try the cookies again
  assert.match(outcome.notice ?? '', /Chromium browsers lock them.*Continued without signing in\.$/)
})

test('when the video needs a login after all, the cookie problem is what we report', async () => {
  const cookieError = describe(DPAPI)
  const {run} = fakeProbe(cookieError, describe(AGE_GATE))
  await assert.rejects(probeWithCookies(run, COOKIES), cookieError)
})

test('working cookies are kept, and other errors are not retried', async () => {
  const ok = fakeProbe()
  assert.deepEqual(await probeWithCookies(ok.run, COOKIES), {result: probed, auth: COOKIES})

  const notFound = describe('ERROR: [generic] Unable to download webpage: HTTP Error 404: Not Found\n')
  const failing = fakeProbe(notFound)
  await assert.rejects(probeWithCookies(failing.run, COOKIES), notFound)
  assert.equal(failing.calls.length, 1)
})

const MB = 1024 * 1024
// like YouTube: H.264 up to 1080p (plus an HLS copy with no size), AV1 and VP9 above
const youtubeLike: VideoInfo = {
  title: 'clip',
  duration: 10,
  formats: [
    {format_id: '401', vcodec: 'av01.0.12M.08', acodec: 'none', height: 2160, tbr: 12_000, filesize: 20 * MB},
    {format_id: '313', vcodec: 'vp9', acodec: 'none', height: 2160, tbr: 18_000, filesize: 25 * MB},
    {format_id: '137', vcodec: 'avc1.640028', acodec: 'none', height: 1080, tbr: 4_000, filesize: 8 * MB},
    {format_id: '270', vcodec: 'avc1.640028', acodec: 'none', height: 1080, tbr: 4_500},
    {format_id: '399', vcodec: 'av01.0.08M.08', acodec: 'none', height: 1080, tbr: 2_000, filesize: 4 * MB},
    {format_id: '248', vcodec: 'vp9', acodec: 'none', height: 1080, tbr: 3_000, filesize: 5 * MB},
    {format_id: '140', vcodec: 'none', acodec: 'mp4a.40.2', abr: 129, filesize: 1 * MB},
    {format_id: '251', vcodec: 'none', acodec: 'opus', abr: 135, filesize: 2 * MB},
  ],
}

test('video choices ask for H.264, then AV1, with AAC audio before anything else', () => {
  const [, p1080] = buildChoices(youtubeLike)
  const selector = p1080!.args[p1080!.args.indexOf('-f') + 1]!
  assert.ok(
    selector.startsWith(
      "bv*[height=1080][vcodec~='^(avc|h264)']+(ba[acodec^=mp4a]/ba)" +
        '/bv*[height=1080][vcodec^=av01]+(ba[acodec^=mp4a]/ba)' +
        '/bv*[height=1080]+ba/',
    ),
    selector,
  )
})

test('size estimates describe the streams that get downloaded', () => {
  const labels = buildChoices(youtubeLike).map(choice => choice.label)
  assert.deepEqual(labels, [
    '2160p · mp4 · AV1 · ~21 MB', // AV1 + AAC
    '1080p · mp4 · ~9.0 MB', // H.264 + AAC
    'audio only · mp3 · ~2.0 MB',
  ])
})

test('a video row with an unknown size shows no estimate rather than the audio size', () => {
  const [p720] = buildChoices({
    title: 'clip',
    formats: [
      {format_id: 'hls-720', vcodec: 'avc1', acodec: 'none', height: 720},
      {format_id: 'audio', vcodec: 'none', acodec: 'mp4a.40.2', abr: 128, filesize: MB},
    ],
  })
  assert.equal(p720!.label, '720p · mp4')
})

test('names the codec only on rows that may not play everywhere', () => {
  const [p2160, p1080] = buildChoices(youtubeLike)
  assert.match(p2160!.label, /^2160p · mp4 · AV1 · ~/)
  assert.match(p1080!.label, /^1080p · mp4 · ~/) // H.264: no mention
  const vp9Only: VideoInfo = {title: 'x', formats: [{format_id: '1', vcodec: 'vp09.00.40.08', acodec: 'none', height: 1440}]}
  assert.match(buildChoices(vp9Only)[0]!.label, /^1440p · mp4 · VP9$/)
})

test('mp3s get tags and cover art, videos get tags and chapters', () => {
  const choices = buildChoices(youtubeLike)
  const audio = choices.find(c => c.kind === 'audio')!
  assert.ok(audio.embed?.includes('--embed-thumbnail'))
  // the tags come from meta_ fields, so the file keeps its "Artist - Title" name
  assert.ok(audio.embed?.some(arg => arg.includes('(?P<meta_artist>')))
  assert.ok(!audio.embed?.some(arg => arg.includes('(?P<title>')))
  for (const video of choices.filter(c => c.kind === 'video')) assert.deepEqual(video.embed, ['--embed-metadata'])
})

test('embedding is only asked for when ffmpeg is there', async () => {
  const dir = await tempDir()
  const outDir = path.join(dir, 'Downloads')
  const argsFile = path.join(dir, 'args.json')
  const ytdlp = await fakeYtDlp(
    dir,
    `fs.writeFileSync(${JSON.stringify(argsFile)}, JSON.stringify(args)); fs.writeFileSync(out, 'x'); say(out)`,
  )
  const withEmbed = {...choice, embed: ['--embed-metadata']}
  const ran = async (ffmpeg?: string) => {
    await download({ytdlp, ffmpeg, url: 'https://example.com/clip.mp4', choice: withEmbed, outDir}, noop)
    return JSON.parse(await fs.readFile(argsFile, 'utf8')) as string[]
  }

  const missing = await ran(undefined)
  // Windows prints in the console code page otherwise, and non-ASCII titles get lost
  assert.equal(missing[missing.indexOf('--encoding') + 1], 'utf-8')
  assert.ok(!missing.includes('--embed-metadata'))
  assert.ok(!missing.includes('--ffmpeg-location'))

  const onPath = await ran('ffmpeg')
  assert.ok(onPath.includes('--embed-metadata'))
  assert.ok(!onPath.includes('--ffmpeg-location')) // yt-dlp finds it on the PATH itself

  const bundled = await ran('/opt/ffmpeg-static/ffmpeg')
  assert.deepEqual(bundled.slice(bundled.indexOf('--ffmpeg-location'), bundled.indexOf('--ffmpeg-location') + 2), [
    '--ffmpeg-location',
    '/opt/ffmpeg-static/ffmpeg',
  ])
  await fs.rm(dir, {recursive: true, force: true})
})

test('files written alongside the download are kept, and options after -- come last', async () => {
  const dir = await tempDir()
  const outDir = path.join(dir, 'Downloads')
  const argsFile = path.join(dir, 'args.json')
  const ytdlp = await fakeYtDlp(
    dir,
    `fs.writeFileSync(${JSON.stringify(argsFile)}, JSON.stringify(args))
fs.writeFileSync(out.replace(/mp4$/, 'description'), 'about the clip')
fs.writeFileSync(out, 'video'); say(out)`,
  )
  const extra = ['--write-description', '--concurrent-fragments', '8']

  const saved = await download({ytdlp, url: 'https://example.com/clip.mp4', choice, outDir, extra}, noop)

  assert.equal(saved, path.join(outDir, 'clip.mp4'))
  assert.deepEqual((await fs.readdir(outDir)).sort(), ['clip.description', 'clip.mp4'])
  const args = JSON.parse(await fs.readFile(argsFile, 'utf8')) as string[]
  assert.deepEqual(args.slice(-extra.length), extra)
  await fs.rm(dir, {recursive: true, force: true})
})

// --load-info-json comes first, and node would take it for one of its own options
test('only expired links are retried, with fresh ones', {skip: process.platform === 'win32'}, async () => {
  const dir = await tempDir()
  const outDir = path.join(dir, 'Downloads')
  const infoJsonPath = path.join(dir, 'info.json')
  await fs.writeFile(infoJsonPath, '{}')
  const runs = path.join(dir, 'runs')
  // fails while reusing the probe's info with `error`, works with a fresh extraction
  const fake = (error: string) =>
    fakeYtDlp(
      dir,
      `fs.appendFileSync(${JSON.stringify(runs)}, 'x')
if (args.includes('--load-info-json')) { fs.writeSync(2, ${JSON.stringify(error + '\n')}); process.exit(1) }
fs.writeFileSync(out, 'video'); say(out)`,
    )
  let refreshed = 0
  const handlers = {...noop, onRefresh: () => refreshed++}

  const expired = await fake('ERROR: unable to download video data: HTTP Error 403: Forbidden')
  assert.equal(await download({ytdlp: expired, url: 'https://example.com/clip.mp4', choice, outDir, infoJsonPath}, handlers), path.join(outDir, 'clip.mp4'))
  assert.equal(refreshed, 1)

  await fs.rm(runs)
  const fullDisk = await fake('ERROR: unable to write data: [Errno 28] No space left on device')
  await assert.rejects(download({ytdlp: fullDisk, url: 'https://example.com/clip.mp4', choice, outDir, infoJsonPath}, handlers), /No space left/)
  assert.equal((await fs.readFile(runs, 'utf8')).length, 1) // not downloaded a second time
  await fs.rm(dir, {recursive: true, force: true})
})

test("playlist items with their own url skip -I; the others use it", async () => {
  const dir = await tempDir()
  const calls = path.join(dir, 'calls')
  const ytdlp = await fakeYtDlp(
    dir,
    `fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify(process.argv) + '\\n')
const n = args.includes('-I') ? args[args.indexOf('-I') + 1] : 'url'
const file = out.replace('clip.mp4', n + '.mp4'); fs.writeFileSync(file, 'x'); say(file)`,
  )
  const entries = [
    {index: 1, title: 'one', url: 'https://example.com/watch?v=one'},
    {index: 2, title: 'two'},
  ]
  const {folder, results} = await downloadPlaylist(
    {ytdlp, url: 'https://example.com/list', choice, outDir: dir, playlist: {title: 'My list', entries}, entries},
    {...noop, onItem: () => {}},
  )

  assert.equal(folder, path.join(dir, 'My list'))
  assert.deepEqual(results.map(r => r.error), [undefined, undefined])
  const [byUrl, byIndex] = (await fs.readFile(calls, 'utf8')).trim().split('\n').map(line => JSON.parse(line) as string[])
  // on Windows node holds the url in argv[1], as a resolved path: match on a part of it
  assert.ok(byUrl!.join(' ').includes('watch?v=one') && byUrl!.includes('--no-playlist') && !byUrl!.includes('-I'))
  assert.ok(byIndex!.join(' ').includes('list') && !byIndex!.join(' ').includes('watch?v=one'))
  assert.deepEqual(byIndex!.slice(byIndex!.indexOf('-I'), byIndex!.indexOf('-I') + 2), ['-I', '2'])
  await fs.rm(dir, {recursive: true, force: true})
})
