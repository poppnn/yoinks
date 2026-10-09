import React from 'react'
import {Box, Text} from 'ink'
import {formatDuration, truncate} from '../lib/format.js'
import type {PlaylistEntry} from '../lib/playlist.js'
import {useTheme} from '../theme.js'

/** The rows to show so the cursor stays in view, scrolling a long playlist. */
export function visibleWindow(count: number, cursor: number, rows: number): [start: number, end: number] {
  if (count <= rows) return [0, count]
  const start = Math.min(Math.max(0, cursor - Math.floor(rows / 2)), count - rows)
  return [start, start + rows]
}

/** A playlist's items with checkboxes: ↑/↓ move, space ticks, a ticks all. */
export function Checklist({
  entries,
  selected,
  cursor,
  width,
  rows,
}: {
  entries: PlaylistEntry[]
  selected: ReadonlySet<number>
  cursor: number
  width: number
  rows: number
}) {
  const theme = useTheme()
  const [start, end] = visibleWindow(entries.length, cursor, rows)
  const numberWidth = String(entries.at(-1)?.index ?? 1).length

  return (
    <Box flexDirection="column" width={width}>
      <Text color={theme.gray} dimColor={theme.dimSecondary}>
        {start > 0 ? `  ↑ ${start} more` : ' '}
      </Text>
      {entries.slice(start, end).map((entry, offset) => {
        const position = start + offset
        const atCursor = position === cursor
        const ticked = selected.has(entry.index)
        const duration = entry.duration ? formatDuration(entry.duration) : ''
        const prefix = `${atCursor ? '❯' : ' '} ${ticked ? '◉' : '○'} ${String(entry.index).padStart(numberWidth)}  `
        const room = Math.max(8, width - prefix.length - duration.length - 2)
        return (
          <Box key={entry.index} width={width}>
            <Text color={theme.primary} bold={atCursor} dimColor={!ticked && theme.dimSecondary}>
              {prefix}
              {truncate(entry.title, room)}
            </Text>
            <Box flexGrow={1} />
            <Text color={theme.gray} dimColor={theme.dimSecondary}>
              {duration}
            </Text>
          </Box>
        )
      })}
      <Text color={theme.gray} dimColor={theme.dimSecondary}>
        {end < entries.length ? `  ↓ ${entries.length - end} more` : ' '}
      </Text>
    </Box>
  )
}
