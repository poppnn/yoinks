import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {downloadsDir, ensureOutputDir, resolveOutputDir} from './output-dir.js'

// absolute on every OS — on Windows path.resolve would add a drive letter
const home = path.resolve(path.sep, 'home', 'tester')

test('defaults to the Downloads folder when no flag is given', () => {
  assert.equal(resolveOutputDir(undefined, home, () => '/somewhere/Downloads'), '/somewhere/Downloads')
})

test('Windows: follows a moved Downloads folder, expanding %VARS% case-insensitively', () => {
  const win = {platform: 'win32', homedir: 'C:\\Users\\ana', readFile: () => undefined}
  const env = {UserProfile: 'C:\\Users\\ana'}
  assert.equal(downloadsDir({...win, env, readRegistry: () => '%USERPROFILE%\\Downloads'}), 'C:\\Users\\ana\\Downloads')
  assert.equal(downloadsDir({...win, env, readRegistry: () => 'D:\\Téléchargements'}), 'D:\\Téléchargements')
  // unreadable, unexpandable or relative values fall back to ~\Downloads
  assert.equal(downloadsDir({...win, env, readRegistry: () => undefined}), 'C:\\Users\\ana\\Downloads')
  assert.equal(downloadsDir({...win, env: {}, readRegistry: () => '%NOPE%\\Downloads'}), 'C:\\Users\\ana\\Downloads')
  assert.equal(downloadsDir({...win, env, readRegistry: () => 'Downloads'}), 'C:\\Users\\ana\\Downloads')
})

test('Linux: honours XDG_DOWNLOAD_DIR and user-dirs.dirs', () => {
  const linux = {platform: 'linux', homedir: '/home/ana', readRegistry: () => undefined}
  const dirs = (value: string) => (file: string) =>
    file === '/home/ana/.config/user-dirs.dirs' ? `# comment\nXDG_DESKTOP_DIR="$HOME/Bureau"\nXDG_DOWNLOAD_DIR="${value}"\n` : undefined

  assert.equal(downloadsDir({...linux, env: {XDG_DOWNLOAD_DIR: '/data/dl'}, readFile: dirs('$HOME/x')}), '/data/dl')
  assert.equal(downloadsDir({...linux, env: {}, readFile: dirs('$HOME/Téléchargements')}), '/home/ana/Téléchargements')
  assert.equal(downloadsDir({...linux, env: {}, readFile: dirs('/mnt/big/dl')}), '/mnt/big/dl')
  // xdg-user-dirs disables a folder by pointing it at $HOME
  assert.equal(downloadsDir({...linux, env: {}, readFile: dirs('$HOME/')}), '/home/ana/Downloads')
  assert.equal(downloadsDir({...linux, env: {}, readFile: () => undefined}), '/home/ana/Downloads')
  assert.equal(
    downloadsDir({...linux, env: {XDG_CONFIG_HOME: '/cfg'}, readFile: f => (f === '/cfg/user-dirs.dirs' ? 'XDG_DOWNLOAD_DIR="/cfg-dl"' : undefined)}),
    '/cfg-dl',
  )
})

test('macOS: always ~/Downloads', () => {
  assert.equal(
    downloadsDir({platform: 'darwin', homedir: '/Users/ana', env: {XDG_DOWNLOAD_DIR: '/x'}, readRegistry: () => 'D:\\x', readFile: () => undefined}),
    '/Users/ana/Downloads',
  )
})

test('expands ~ and resolves relative paths', () => {
  assert.equal(resolveOutputDir('~/vids', home), path.join(home, 'vids'))
  assert.equal(resolveOutputDir('~', home), home)
  assert.equal(resolveOutputDir('clips', home), path.resolve('clips'))
})

test('creates a missing folder and rejects a path that is a file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yoinks-'))
  try {
    const nested = path.join(root, 'a', 'b')
    ensureOutputDir(nested)
    assert.ok(fs.statSync(nested).isDirectory())

    const file = path.join(root, 'file.txt')
    fs.writeFileSync(file, 'x')
    assert.throws(() => ensureOutputDir(file), /can’t save to/)
  } finally {
    fs.rmSync(root, {recursive: true, force: true})
  }
})
