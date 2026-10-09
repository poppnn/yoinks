import assert from 'node:assert/strict'
import test from 'node:test'
import {parseArgs} from './args.js'
import {isThemeMode, nextThemeMode, themeFor} from '../theme.js'

test('parses a url and a spaced theme option without confusing the value for the url', () => {
  assert.deepEqual(parseArgs(['--theme', 'light', 'https://example.com/video']), {
    help: false,
    version: false,
    update: false,
    themeMode: 'light',
    initialUrl: 'https://example.com/video',
  })
})

test('parses an equals-style theme option after the url', () => {
  assert.deepEqual(parseArgs(['https://example.com/video', '--theme=dark']), {
    help: false,
    version: false,
    update: false,
    themeMode: 'dark',
    initialUrl: 'https://example.com/video',
  })
})

test('parses --update on its own', () => {
  assert.equal(parseArgs(['--update']).update, true)
  assert.equal(parseArgs([]).update, false)
})

test('parses cookie options, and only one of them', () => {
  assert.deepEqual(parseArgs(['--cookies', '~/c.txt', 'https://x.com/v']).cookies, {file: '~/c.txt'})
  assert.deepEqual(parseArgs(['--cookies=c.txt']).cookies, {file: 'c.txt'})
  assert.deepEqual(parseArgs(['--cookies-from-browser', 'firefox']).cookies, {browser: 'firefox'})
  // the full yt-dlp spec goes through untouched
  assert.deepEqual(parseArgs(['--cookies-from-browser=Chrome+gnomekeyring:Profile 1']).cookies, {browser: 'Chrome+gnomekeyring:Profile 1'})
  assert.equal(parseArgs(['https://x.com/v']).cookies, undefined)

  assert.match(parseArgs(['--cookies']).error ?? '', /needs a cookies\.txt file/)
  assert.match(parseArgs(['--cookies-from-browser', '--theme']).error ?? '', /needs a browser/)
  assert.match(parseArgs(['--cookies-from-browser', 'netscape']).error ?? '', /unknown browser “netscape”/)
  assert.match(parseArgs(['--cookies', 'a.txt', '--cookies-from-browser', 'firefox']).error ?? '', /either --cookies or --cookies-from-browser/)
})

test('parses --name, keeping the name a plain file name', () => {
  assert.equal(parseArgs(['-n', 'my clip', 'https://x.com/v']).name, 'my clip')
  assert.equal(parseArgs(['--name=song.mp3']).name, 'song.mp3')
  assert.match(parseArgs(['--name']).error ?? '', /needs a file name/)
  assert.match(parseArgs(['--name', '../escape']).error ?? '', /cannot contain/)
  assert.match(parseArgs(['--name', 'NUL']).error ?? '', /reserved/)
})

test('parses --best and --mp3, but not both', () => {
  assert.equal(parseArgs(['--best', 'https://x.com/v']).pick, 'best')
  assert.equal(parseArgs(['https://x.com/v', '--mp3']).pick, 'mp3')
  assert.equal(parseArgs(['https://x.com/v']).pick, undefined)
  assert.match(parseArgs(['--best', '--mp3']).error ?? '', /either --best or --mp3/)
})

test('rejects missing, invalid, and unknown options', () => {
  assert.match(parseArgs(['--theme']).error ?? '', /needs a value/)
  assert.match(parseArgs(['--theme', 'sepia']).error ?? '', /unknown theme/)
  assert.match(parseArgs(['--wat']).error ?? '', /unknown option/)
  assert.match(parseArgs(['one', 'two']).error ?? '', /single url/)
})

test('recognizes only supported modes and cycles through all of them', () => {
  assert.equal(isThemeMode('auto'), true)
  assert.equal(isThemeMode('light'), true)
  assert.equal(isThemeMode('dark'), true)
  assert.equal(isThemeMode('sepia'), false)
  assert.equal(nextThemeMode('auto'), 'light')
  assert.equal(nextThemeMode('light'), 'dark')
  assert.equal(nextThemeMode('dark'), 'auto')
})

test('auto delegates to terminal colors while forced modes own the full surface', () => {
  assert.deepEqual(themeFor('auto'), {
    mode: 'auto',
    primary: undefined,
    gray: undefined,
    dark: undefined,
    background: undefined,
    dimSecondary: true,
    inverseButton: true,
  })

  assert.equal(themeFor('light').background, '#ffffff')
  assert.equal(themeFor('light').primary, '#18181b')
  assert.equal(themeFor('dark').background, '#18181b')
  assert.equal(themeFor('dark').primary, '#ffffff')
})

test('parses -o, --output and --output= as the output folder', () => {
  assert.equal(parseArgs(['-o', '~/Videos']).outputDir, '~/Videos')
  assert.equal(parseArgs(['--output', '/tmp/vids', 'https://example.com/v']).outputDir, '/tmp/vids')
  assert.equal(parseArgs(['--output=/tmp/vids']).outputDir, '/tmp/vids')
  assert.equal(parseArgs(['https://example.com/v']).outputDir, undefined)
})

test('rejects -o without a folder', () => {
  assert.match(parseArgs(['-o']).error ?? '', /needs a folder/)
  assert.match(parseArgs(['-o', '--theme', 'dark']).error ?? '', /needs a folder/)
  assert.match(parseArgs(['--output=']).error ?? '', /needs a folder/)
})