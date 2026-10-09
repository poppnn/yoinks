import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  CHECK_INTERVAL_MS,
  assetName,
  dueForCheck,
  installLatest,
  managedPath,
  markChecked,
  parseChecksums,
} from './ytdlp-install.js'

const sha256 = (data: string) => createHash('sha256').update(data).digest('hex')
const tempDir = () => fs.mkdtemp(path.join(os.tmpdir(), 'yoinks-install-test-'))

/** A fake GitHub serving one yt-dlp release; records every url it is asked for. */
function fakeGitHub(opts: {tag: string; asset: string; binary: string; checksum?: string}) {
  const requests: string[] = []
  const base = `https://github.com/yt-dlp/yt-dlp/releases/download/${opts.tag}`
  const fakeFetch = (async (input: string | URL | Request) => {
    const url = String(input)
    requests.push(url)
    if (url.endsWith('/releases/latest/download/SHA2-256SUMS')) {
      return new Response(null, {status: 302, headers: {location: `${base}/SHA2-256SUMS`}})
    }
    if (url === `${base}/SHA2-256SUMS`) {
      const hash = opts.checksum ?? sha256(opts.binary)
      return new Response(`${sha256('other')}  yt-dlp_other\n${hash}  ${opts.asset}\n`)
    }
    if (url === `${base}/${opts.asset}`) return new Response(opts.binary)
    return new Response('not found', {status: 404})
  }) as typeof globalThis.fetch
  return {fetch: fakeFetch, requests, binaryUrl: `${base}/${opts.asset}`}
}

test('picks the standalone build for each platform, and none where it cannot run', () => {
  assert.equal(assetName('win32', 'x64'), 'yt-dlp.exe')
  assert.equal(assetName('win32', 'arm64'), 'yt-dlp_arm64.exe')
  assert.equal(assetName('darwin', 'arm64'), 'yt-dlp_macos')
  assert.equal(assetName('linux', 'x64'), 'yt-dlp_linux')
  assert.equal(assetName('linux', 'arm64'), 'yt-dlp_linux_aarch64')
  assert.equal(assetName('android', 'arm64'), undefined) // Termux: glibc builds don't run
  assert.equal(assetName('linux', 'ia32'), undefined)
  assert.equal(path.basename(managedPath('/x', 'win32')), 'yt-dlp.exe')
  assert.equal(path.basename(managedPath('/x', 'linux')), 'yt-dlp')
})

test('parses sha256sum output, including binary-mode markers', () => {
  const a = 'a'.repeat(64)
  const b = 'B'.repeat(64)
  const sums = parseChecksums(`${a}  yt-dlp\r\n${b} *yt-dlp.exe\nnot a checksum line\n`)
  assert.equal(sums.get('yt-dlp'), a)
  assert.equal(sums.get('yt-dlp.exe'), 'b'.repeat(64))
  assert.equal(sums.size, 2)
})

test('installs the latest release when nothing is there yet', async () => {
  const dir = await tempDir()
  const target = path.join(dir, 'bin', 'yt-dlp')
  const gh = fakeGitHub({tag: '2026.10.01', asset: 'yt-dlp_linux', binary: 'new yt-dlp'})
  const statuses: string[] = []

  const result = await installLatest({target, asset: 'yt-dlp_linux', fetch: gh.fetch, onStatus: s => statuses.push(s)})

  assert.deepEqual(result, {status: 'installed', tag: '2026.10.01'})
  assert.equal(await fs.readFile(target, 'utf8'), 'new yt-dlp')
  assert.deepEqual(await fs.readdir(path.dirname(target)), ['yt-dlp']) // no leftover .download
  assert.match(statuses[0] ?? '', /first run.*2026\.10\.01/)
  await fs.rm(dir, {recursive: true, force: true})
})

test('replaces an outdated copy', async () => {
  const dir = await tempDir()
  const target = path.join(dir, 'yt-dlp')
  await fs.writeFile(target, 'old yt-dlp')
  const gh = fakeGitHub({tag: '2026.10.01', asset: 'yt-dlp_linux', binary: 'new yt-dlp'})

  const result = await installLatest({target, asset: 'yt-dlp_linux', fetch: gh.fetch})

  assert.deepEqual(result, {status: 'updated', tag: '2026.10.01'})
  assert.equal(await fs.readFile(target, 'utf8'), 'new yt-dlp')
  await fs.rm(dir, {recursive: true, force: true})
})

test('an up-to-date copy costs two small requests and no binary download', async () => {
  const dir = await tempDir()
  const target = path.join(dir, 'yt-dlp')
  await fs.writeFile(target, 'current yt-dlp')
  const gh = fakeGitHub({tag: '2026.10.01', asset: 'yt-dlp_linux', binary: 'current yt-dlp'})

  const result = await installLatest({target, asset: 'yt-dlp_linux', fetch: gh.fetch})

  assert.deepEqual(result, {status: 'up-to-date', tag: '2026.10.01'})
  assert.equal(gh.requests.length, 2)
  assert.ok(!gh.requests.includes(gh.binaryUrl))
  await fs.rm(dir, {recursive: true, force: true})
})

test('a download that fails its checksum is discarded and the old copy kept', async () => {
  const dir = await tempDir()
  const target = path.join(dir, 'yt-dlp')
  await fs.writeFile(target, 'old yt-dlp')
  const gh = fakeGitHub({tag: '2026.10.01', asset: 'yt-dlp_linux', binary: 'tampered', checksum: sha256('genuine')})

  await assert.rejects(installLatest({target, asset: 'yt-dlp_linux', fetch: gh.fetch}), /doesn't match its checksum/)

  assert.equal(await fs.readFile(target, 'utf8'), 'old yt-dlp')
  assert.deepEqual(await fs.readdir(dir), ['yt-dlp'])
  await fs.rm(dir, {recursive: true, force: true})
})

test('fails clearly when the release has no build for this platform', async () => {
  const dir = await tempDir()
  const gh = fakeGitHub({tag: '2026.10.01', asset: 'yt-dlp_linux', binary: 'x'})

  await assert.rejects(
    installLatest({target: path.join(dir, 'yt-dlp'), asset: 'yt-dlp_exotic', fetch: gh.fetch}),
    /no checksum for yt-dlp_exotic/,
  )
  await fs.rm(dir, {recursive: true, force: true})
})

test('checks for updates at most once per interval', async () => {
  const dir = await tempDir()
  assert.equal(await dueForCheck(dir), true)

  await markChecked(dir)
  assert.equal(await dueForCheck(dir), false)
  assert.equal(await dueForCheck(dir, Date.now() + CHECK_INTERVAL_MS + 1000), true)
  await fs.rm(dir, {recursive: true, force: true})
})
