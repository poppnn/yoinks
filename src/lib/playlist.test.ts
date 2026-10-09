import assert from 'node:assert/strict'
import test from 'node:test'
import {downloadItems, folderName, itemTemplate, parsePlaylist, selectItems, type PlaylistEntry} from './playlist.js'

// trimmed from real `yt-dlp -J --flat-playlist` output
const search = {
  _type: 'playlist',
  title: 'rick astley never gonna give you up',
  entries: [
    {_type: 'url', ie_key: 'Youtube', id: 'dQw4w9WgXcQ', title: 'Rick Astley - Never Gonna Give You Up', duration: 214},
    {_type: 'url', ie_key: 'Youtube', id: '7FwDP17XPlk', title: 'Never Gonna Give You Up (lyrics)'},
    {_type: 'url', ie_key: 'Youtube', id: 'LLFhKaqnWwk', title: ''},
  ],
}

test('reads a flat playlist, and leaves single videos alone', () => {
  assert.deepEqual(parsePlaylist(search), {
    title: 'rick astley never gonna give you up',
    entries: [
      {index: 1, title: 'Rick Astley - Never Gonna Give You Up', duration: 214},
      {index: 2, title: 'Never Gonna Give You Up (lyrics)', duration: undefined},
      {index: 3, title: 'item 3', duration: undefined},
    ],
  })
  assert.equal(parsePlaylist({title: 'one video', formats: []}), undefined)
  assert.equal(parsePlaylist(null), undefined)
})

test('skips entries that are playlists themselves, keeping yt-dlp positions', () => {
  const channel = {
    _type: 'playlist',
    title: 'a channel',
    entries: [{_type: 'url', ie_key: 'YoutubeTab', title: 'a channel - Shorts'}, {_type: 'url', ie_key: 'Youtube', title: 'clip'}],
  }
  assert.deepEqual(parsePlaylist(channel)?.entries, [{index: 2, title: 'clip', duration: undefined}])
})

const entries: PlaylistEntry[] = Array.from({length: 12}, (_, i) => ({index: i + 1, title: `t${i + 1}`}))
const indexes = (spec: string) => selectItems(spec, entries).map(e => e.index)

test('--items takes numbers and ranges, in playlist order', () => {
  assert.deepEqual(indexes('3'), [3])
  assert.deepEqual(indexes('7,1-3'), [1, 2, 3, 7])
  assert.deepEqual(indexes('10-'), [10, 11, 12])
  assert.deepEqual(indexes('11-40'), [11, 12]) // ranges stop at the end
  assert.throws(() => selectItems('two', entries), /“two” isn't a number or a range/)
  assert.throws(() => selectItems('5-2', entries), /not a valid range/)
  assert.throws(() => selectItems('20-30', entries), /nothing in “20-30” — the playlist has 12 items/)
})

test('folder names every OS accepts', () => {
  assert.equal(folderName('Best of: 80s / 90s?'), 'Best of_ 80s _ 90s_')
  assert.equal(folderName('  trailing dots... '), 'trailing dots')
  assert.equal(folderName('CON'), '_CON')
  assert.equal(folderName('   '), 'playlist')
  assert.equal(folderName('x'.repeat(200)).length, 80)
})

test('item files are numbered so they sort in playlist order', () => {
  assert.equal(itemTemplate({index: 7, title: 't'}, 12), '07 - %(title).60s.%(ext)s')
  assert.equal(itemTemplate({index: 7, title: 't'}, 150), '007 - %(title).60s.%(ext)s')
})

test('one failed item does not stop the others; a cancel does', async () => {
  const seen: number[] = []
  const results = await downloadItems(
    entries.slice(0, 3),
    async entry => {
      if (entry.index === 2) throw new Error('Private video')
      return `/out/${entry.title}.mp4`
    },
    position => seen.push(position),
  )
  assert.deepEqual(seen, [0, 1, 2])
  assert.deepEqual(
    results.map(r => r.filepath ?? r.error),
    ['/out/t1.mp4', 'Private video', '/out/t3.mp4'],
  )

  const controller = new AbortController()
  let started = 0
  await assert.rejects(
    downloadItems(
      entries.slice(0, 3),
      async () => {
        started++
        controller.abort()
        throw new Error('Download cancelled.')
      },
      () => {},
      controller.signal,
    ),
    /cancelled/,
  )
  assert.equal(started, 1)
})
