# yoinks

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
  <img src="assets/logo-light.svg" alt="yoinks" width="288">
</picture>

yoink any video. paste. yoink. done.

Download videos from YouTube, X/Twitter, Instagram, Threads, TikTok and
1,800+ other sites — right from your terminal. Paste a url, pick a
resolution (or audio-only mp3), done. No popups, no fake download buttons,
no sketchy redirects.

<img src="assets/home.png" alt="yoinks home screen — paste a link and hit yoink" width="100%">

## Install

```sh
npm install -g yoinks
```

Or try it without installing anything:

```sh
npx yoinks
```

Requires Node 22+. Everything else (yt-dlp, ffmpeg) is fetched or bundled
automatically.

## Usage

```sh
$ yoinks https://youtu.be/dQw4w9WgXcQ    # straight to the format picker
$ yoinks                                 # prompts for a url
$ yoinks --theme light                   # force the light palette
$ yoinks -o <path> <url>                 # save to a folder of your choice
```

yoinks takes over the terminal (full-screen, centered — and restores your
scrollback on exit). Pick a format with ↑/↓ (or j/k, or number keys) and
hit enter. `esc` goes back, `^c` quits. Or just use the mouse — the yoink
button, the format list and the footer hints are all clickable, and
clicking the logo takes you back home. Files are saved to your Downloads
folder — the one your system uses, even if you moved it — or to any folder
with `-o <dir>`. The file path is printed to your terminal when you're done.
When it's saved, `o` opens its folder and `c` copies the file itself, ready
to paste into a chat or another folder.

The default `auto` theme uses your terminal's own foreground and background,
so it follows light and dark terminal themes without guessing. Press `^t` or
click the theme control in the footer to cycle through `auto`, `light`, and
`dark` for the current session. Use `--theme auto`, `--theme light`, or
`--theme dark` to choose the starting theme for one launch.

<img src="assets/download-options.png" alt="yoinks format picker — resolutions with estimated file sizes, plus audio-only mp3" width="100%">

### Accessibility

- `--plain` keeps everything in the normal scrollback, at its natural
  height, with no mouse tracking and no animation — the mode to use with a
  screen reader. It is also used when `TERM=dumb`.
- `--no-mouse` leaves text selection to your terminal.
- `--no-motion` keeps the logo still.
- The default `auto` theme prints no colours at all, only bold, dim and
  inverse, so it already honours `NO_COLOR`.

Each has a config setting, so you can set it once.

## Scripting

`--best` (highest quality video) or `--mp3` (audio only) skip the picker
and the interface: progress goes to stderr, and the saved file's path is
the only thing printed on stdout.

```sh
f=$(yoinks --mp3 -n "my song" https://youtu.be/dQw4w9WgXcQ) && echo "got $f"
```

The exit code is 0 when the file is saved, 1 on failure and 130 when you
press ^c. When stdout isn't a terminal — a pipe, a script — yoinks runs
this way on its own, with `--best` unless you pass `--mp3`.

## Configuration

Settings you'd otherwise pass every time go in
`~/.config/yoinks/config.json` (the same path on every OS):

```json
{
  "output": "~/Videos",
  "cookies": "~/cookies.txt",
  "theme": "dark",
  "format": "mp3"
}
```

| Setting | Same as | Notes |
|---|---|---|
| `output` | `-o` | relative paths are relative to the config file |
| `cookies` | `--cookies` | |
| `cookiesFromBrowser` | `--cookies-from-browser` | not together with `cookies` |
| `theme` | `--theme` | `auto`, `light` or `dark` |
| `format` | — | `best` or `mp3`: highlighted in the picker, and used when the picker is skipped |
| `plain` | `--plain` | `true` or `false` |
| `mouse` | `--no-mouse` | `false` turns it off |
| `motion` | `--no-motion` | `false` turns it off |

Options on the command line win over the file. A setting yoinks doesn't
know is an error rather than silently ignored, so a typo can't go
unnoticed.

## Passing options to yt-dlp

Anything after `--` goes to yt-dlp as is:

```sh
yoinks <url> -- --proxy socks5://127.0.0.1:9050
yoinks <url> -- --write-auto-subs --embed-subs --sub-langs en
```

Files yt-dlp writes alongside the download (subtitles, thumbnails…) are
kept next to it. Options that would break yoinks are refused, with what to
use instead: output paths, the format (the picker chooses it), and
anything that changes the output yoinks reads for progress.

## Signing in

Some videos need an account: age-restricted ones, members-only ones, many
Instagram posts. yoinks never signs in on its own — pass your login as
cookies, for that run:

```sh
yoinks --cookies ~/cookies.txt <url>           # a cookies.txt you exported
yoinks --cookies-from-browser firefox <url>    # read them from a browser
```

If yoinks can't read the cookies, it carries on without them and tells you
why, so public videos still download.

**On Windows, prefer `--cookies`.** Chrome, Edge and other Chromium
browsers lock their cookies away from other apps, so
`--cookies-from-browser chrome` usually fails there. Firefox works.

**Exporting a cookies.txt that lasts.** YouTube rotates its session
cookies, so cookies exported from your everyday browser window stop working
within hours. Instead:

1. Open a private window and sign in to YouTube there.
2. Open a new tab and close the one you signed in with.
3. Export the cookies with a cookies.txt extension — prefer an open-source
   one that works offline: an extension that can read cookies can read
   all your sessions.
4. Close the private window. **Don't sign out**: that would invalidate the
   cookies you just exported.

A cookies.txt is as good as your password: don't share it or commit it.

## How it works

- Powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp). On first run,
  yoinks downloads the standalone yt-dlp binary to `~/.yoinks/bin` —
  no Python required — and checks its SHA-256 against the release.
- Sites change all the time and an outdated yt-dlp is the most common
  reason a download fails, so yoinks looks for a new yt-dlp release once
  a day and updates its copy. `yoinks --update` does it right away.
- To use your own yt-dlp instead, set `YOINKS_YT_DLP` to its name or
  path. Your system yt-dlp is also used as a fallback when yoinks can't
  get its own copy, e.g. offline on first run or on Termux.
- ffmpeg (needed for merging high-res streams and mp3 extraction) is found
  on your PATH, with `ffmpeg-static` as a bundled fallback.
- The UI is [Ink](https://github.com/vadimdemedes/ink) — React for the
  terminal.

## Development

```sh
npm install
npm run build        # bundle to dist/ with tsup
npm run dev          # rebuild on change
node dist/cli.js <url>
npm run typecheck
```

To try it as a global command without publishing: `npm link`, then run
`yoinks` anywhere.

## Roadmap

See [ROADMAP.md](ROADMAP.md).

## A note on fair use

yoinks is a personal-archiving tool. Downloading content may violate a
platform's terms of service — only download what you have the right to
keep, and be excellent to creators.

## License

[MIT](LICENSE)
