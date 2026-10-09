import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {describeYtDlpError, download, probeWithCookies, type DownloadChoice} from './ytdlp.js'
import {managedPath} from './ytdlp-install.js'

const choice: DownloadChoice = {label: 'best', kind: 'video', args: []}
const noop = {onProgress: () => {}, onProcessing: () => {}}

/** A fake yt-dlp that saves to "clip.mp4" and then runs `body`. */
async function fakeYtDlp(dir: string, body: string): Promise<string> {
  const bin = path.join(dir, 'fake-yt-dlp')
  await fs.writeFile(
    bin,
    `#!/usr/bin/env node
const fs = require('node:fs')
const args = process.argv.slice(2)
const out = args[args.indexOf('-o') + 1].replace('%(title).60s', 'clip').replace('%(ext)s', 'mp4')
${body}
`,
    {mode: 0o755},
  )
  return bin
}

const tempDir = () => fs.mkdtemp(path.join(os.tmpdir(), 'yoinks-test-'))

test('a same-named file in the output folder is kept and the new download gets a free name', {skip: process.platform === 'win32'}, async () => {
  const dir = await tempDir()
  const outDir = path.join(dir, 'Downloads')
  await fs.mkdir(outDir)
  await fs.writeFile(path.join(outDir, 'clip.mp4'), 'an earlier, different video')
  const ytdlp = await fakeYtDlp(dir, `fs.writeFileSync(out, 'the video you just picked'); console.log(out)`)

  const filepath = await download({ytdlp, url: 'https://example.com/clip.mp4', choice, outDir}, noop)

  assert.equal(filepath, path.join(outDir, 'clip (1).mp4'))
  assert.equal(await fs.readFile(filepath, 'utf8'), 'the video you just picked')
  assert.equal(await fs.readFile(path.join(outDir, 'clip.mp4'), 'utf8'), 'an earlier, different video')
  assert.deepEqual((await fs.readdir(outDir)).sort(), ['clip (1).mp4', 'clip.mp4'])
  await fs.rm(dir, {recursive: true, force: true})
})

test('cancelling stops right away and leaves no partial files', {skip: process.platform === 'win32', timeout: 3000}, async () => {
  const dir = await tempDir()
  const outDir = path.join(dir, 'Downloads')
  const pidFile = path.join(dir, 'helper.pid')
  // the helper outlives yt-dlp and keeps its output pipe open, like ffmpeg can
  const ytdlp = await fakeYtDlp(
    dir,
    `fs.writeFileSync(out + '.part', 'half a video')
const helper = require('node:child_process').spawn('sleep', ['10'], {stdio: 'inherit'})
fs.writeFileSync(${JSON.stringify(pidFile)}, String(helper.pid))
console.log('YOINK|6|12|NA|NA|NA')
setInterval(() => {}, 1000)`,
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
  process.kill(Number(await fs.readFile(pidFile, 'utf8')))
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
