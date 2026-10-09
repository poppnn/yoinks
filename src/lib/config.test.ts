import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {loadConfig, parseConfig} from './config.js'

const home = path.resolve(path.sep, 'home', 'ana')
const file = path.join(home, '.config', 'yoinks', 'config.json')
const parse = (settings: unknown) => parseConfig(JSON.stringify(settings), file, home)

test('reads every setting', () => {
  assert.deepEqual(parse({output: '~/Videos', cookiesFromBrowser: 'firefox', theme: 'dark', format: 'mp3'}), {
    output: path.join(home, 'Videos'),
    cookies: {browser: 'firefox'},
    theme: 'dark',
    format: 'mp3',
  })
  assert.deepEqual(parse({}), {})
})

test('resolves relative paths from the config file, not the working directory', () => {
  assert.deepEqual(parse({cookies: 'cookies.txt', output: '../../Clips'}), {
    cookies: {file: path.join(home, '.config', 'yoinks', 'cookies.txt')},
    output: path.join(home, 'Clips'),
  })
})

test('rejects typos and wrong values, naming the file', () => {
  assert.throws(() => parse({outpt: '~/Videos'}), /config\.json: unknown setting “outpt”/)
  assert.throws(() => parse({theme: 'sepia'}), /unknown theme “sepia”/)
  assert.throws(() => parse({format: 'flac'}), /unknown format “flac”/)
  assert.throws(() => parse({cookiesFromBrowser: 'netscape'}), /unknown browser/)
  assert.throws(() => parse({cookies: 'a.txt', cookiesFromBrowser: 'firefox'}), /either “cookies” or “cookiesFromBrowser”/)
  assert.throws(() => parse({output: 42}), /“output” must be a non-empty string/)
  assert.throws(() => parse(['~/Videos']), /expected an object/)
  assert.throws(() => parseConfig('{"output": "~/Videos",}', file, home), /not valid JSON/)
})

test('no config file means no settings', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yoinks-config-'))
  try {
    assert.deepEqual(loadConfig(path.join(dir, 'config.json')), {})
    fs.writeFileSync(path.join(dir, 'config.json'), '{"theme": "light"}')
    assert.deepEqual(loadConfig(path.join(dir, 'config.json')), {theme: 'light'})
  } finally {
    fs.rmSync(dir, {recursive: true, force: true})
  }
})
