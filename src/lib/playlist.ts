export type PlaylistEntry = {
  /** 1-based position in the playlist, as yt-dlp's -I counts */
  index: number
  title: string
  duration?: number
}

export type PlaylistInfo = {
  title: string
  entries: PlaylistEntry[]
}

/**
 * The playlist in yt-dlp's `-J --flat-playlist` output, or undefined when
 * it describes a single video. Entries that are playlists themselves (a
 * channel's tabs) are left out: they aren't videos to download.
 */
export function parsePlaylist(json: unknown): PlaylistInfo | undefined {
  const raw = json as {_type?: unknown; title?: unknown; entries?: unknown} | null
  if (raw?._type !== 'playlist') return undefined
  const list = Array.isArray(raw.entries) ? (raw.entries as Array<Record<string, unknown> | null>) : []
  const entries = list.flatMap((entry, position) => {
    if (!entry || /(Tab|Playlist)$/.test(String(entry.ie_key ?? ''))) return []
    const title = typeof entry.title === 'string' && entry.title.trim() ? entry.title : `item ${position + 1}`
    const duration = typeof entry.duration === 'number' ? entry.duration : undefined
    return [{index: position + 1, title, duration}]
  })
  return {title: typeof raw.title === 'string' && raw.title.trim() ? raw.title : 'playlist', entries}
}

/**
 * Parses an --items list like "1-3,7,10-" (1-based, as shown in the
 * picker) into the matching entries, in playlist order.
 */
export function selectItems(spec: string, entries: PlaylistEntry[]): PlaylistEntry[] {
  const wanted = new Set<number>()
  const count = entries.length
  for (const part of spec.split(',').map(p => p.trim())) {
    const match = /^(\d+)(?:(-)(\d*))?$/.exec(part)
    if (!match) throw new Error(`--items: “${part}” isn't a number or a range like 2-5`)
    const from = Number(match[1])
    const to = match[2] ? (match[3] ? Number(match[3]) : count) : from
    if (from < 1 || to < from) throw new Error(`--items: “${part}” is not a valid range`)
    for (let n = from; n <= Math.min(to, count); n++) wanted.add(n)
  }
  const picked = entries.filter((_, i) => wanted.has(i + 1))
  if (picked.length === 0) throw new Error(`--items: nothing in “${spec}” — the playlist has ${count} item${count === 1 ? '' : 's'}`)
  return picked
}

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i

/** A folder name every OS accepts, from a playlist title. */
export function folderName(title: string): string {
  const cleaned = title
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .replace(/[. ]+$/, '')
  if (!cleaned) return 'playlist'
  return RESERVED.test(cleaned) ? `_${cleaned}` : cleaned
}

/** yt-dlp output template for one item: "07 - Title.ext", padded to the playlist's size. */
export function itemTemplate(entry: PlaylistEntry, count: number): string {
  const width = String(count).length
  return `${String(entry.index).padStart(Math.max(2, width), '0')} - %(title).60s.%(ext)s`
}

export type ItemResult = {entry: PlaylistEntry; filepath?: string; error?: string}

/**
 * Downloads entries one after the other. A failed item is recorded and the
 * next one starts — one private video shouldn't sink a whole album. Only a
 * cancel stops the run.
 */
export async function downloadItems(
  entries: PlaylistEntry[],
  run: (entry: PlaylistEntry) => Promise<string>,
  onItem: (position: number, entry: PlaylistEntry) => void,
  signal?: AbortSignal,
): Promise<ItemResult[]> {
  const results: ItemResult[] = []
  for (const [position, entry] of entries.entries()) {
    signal?.throwIfAborted()
    onItem(position, entry)
    try {
      results.push({entry, filepath: await run(entry)})
    } catch (error) {
      if (signal?.aborted) throw error
      results.push({entry, error: error instanceof Error ? error.message : String(error)})
    }
  }
  return results
}
