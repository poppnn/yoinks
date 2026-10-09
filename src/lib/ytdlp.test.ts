import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {describeYtDlpError, download, type DownloadChoice} from './ytdlp.js'
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

test("explains login walls without pointing at yt-dlp flags yoinks doesn't have", () => {
  const message = describeYtDlpError(AGE_GATE, managedPath())
  assert.match(message, /needs a signed-in account/)
  assert.doesNotMatch(message, /cookies-from-browser|https:/)
  assert.match(describeYtDlpError('ERROR: [Instagram] x: login required\n', 'yt-dlp'), /signed-in account/)
})

test('suggests the right update for errors an outdated yt-dlp causes', () => {
  assert.equal(
    describeYtDlpError(NO_FORMAT, managedPath()),
    'HyLCgkQtluw: Requested format is not available. This often means yt-dlp is out of date. Run “yoinks --update” and try again.',
  )
  assert.match(describeYtDlpError(NO_FORMAT, 'yt-dlp'), /Update your yt-dlp and try again\.$/)
  assert.match(describeYtDlpError('ERROR: unable to download video data: HTTP Error 403: Forbidden\n', '/opt/yt-dlp'), /Update \/opt\/yt-dlp/)
})

test('passes other errors through, and returns nothing without an error line', () => {
  assert.equal(
    describeYtDlpError('ERROR: [generic] Unable to download webpage: HTTP Error 404: Not Found\n', 'yt-dlp'),
    'Unable to download webpage: HTTP Error 404: Not Found',
  )
  assert.equal(describeYtDlpError('WARNING: just a warning\n', 'yt-dlp'), '')
})
