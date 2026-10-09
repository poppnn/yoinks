import assert from 'node:assert/strict'
import test from 'node:test'
import {shortenPath} from './format.js'

const home = '/home/ana'

test('short paths are shown whole, with ~ for home', () => {
  assert.equal(shortenPath('/home/ana/Downloads/clip.mp4', home), '~/Downloads/clip.mp4')
})

test('long paths lose their middle, keeping the file or folder name', () => {
  const folder = '/media/external-drive/archive/2026/october/rick astley never gonna give you up'
  const short = shortenPath(folder, home, 60)
  assert.equal(short.length, 60)
  assert.ok(short.endsWith('/rick astley never gonna give you up'), short)
  assert.ok(short.startsWith('/media/'), short)
  assert.match(shortenPath(String.raw`C:\Users\ana\AppData\Local\Temp\some\deep\folder\Me at the zoo.mp4`, 'D:\\', 40), /…\\Me at the zoo\.mp4$/)
})

test('a name too long on its own is cut, keeping its extension', () => {
  const short = shortenPath(`/x/${'a'.repeat(100)}.mp4`, home, 40)
  assert.equal(short.length, 40)
  assert.ok(short.endsWith('….mp4'), short)
})
