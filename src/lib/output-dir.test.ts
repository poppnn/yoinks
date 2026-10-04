import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {ensureOutputDir, resolveOutputDir} from './output-dir.js'

const home = path.join(path.sep, 'home', 'tester')

test('defaults to ~/Downloads when no flag is given', () => {
  assert.equal(resolveOutputDir(undefined, home), path.join(home, 'Downloads'))
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