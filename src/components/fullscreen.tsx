import React, {useEffect, useState, type ReactNode} from 'react'
import {Box, useStdout} from 'ink'
import {useTheme} from '../theme.js'

/** `plain`: lay out at natural height, for output that stays in the scrollback. */
export function FullScreen({children, plain = false}: {children: ReactNode; plain?: boolean}) {
  const theme = useTheme()
  const {stdout} = useStdout()
  const dimensions = () => ({
    columns: stdout?.columns && stdout.columns > 0 ? stdout.columns : 80,
    rows: stdout?.rows && stdout.rows > 1 ? stdout.rows : 24,
  })
  const [size, setSize] = useState(dimensions)

  useEffect(() => {
    if (!stdout) return
    const onResize = () => setSize(dimensions())
    stdout.on('resize', onResize)
    return () => {
      stdout.off('resize', onResize)
    }
  }, [stdout])

  if (plain) {
    return (
      <Box flexDirection="column" alignItems="center" width={size.columns}>
        {children}
      </Box>
    )
  }

  return (
    <Box
      width={size.columns}
      height={size.rows - 1}
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      backgroundColor={theme.background}
    >
      {/* single wrapper so centering leftover lands on ONE node: when the
          leftover is odd, yoga gives every direct child a *.5 y-position and
          rounds each one independently — spacer rows collapse into their
          neighbors while extra blanks open up elsewhere */}
      <Box flexDirection="column" alignItems="center" flexShrink={0}>
        {children}
      </Box>
    </Box>
  )
}
