/**
 * Options that would break yoinks if passed through to yt-dlp, with what to
 * do instead. yoinks reads yt-dlp's console output for progress and the
 * saved file's path, downloads into its own staging folder, and the picker
 * owns the format — so options touching any of those are refused.
 */
const REFUSED: Array<[flags: string[], instead: string]> = [
  [['-o', '--output', '-P', '--paths'], "use yoinks' -o and -n"],
  [['-f', '--format', '-x', '--extract-audio', '--audio-format'], 'pick in the picker, or use --best or --mp3'],
  [
    ['-q', '--quiet', '--no-progress', '--progress-template', '-O', '--print', '--print-to-file', '--newline'],
    'yoinks reads that output for progress',
  ],
  [
    ['-s', '--simulate', '--skip-download', '-j', '--dump-json', '-J', '--dump-single-json', '-F', '--list-formats', '-g', '--get-url'],
    'yoinks needs the download to happen',
  ],
  [['--load-info-json', '-a', '--batch-file'], 'pass one url to yoinks instead'],
  [['-U', '--update', '--update-to'], 'use yoinks --update'],
  // yoinks picks playlist items itself, one -I per download
  [['-I', '--playlist-items', '--yes-playlist', '--no-playlist'], 'paste the playlist link, and use --items to pick'],
]

/** Why `args` can't be passed to yt-dlp, or undefined if they can. */
export function checkYtDlpArgs(args: string[]): string | undefined {
  for (const arg of args) {
    if (!arg.startsWith('-')) continue
    // --long=value, and short options with their value attached (-ofile)
    const flag = arg.startsWith('--') ? arg.split('=')[0]! : arg.slice(0, 2)
    for (const [flags, instead] of REFUSED) {
      if (flags.includes(flag)) return `“${flag}” can't be passed to yt-dlp — ${instead}`
    }
  }
  return undefined
}
