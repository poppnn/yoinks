import assert from 'node:assert/strict'
import test from 'node:test'
import {checkYtDlpArgs} from './passthrough.js'

test('lets through options that leave yoinks working', () => {
  for (const args of [
    ['--proxy', 'socks5://127.0.0.1:9050'],
    ['--concurrent-fragments', '8'],
    ['-R', '10'],
    ['--embed-subs', '--sub-langs', 'fr,en'],
    ['--extractor-args', 'youtube:player_client=mweb'],
    [],
  ]) {
    assert.equal(checkYtDlpArgs(args), undefined, args.join(' '))
  }
})

test('refuses options that would break progress, the output path or the picker', () => {
  const refused = (...args: string[]) => checkYtDlpArgs(args) ?? ''
  assert.match(refused('-o', 'x.mp4'), /“-o” can't be passed to yt-dlp — use yoinks' -o and -n/)
  assert.match(refused('--output=x.mp4'), /“--output”/)
  assert.match(refused('-ox.mp4'), /“-o”/) // short option with its value attached
  assert.match(refused('-P', '/tmp'), /“-P”/)
  assert.match(refused('-f', 'best'), /picker, or use --best or --mp3/)
  assert.match(refused('-x'), /“-x”/)
  assert.match(refused('--quiet'), /reads that output for progress/)
  assert.match(refused('--print', 'title'), /“--print”/)
  assert.match(refused('--skip-download'), /needs the download to happen/)
  assert.match(refused('-U'), /yoinks --update/)
  assert.match(refused('--yes-playlist'), /use --items/)
  assert.match(refused('-I', '1:3'), /use --items/)
})
